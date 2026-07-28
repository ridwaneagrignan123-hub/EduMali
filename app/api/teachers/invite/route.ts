import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requireSchoolAdmin } from "@/src/lib/apiAuth"

/*
 * Création d'un compte enseignant.
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
    const guard = await requireSchoolAdmin(request)

    if (!guard.ok) {
      return guard.response
    }

    const { schoolId } = guard.context

    const body = await request.json()
    const { email, firstName, lastName, phone, specialty, hireDate } = body

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Le prénom, le nom et l'email sont obligatoires." },
        { status: 400 }
      )
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const redirectTo = `${resolveSiteOrigin(request)}/update-password`

    const metadata = {
      first_name: String(firstName).trim(),
      last_name: String(lastName).trim(),
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
        phone: phone?.trim() || null,
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

    const { error: teacherInsertError } = await supabaseAdmin
      .from("teachers")
      .insert({
        school_id: schoolId,
        profile_id: teacherUserId,
        first_name: metadata.first_name,
        last_name: metadata.last_name,
        email: normalizedEmail,
        phone: phone?.trim() || null,
        specialty: specialty?.trim() || null,
        hire_date: hireDate || null,
        status: "active",
      })

    if (teacherInsertError) {
      console.error("Erreur création enseignant :", teacherInsertError)

      return NextResponse.json(
        {
          error:
            "Le compte a été créé, mais la fiche enseignant n'a pas pu être créée.",
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
