import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Dépôt public d'une demande d'accès par une école candidate.
 *
 * ---------------------------------------------------------------------
 * CE QUE CETTE ROUTE NE FAIT PAS
 *
 * Elle ne crée AUCUN compte, AUCUNE école, AUCUNE autorisation. Elle
 * pose une ligne « en attente » dans une file, et rien d'autre. La
 * création d'un établissement reste fermée derrière une autorisation
 * nominative à usage unique, émise à la main par l'exploitant.
 *
 * C'est ce qui distingue une demande d'accès d'une inscription publique.
 * ---------------------------------------------------------------------
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_CHIFFRES = 8

function texte(valeur: unknown) {
  return typeof valeur === "string" ? valeur.trim() : ""
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const schoolName = texte(body.schoolName)
    const contactName = texte(body.contactName)
    const phone = texte(body.phone)
    const email = texte(body.email).toLowerCase()
    const message = texte(body.message)

    if (!schoolName || !contactName || !phone || !email) {
      return NextResponse.json(
        {
          error:
            "Le nom de l'école, le contact, le numéro et l'adresse email sont obligatoires.",
        },
        { status: 400 }
      )
    }

    if (phone.replace(/\D/g, "").length < MIN_CHIFFRES) {
      return NextResponse.json(
        { error: "Le numéro doit comporter au moins 8 chiffres." },
        { status: 400 }
      )
    }

    /*
     * L'adresse est vérifiée ici parce que l'autorisation émise à
     * l'approbation est NOMINATIVE PAR EMAIL : une adresse mal saisie
     * produirait une autorisation que personne ne pourrait réclamer.
     */
    if (!EMAIL.test(email)) {
      return NextResponse.json(
        { error: `L'adresse « ${email} » n'est pas valide.` },
        { status: 400 }
      )
    }

    /*
     * Une demande déjà en attente pour la même adresse ne se dédouble
     * pas : on répond comme si elle venait d'être reçue. Dire « vous
     * avez déjà demandé » transformerait la page en moyen de savoir qui
     * a candidaté.
     */
    const { data: existante } = await supabaseAdmin
      .from("school_access_requests")
      .select("id")
      .ilike("email", email)
      .eq("status", "en_attente")
      .maybeSingle()

    if (existante) {
      return NextResponse.json({ recue: true }, { status: 201 })
    }

    const { error } = await supabaseAdmin
      .from("school_access_requests")
      .insert({
        school_name: schoolName,
        contact_name: contactName,
        phone,
        email,
        message: message || null,
      })

    if (error) {
      console.error("Erreur dépôt de la demande :", error)

      return NextResponse.json(
        { error: "Votre demande n'a pas pu être enregistrée. Réessayez." },
        { status: 500 }
      )
    }

    return NextResponse.json({ recue: true }, { status: 201 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
