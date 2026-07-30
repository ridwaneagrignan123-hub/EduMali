import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"

/*
 * « Inviter à se connecter » — ouvre un compte pour une fiche EXISTANTE.
 *
 * ---------------------------------------------------------------------
 * CE N'EST PLUS LE CHEMIN D'ENREGISTREMENT
 *
 * Cette route créait autrefois le compte, le profil ET la fiche
 * enseignant d'un seul geste. Créer un compte impose un email unique au
 * monde : un enseignant déjà enregistré dans une autre école était donc
 * refusé, et l'email devenait obligatoire pour tous — y compris pour les
 * vacataires qui ne se connecteront jamais.
 *
 * L'enregistrement vit désormais dans POST /api/teachers, qui ne touche
 * pas à l'authentification. Cette route-ci ne sert plus qu'au cas
 * particulier de l'enseignant qui doit SAISIR SES NOTES : elle rattache
 * un compte à une fiche déjà là. C'est le seul endroit de l'application
 * où l'authentification intervient pour un enseignant, et le seul où un
 * email est exigé.
 * ---------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------
 * POURQUOI CETTE ROUTE RENVOIE UN LIEN
 *
 * Elle se contentait d'appeler inviteUserByEmail() et d'annoncer
 * « Invitation envoyée ». Or Supabase répond 200 dès qu'il a accepté la
 * demande, pas quand le message est arrivé : sa messagerie intégrée
 * (noreply@mail.app.supabase.io) ne dessert que les membres de
 * l'organisation Supabase et plafonne à quelques envois par heure. Un
 * enseignant ne recevait donc rien, pendant que l'écran affichait un
 * succès.
 *
 * On renvoie désormais aussi un lien d'accès, obtenu sans passer par la
 * messagerie. L'administrateur peut le transmettre de la main à la main,
 * par WhatsApp ou par SMS — ce qui correspond de toute façon mieux à
 * l'usage réel qu'un courriel.
 * ---------------------------------------------------------------------
 */

/*
 * Supabase n'accepte une destination que si elle figure dans les URL de
 * redirection autorisées du projet. Sinon il la remplace silencieusement
 * par l'URL du site, sans le signaler.
 */
function resolveSiteOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL

  if (configured) {
    return configured.replace(/\/$/, "")
  }

  const originHeader = request.headers.get("origin")

  if (originHeader) {
    return originHeader.replace(/\/$/, "")
  }

  return new URL(request.url).origin
}

/*
 * Distingue un refus d'acheminement d'une vraie erreur de création. Dans
 * le premier cas le compte doit quand même être créé : sans quoi une
 * limite d'envoi — deux messages par heure — empêcherait d'inscrire le
 * troisième enseignant de la journée.
 */
function isMailDeliveryFailure(error: { code?: string; status?: number }) {
  const mailCodes = [
    "over_email_send_rate_limit",
    "email_address_invalid",
    "unexpected_failure",
  ]

  return (
    (error.code && mailCodes.includes(error.code)) ||
    error.status === 429 ||
    error.status === 500
  )
}

