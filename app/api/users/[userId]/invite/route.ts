import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import {
  requireManageableTarget,
  requireSchoolAdmin,
} from "@/src/lib/apiAuth"

/*
 * Renvoie un lien d'accès à un compte existant : celui qui n'a jamais
 * défini de mot de passe, ou celui qui l'a perdu.
 *
 * Note : on n'utilise pas inviteUserByEmail() ici, contrairement à
 * app/api/teachers/invite/route.ts. Cette méthode crée le compte Auth et
 * échoue si l'email est déjà enregistré — ce qui est toujours le cas ici,
 * puisque le profil existe. On envoie donc un lien de récupération, qui
 * couvre les deux situations.
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    const guard = await requireSchoolAdmin(request)

    if (!guard.ok) {
      return guard.response
    }

    const targetGuard = await requireManageableTarget(guard.context, userId)

    if (!targetGuard.ok) {
      return targetGuard.response
    }

    const { data: authUser, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId)

    if (authUserError || !authUser?.user?.email) {
      console.error("Erreur lecture du compte Auth :", authUserError)

      return NextResponse.json(
        { error: "Aucune adresse email n'est associée à ce compte." },
        { status: 400 }
      )
    }

    if (targetGuard.target.is_active === false) {
      return NextResponse.json(
        {
          error:
            "Ce compte est désactivé. Réactivez-le avant de renvoyer un lien d'accès.",
        },
        { status: 400 }
      )
    }

    const { error: recoveryError } =
      await supabaseAdmin.auth.resetPasswordForEmail(authUser.user.email, {
        redirectTo: `${resolveSiteOrigin(request)}/update-password`,
      })

    if (recoveryError) {
      console.error("Erreur envoi du lien d'accès :", recoveryError)

      return NextResponse.json(
        { error: "Impossible d'envoyer le lien d'accès. Réessayez." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        email: authUser.user.email,
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
