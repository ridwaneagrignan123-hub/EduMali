import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { can } from "@/src/lib/roles"
import { sendWhatsApp } from "@/src/lib/whatsapp"
import {
  composerMessage,
  dateDuMessage,
  langueDuMessage,
} from "@/src/lib/messages-parents"

/*
 * Met le devoir dans la FILE D'ENVOI, un message par parent.
 *
 * ---------------------------------------------------------------------
 * LA MÊME MÉCANIQUE QUE /api/parent-messages, PAS UNE SECONDE
 *
 * Même contrôle de permission, même insertion dans `sms_logs` à
 * « en_attente », même adaptateur unique, même règle : la ligne ne
 * quitte « en_attente » que si sendWhatsApp() rapporte qu'un
 * fournisseur a réellement accepté le message. Ce qui change ici, et
 * seulement cela : la boucle sur l'effectif de la classe.
 *
 * Aucun envoi n'est simulé. Sans fournisseur configuré, les lignes
 * restent en attente et la réponse le dit.
 * ---------------------------------------------------------------------
 *
 * LA PHOTO PART EN LIEN, PAS EN PIÈCE JOINTE
 *
 * Le bucket est public en lecture précisément pour cela : le parent
 * ouvre le lien sans compte. Joindre l'image demanderait un message
 * média sur un modèle approuvé par WhatsApp Business — une capacité à
 * ajouter le jour où un fournisseur sera branché, pas à bricoler ici.
 */

