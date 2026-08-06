import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { can } from "@/src/lib/roles"
import { sendWhatsApp } from "@/src/lib/whatsapp"
import {
  TypeEvenement,
  composerMessage,
  dateDuMessage,
  langueDuMessage,
} from "@/src/lib/messages-parents"

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

const TYPES_ADMIS: TypeEvenement[] = [
  "absence",
  "retard",
  "retenue",
  "violation_reglement",
]

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
     * leçon ; « surveillance.tenir » à l'encadrement et au surveillant.
     */
    if (
      !can(profile.role, "surveillance.tenir") &&
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
      .select("name, default_language, school_type")
      .eq("id", profile.school_id)
      .maybeSingle()

    /*
     * LA FILIÈRE VIENT DE LA BASE, PAS DU CORPS DE LA REQUÊTE.
     *
     * Le client nomme une MATIÈRE (`subjectId`), jamais une langue. Il ne
     * peut donc pas choisir dans quelle langue partira le message : il
     * peut seulement désigner une matière, qui doit appartenir à son
     * école. La filière — et donc la langue — se lit ici.
     */
    let filiereMatiere: unknown = null

    if (body.subjectId) {
      const { data: matiere } = await supabaseAdmin
        .from("subjects")
        .select("filiere")
        .eq("id", body.subjectId)
        .eq("school_id", profile.school_id)
        .maybeSingle()

      filiereMatiere = matiere?.filiere ?? null
    }

    const langue = langueDuMessage({
      langueEcole: ecole?.default_language,
      typeEcole: ecole?.school_type,
      filiereMatiere,
    })

    const details = (body.details ?? {}) as Record<string, unknown>

    const texte = composerMessage(
      langue,
      type,
      `${eleve.first_name} ${eleve.last_name}`,
      ecole?.name || "votre établissement",
      {
        date: dateDuMessage(
          typeof details.date === "string" ? details.date : "",
          langue
        ),
        matiere: typeof details.matiere === "string" ? details.matiere : undefined,
        motif: typeof details.motif === "string" ? details.motif : undefined,
        regle: typeof details.regle === "string" ? details.regle : undefined,
        note: typeof details.note === "string" ? details.note : undefined,
      }
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
        /*
         * La langue est enregistrée AVEC le texte : sans elle, un message
         * arabe et un message français seraient indistinguables dans la
         * file, et rejouer un envoi obligerait à deviner.
         */
        language: langue,
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

    /*
     * Les trois paramètres du modèle Meta, DANS CET ORDRE et pour tous
     * les événements : nom de l'élève, détail, nom de l'école. Un ordre
     * unique permet de déposer sept modèles bâtis sur le même squelette,
     * et d'en ajouter un huitième sans toucher au code.
     *
     * Le « détail » est le texte déjà composé dans la langue de la
     * famille : c'est lui qui porte la date, la matière, le motif.
     */
    const resultat = await sendWhatsApp({
      phone: eleve.parent_phone,
      texte,
      evenement: type,
      langue,
      parametres: [
        `${eleve.first_name} ${eleve.last_name}`,
        texte,
        ecole?.name || "votre établissement",
      ],
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
