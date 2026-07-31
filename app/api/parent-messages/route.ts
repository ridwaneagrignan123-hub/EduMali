import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { can } from "@/src/lib/roles"
import { sendWhatsApp } from "@/src/lib/whatsapp"

/*
 * Met un message dans la FILE D'ENVOI aux parents.
 *
 * ---------------------------------------------------------------------
 * POURQUOI UNE ROUTE SERVEUR
 *
 * Le message part au nom de l'école. Deux choses doivent donc être
 * imposées et non demandées au navigateur : QUI l'a déclenché — le
 * déclencheur sms_logs_auteur écrase recorded_by depuis auth.uid() — et
 * CE QUE dit le message, composé ici à partir de l'événement, jamais
 * d'un texte libre venu du client.
 *
 * C'est aussi ce qui permet à un ENSEIGNANT de prévenir le parent de son
 * élève : la policy d'écriture de sms_logs est réservée à l'encadrement,
 * mais la clé service role passe outre — après le contrôle de permission
 * fait ici.
 * ---------------------------------------------------------------------
 *
 * L'ENVOI N'EST PAS SIMULÉ. La ligne naît « en_attente ». Elle ne passe
 * à « sent » que si sendWhatsApp() rapporte qu'un fournisseur a accepté
 * le message. Sans fournisseur configuré, elle reste en attente — et
 * l'écran le dit, plutôt que d'annoncer un envoi qui n'a pas eu lieu.
 */

type TypeEvenement =
  | "absence"
  | "retard"
  | "retenue"
  | "violation_reglement"

const TYPES_ADMIS: TypeEvenement[] = [
  "absence",
  "retard",
  "retenue",
  "violation_reglement",
]

function texteDuMessage(
  type: TypeEvenement,
  ecole: string,
  eleve: string,
  details: Record<string, unknown>
) {
  const date =
    typeof details.date === "string" && details.date
      ? new Date(details.date).toLocaleDateString("fr-FR")
      : ""

  const matiere =
    typeof details.matiere === "string" ? details.matiere : ""

  if (type === "absence") {
    // La leçon n'existe qu'au second cycle et au lycée : au premier
    // cycle l'absence porte sur la journée entière.
    return matiere
      ? `Bonjour, votre enfant ${eleve} a manqué la leçon de ${matiere} du ${date} à ${ecole}.`
      : `Bonjour, votre enfant ${eleve} a été absent(e) le ${date} à ${ecole}.`
  }

  if (type === "retard") {
    return matiere
      ? `Bonjour, votre enfant ${eleve} est arrivé(e) en retard à la leçon de ${matiere} du ${date} à ${ecole}.`
      : `Bonjour, votre enfant ${eleve} est arrivé(e) en retard le ${date} à ${ecole}.`
  }

  if (type === "retenue") {
    const motif = typeof details.motif === "string" ? details.motif : ""

    return `Bonjour, votre enfant ${eleve} a été mis(e) en retenue le ${date} à ${ecole}${
      motif ? ` — motif : ${motif}` : ""
    }.`
  }

  const regle = typeof details.regle === "string" ? details.regle : ""
  const note = typeof details.note === "string" ? details.note : ""

  return `Bonjour, votre enfant ${eleve} n'a pas respecté le règlement intérieur de ${ecole} le ${date}${
    regle ? ` — règle concernée : ${regle}` : ""
  }${note ? `. ${note}` : "."}`
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié." },
        { status: 401 }
      )
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Session utilisateur invalide." },
        { status: 401 }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.school_id) {
      return NextResponse.json(
        { error: "Profil introuvable." },
        { status: 403 }
      )
    }

    /*
     * Prévenir une famille relève du suivi de l'élève. « notes.saisir »
     * ouvre la porte à l'enseignant, qui marque les absences de sa
     * leçon ; « vie_scolaire.tenir » à l'encadrement et au surveillant.
     */
    if (
      !can(profile.role, "vie_scolaire.tenir") &&
      !can(profile.role, "notes.saisir")
    ) {
      return NextResponse.json(
        { error: "Votre rôle ne permet pas d'écrire aux parents." },
        { status: 403 }
      )
    }

    const body = await request.json()
    const type = body.eventType as TypeEvenement

    if (!body.studentId || !TYPES_ADMIS.includes(type)) {
      return NextResponse.json(
        { error: "Élève ou type d'événement manquant." },
        { status: 400 }
      )
    }

    const { data: eleve } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_name, parent_phone")
      .eq("id", body.studentId)
      .eq("school_id", profile.school_id)
      .maybeSingle()

    if (!eleve) {
      return NextResponse.json(
        { error: "Cet élève n'appartient pas à votre établissement." },
        { status: 404 }
      )
    }

    /*
     * Le cas le plus fréquent, et celui qui doit être dit clairement :
     * sans numéro, l'action ne peut pas aboutir. On refuse plutôt que
     * d'enregistrer un message qui ne partira jamais.
     */
    if (!eleve.parent_phone?.trim()) {
      return NextResponse.json(
        {
          error: `Aucun numéro parent enregistré pour ${eleve.first_name} ${eleve.last_name}. Ajoutez-le sur sa fiche élève.`,
        },
        { status: 400 }
      )
    }

    const { data: ecole } = await supabaseAdmin
      .from("schools")
      .select("name")
      .eq("id", profile.school_id)
      .maybeSingle()

    const texte = texteDuMessage(
      type,
      ecole?.name || "votre établissement",
      `${eleve.first_name} ${eleve.last_name}`,
      body.details ?? {}
    )

    const { data: ligne, error: insertError } = await supabaseAdmin
      .from("sms_logs")
      .insert({
        school_id: profile.school_id,
        student_id: eleve.id,
        event_type: type,
        related_id: body.relatedId || null,
        channel: "whatsapp",
        parent_name: eleve.parent_name,
        phone: eleve.parent_phone,
        message: texte,
        // Le déclencheur l'impose de toute façon : on l'écrit pour que
        // la lecture du code n'ait pas à le deviner.
        status: "en_attente",
        recorded_by: user.id,
      })
      .select("id")
      .single()

    if (insertError || !ligne) {
      console.error("Erreur mise en file :", insertError)

      return NextResponse.json(
        { error: "Le message n'a pas pu être enregistré." },
        { status: 500 }
      )
    }

    const resultat = await sendWhatsApp({
      phone: eleve.parent_phone,
      texte,
    })

    /*
     * On ne touche à la ligne que si l'adaptateur a réellement conclu.
     * « en_attente » est déjà son état : le réécrire ne dirait rien de
     * plus, et masquerait le fait qu'aucune tentative n'a eu lieu.
     */
    if (resultat.statut !== "en_attente") {
      await supabaseAdmin
        .from("sms_logs")
        .update({
          status: resultat.statut,
          provider_message_id:
            resultat.statut === "sent" ? resultat.providerMessageId : null,
          error_message:
            resultat.statut === "failed" ? resultat.erreur : null,
        })
        .eq("id", ligne.id)
    }

    return NextResponse.json(
      {
        id: ligne.id,
        statut: resultat.statut,
        message: texte,
        destinataire: eleve.parent_phone,
        raison: resultat.statut === "en_attente" ? resultat.raison : null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