/** Ce qu'on lit du devoir pour composer le message. */
type Devoir = {
  id: string
  school_id: string
  class_id: string
  due_date: string
  page: string | null
  exercises: string | null
  instructions: string | null
  photo_url: string | null
  classes: { name: string } | null
  subjects: { name: string; filiere: string | null } | null
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

    // Le même contrôle que pour les autres messages aux parents :
    // l'enseignant par « notes.saisir », l'encadrement par
    // « surveillance.tenir ».
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

    if (!body.homeworkId) {
      return NextResponse.json(
        { error: "Devoir manquant." },
        { status: 400 }
      )
    }

    const { data: devoir } = await supabaseAdmin
      .from("homework")
      .select(
        `id, school_id, class_id, due_date, page, exercises, instructions,
         photo_url, classes ( name ), subjects ( name, filiere )`
      )
      .eq("id", body.homeworkId)
      .eq("school_id", profile.school_id)
      .maybeSingle<Devoir>()

    if (!devoir) {
      return NextResponse.json(
        { error: "Ce devoir n'appartient pas à votre établissement." },
        { status: 404 }
      )
    }

    /*
     * L'année active borne l'effectif. Sans elle on écrirait aussi aux
     * familles des élèves passés par la classe les années précédentes.
     * On refuse plutôt que d'envoyer trop large : le message est déjà
     * enregistré, il partira dès l'année posée.
     */
    const { data: annee } = await supabaseAdmin
      .from("academic_years")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("is_active", true)
      .maybeSingle()

    if (!annee) {
      return NextResponse.json(
        {
          error:
            "Aucune année scolaire active. Activez-en une dans Année scolaire avant d'écrire aux parents.",
        },
        { status: 400 }
      )
    }

    const { data: inscriptions, error: inscriptionsError } =
      await supabaseAdmin
        .from("student_class_enrollments")
        .select(
          "students ( id, first_name, last_name, parent_name, parent_phone )"
        )
        .eq("school_id", profile.school_id)
        .eq("class_id", devoir.class_id)
        .eq("academic_year_id", annee.id)

    if (inscriptionsError) {
      console.error("Erreur effectif :", inscriptionsError)

      return NextResponse.json(
        { error: "L'effectif de la classe n'a pas pu être lu." },
        { status: 500 }
      )
    }

    const eleves = (inscriptions ?? [])
      .map(
        (ligne) =>
          (ligne as unknown as {
            students: {
              id: string
              first_name: string
              last_name: string
              parent_name: string | null
              parent_phone: string | null
            } | null
          }).students
      )
      .filter((eleve): eleve is NonNullable<typeof eleve> => eleve !== null)

    if (eleves.length === 0) {
      return NextResponse.json(
        { error: "Aucun élève inscrit dans cette classe cette année." },
        { status: 400 }
      )
    }

    /*
     * Sans numéro parent, on IGNORE l'élève au lieu de refuser tout
     * l'envoi. Une classe entière ne peut pas rester sans message parce
     * qu'une fiche est incomplète — mais le compte des ignorés remonte,
     * pour que l'administration sache quelles fiches compléter.
     */
    const destinataires = eleves.filter((eleve) =>
      eleve.parent_phone?.trim()
    )

    const ignores = eleves.length - destinataires.length

    if (destinataires.length === 0) {
      return NextResponse.json(
        {
          error: `Aucun des ${eleves.length} élèves de la classe n'a de numéro parent enregistré.`,
        },
        { status: 400 }
      )
    }

    const { data: ecole } = await supabaseAdmin
      .from("schools")
      .select("name, default_language, school_type")
      .eq("id", profile.school_id)
      .maybeSingle()

    const nomEcole = ecole?.name || "votre établissement"

    /*
     * LA FILIÈRE DE LA MATIÈRE DÉCIDE. Un devoir d'arabe part en arabe,
     * un devoir de français en français — dans la même classe, le même
     * jour, aux mêmes familles. C'est le cas où la règle se voit le
     * mieux : la famille reconnaît la matière dont on lui parle.
     *
     * Hors école franco-arabe, ou pour un devoir sans matière, l'école
     * tranche avec sa langue par défaut.
     */
    const langue = langueDuMessage({
      langueEcole: ecole?.default_language,
      typeEcole: ecole?.school_type,
      filiereMatiere: devoir.subjects?.filiere,
    })

    const dateRendu = dateDuMessage(devoir.due_date, langue)

    const { data: lignes, error: insertError } = await supabaseAdmin
      .from("sms_logs")
      .insert(
        destinataires.map((eleve) => ({
          school_id: profile.school_id,
          student_id: eleve.id,
          event_type: "devoir",
          related_id: devoir.id,
          channel: "whatsapp",
          parent_name: eleve.parent_name,
          phone: eleve.parent_phone,
          message: composerMessage(
            langue,
            "devoir",
            `${eleve.first_name} ${eleve.last_name}`,
            nomEcole,
            {
              date: dateRendu,
              classe: devoir.classes?.name ?? undefined,
              matiere: devoir.subjects?.name ?? undefined,
              page: devoir.page ?? undefined,
              exercices: devoir.exercises ?? undefined,
              enonce: devoir.instructions ?? undefined,
              lienPhoto: devoir.photo_url ?? undefined,
            }
          ),
          language: langue,
          // Le déclencheur l'impose de toute façon ; écrit ici pour que
          // la lecture du code n'ait pas à le deviner.
          status: "en_attente",
          recorded_by: user.id,
        }))
      )
      .select("id, phone, message")

    if (insertError || !lignes) {
      console.error("Erreur mise en file :", insertError)

      return NextResponse.json(
        { error: "Les messages n'ont pas pu être enregistrés." },
        { status: 500 }
      )
    }

    /*
     * Une remise par ligne, par le MÊME adaptateur que partout ailleurs.
     * Séquentiel : un fournisseur réel limite le débit, et rien ici ne
     * presse — les lignes sont déjà en file, elles ne se perdent pas.
     */
    let envoyes = 0
    let echecs = 0
    let raison: string | null = null

    for (const ligne of lignes) {
      const resultat = await sendWhatsApp({
        phone: ligne.phone,
        texte: ligne.message,
      })

      if (resultat.statut === "en_attente") {
        // On ne réécrit pas « en_attente » par-dessus « en_attente » :
        // cela masquerait qu'aucune tentative n'a eu lieu.
        raison = raison ?? resultat.raison
        continue
      }

      if (resultat.statut === "sent") {
        envoyes += 1
      } else {
        echecs += 1
      }

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
        enFile: lignes.length,
        ignores,
        envoyes,
        echecs,
        // « sent » seulement si TOUTES les lignes ont abouti. Tant
        // qu'aucun fournisseur n'est branché, aucune n'aboutit.
        statut: envoyes === lignes.length ? "sent" : "en_attente",
        raison,
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
