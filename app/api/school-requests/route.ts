import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Dépôt d'une demande d'accès par une école candidate.
 *
 * ---------------------------------------------------------------------
 * L'ADRESSE VIENT DE LA SESSION, JAMAIS DU FORMULAIRE
 *
 * C'est le point de sécurité de toute la chaîne. L'approbation émet une
 * autorisation NOMINATIVE PAR EMAIL, et cette autorisation est ce qui
 * permet d'ouvrir un établissement. Si l'adresse pouvait être choisie
 * dans le corps de la requête, n'importe qui déposerait une demande au
 * nom d'une autre école et récupérerait le grant à sa place.
 *
 * Elle est donc lue sur `supabaseAuth.auth.getUser()`, qui valide le
 * jeton porteur auprès de Supabase. Le corps du formulaire ne porte que
 * des faits sur l'établissement — jamais l'identité du demandeur.
 *
 * La policy RLS `Depot de sa propre demande` impose la même chose en
 * base, pour le cas où un jour on écrirait sans passer par ici.
 * ---------------------------------------------------------------------
 *
 * Cette route ne crée AUCUN compte, AUCUNE école, AUCUNE autorisation.
 * Elle pose une ligne « en attente », et rien d'autre.
 */

const MIN_CHIFFRES = 8
const TYPES = ["classique", "franco_arabe"]

function texte(valeur: unknown) {
  return typeof valeur === "string" ? valeur.trim() : ""
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Connectez-vous avant de déposer une demande." },
        { status: 401 }
      )
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authorization } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Session invalide. Reconnectez-vous." },
        { status: 401 }
      )
    }

    // L'identité du demandeur : de la session, et de nulle part ailleurs.
    const email = (user.email ?? "").trim().toLowerCase()

    if (!email) {
      return NextResponse.json(
        { error: "Votre compte n'a pas d'adresse email." },
        { status: 400 }
      )
    }

    const body = await request.json()

    const schoolName = texte(body.schoolName)
    const city = texte(body.city)
    const schoolType = texte(body.schoolType)
    const phone = texte(body.phone)
    const promoterName = texte(body.promoterName)

    if (!schoolName || !city || !phone || !promoterName) {
      return NextResponse.json(
        {
          error:
            "Le nom de l'établissement, la ville, le numéro WhatsApp et le nom du promoteur sont obligatoires.",
        },
        { status: 400 }
      )
    }

    if (!TYPES.includes(schoolType)) {
      return NextResponse.json(
        { error: "Choisissez le type d'établissement." },
        { status: 400 }
      )
    }

    if (phone.replace(/\D/g, "").length < MIN_CHIFFRES) {
      return NextResponse.json(
        { error: "Le numéro WhatsApp doit comporter au moins 8 chiffres." },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from("school_access_requests")
      .insert({
        user_id: user.id,
        email,
        school_name: schoolName,
        city,
        school_type: schoolType,
        phone,
        contact_name: promoterName,
      })

    if (error) {
      /*
       * L'index partiel school_access_requests_email_vivante refuse une
       * seconde demande vivante pour la même adresse. C'est le cas du
       * double-clic, et il ne mérite pas une erreur : la demande de
       * l'utilisateur EST enregistrée, c'est tout ce qu'il veut savoir.
       */
      if (error.code === "23505") {
        return NextResponse.json({ recue: true }, { status: 200 })
      }

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