export async function POST(request: Request) {
  try {
    const guard = await requirePermission(request, "enseignants.gerer")

    if (!guard.ok) {
      return guard.response
    }

    const { schoolId } = guard.context

    const body = await request.json()
    const { email, teacherId } = body

    if (!teacherId) {
      return NextResponse.json(
        { error: "Enseignant cible manquant." },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json(
        {
          error:
            "L'email est obligatoire pour ouvrir un accès : c'est l'identifiant de connexion.",
        },
        { status: 400 }
      )
    }

    /*
     * La fiche doit exister et appartenir à l'école de l'appelant. Le
     * filtre sur school_id est la seule frontière : la clé service role
     * contourne le RLS.
     */
    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("id, first_name, last_name, phone, profile_id")
      .eq("id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle()

    if (teacherError) {
      console.error("Erreur lecture de l'enseignant :", teacherError)

      return NextResponse.json(
        { error: "Impossible de lire la fiche de cet enseignant." },
        { status: 500 }
      )
    }

    if (!teacher) {
      return NextResponse.json(
        { error: "Cet enseignant n'appartient pas à votre établissement." },
        { status: 404 }
      )
    }

    if (teacher.profile_id) {
      return NextResponse.json(
        {
          error:
            "Cet enseignant a déjà un accès. Renvoyez-lui un lien depuis la page Comptes utilisateurs.",
        },
        { status: 409 }
      )
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const redirectTo = `${resolveSiteOrigin(request)}/update-password`

    const metadata = {
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      role: "teacher",
    }

    let teacherUserId: string
    let accessLink: string | null = null
    let emailAttempted = true
    let deliveryNote: string | null = null

    const { data: invited, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: metadata,
        redirectTo,
      })

    if (inviteError) {
      if (!isMailDeliveryFailure(inviteError)) {
        console.error("Erreur invitation :", inviteError)

        return NextResponse.json(
          { error: inviteError.message },
          { status: 400 }
        )
      }

      /*
       * La messagerie a refusé, mais le compte doit exister quand même.
       * generateLink crée l'utilisateur sans tenter le moindre envoi.
       */
      const { data: generated, error: generateError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email: normalizedEmail,
          options: { data: metadata, redirectTo },
        })

      if (generateError || !generated?.user) {
        console.error("Erreur création du compte :", generateError)

        return NextResponse.json(
          {
            error:
              "Le compte enseignant n'a pas pu être créé : " +
              (generateError?.message ?? "raison inconnue"),
          },
          { status: 400 }
        )
      }

      teacherUserId = generated.user.id
      accessLink = generated.properties?.action_link ?? null
      emailAttempted = false
      deliveryNote = inviteError.message
    } else {
      if (!invited.user) {
        return NextResponse.json(
          { error: "Le compte enseignant n'a pas pu être créé." },
          { status: 500 }
        )
      }

      teacherUserId = invited.user.id

      /*
       * Lien de secours, à transmettre si le courriel n'arrive pas.
       * Le jeton de récupération est distinct de celui de l'invitation :
       * en produire un ici n'invalide pas le lien contenu dans le mail.
       */
      const { data: generated, error: generateError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: normalizedEmail,
          options: { redirectTo },
        })

      if (generateError) {
        // Sans gravité : le compte existe, le lien pourra être redemandé.
        console.error("Erreur génération du lien d'accès :", generateError)
      }

      accessLink = generated?.properties?.action_link ?? null
    }

    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: teacherUserId,
        school_id: schoolId,
        first_name: metadata.first_name,
        last_name: metadata.last_name,
        role: "teacher",
        phone: teacher.phone,
      })

    if (profileInsertError) {
      console.error("Erreur création profil :", profileInsertError)

      return NextResponse.json(
        {
          error:
            "Le compte a été créé, mais le profil enseignant n'a pas pu être créé.",
          details: profileInsertError.message,
          code: profileInsertError.code,
          hint: profileInsertError.hint,
        },
        { status: 500 }
      )
    }

    /*
     * On RATTACHE le compte à la fiche existante — on n'en crée plus.
     * L'email est reporté sur la fiche : c'est l'identifiant de
     * connexion, et l'y voir évite de chercher dans les comptes.
     */
    const { error: teacherLinkError } = await supabaseAdmin
      .from("teachers")
      .update({
        profile_id: teacherUserId,
        email: normalizedEmail,
      })
      .eq("id", teacher.id)
      .eq("school_id", schoolId)

    if (teacherLinkError) {
      console.error("Erreur rattachement de la fiche :", teacherLinkError)

      return NextResponse.json(
        {
          error:
            "Le compte a été créé, mais il n'a pas pu être rattaché à la fiche enseignant.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        email: normalizedEmail,
        emailAttempted,
        deliveryNote,
        accessLink,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
