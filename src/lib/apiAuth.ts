import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Garde d'authentification partagé par les routes serveur d'administration.
 *
 * Même logique que app/api/teachers/invite/route.ts :
 * on valide le jeton porteur avec la clé anon, puis on relit le profil
 * avec la clé service role pour connaître le rôle et l'école de l'appelant.
 *
 * L'école retournée ici est la SEULE frontière de sécurité des routes
 * appelantes : la clé service role contourne le RLS, donc chaque requête
 * doit être filtrée explicitement sur ce school_id.
 */

export type SchoolAdminContext = {
  userId: string
  schoolId: string
}

type GuardResult =
  | { ok: true; context: SchoolAdminContext }
  | { ok: false; response: NextResponse }

export async function requireSchoolAdmin(
  request: Request
): Promise<GuardResult> {
  const authorization = request.headers.get("Authorization")

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Utilisateur non authentifié." },
        { status: 401 }
      ),
    }
  }

  const accessToken = authorization.replace("Bearer ", "")

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Session utilisateur invalide." },
        { status: 401 }
      ),
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("school_id, role, is_active")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Profil introuvable." },
        { status: 403 }
      ),
    }
  }

  if (profile.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Seuls les administrateurs peuvent gérer les comptes utilisateurs.",
        },
        { status: 403 }
      ),
    }
  }

  // Un admin désactivé ne doit plus pouvoir administrer les autres comptes.
  if (profile.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Votre compte est désactivé." },
        { status: 403 }
      ),
    }
  }

  if (!profile.school_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Votre compte n'est associé à aucun établissement." },
        { status: 400 }
      ),
    }
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      schoolId: profile.school_id,
    },
  }
}

/*
 * Vérifie que le compte ciblé appartient bien à l'école de l'admin appelant
 * et qu'il ne s'agit pas de l'admin lui-même.
 *
 * L'auto-protection est appliquée ici, côté serveur : l'UI la double, mais
 * c'est cette vérification qui fait foi.
 */
export async function requireManageableTarget(
  context: SchoolAdminContext,
  targetUserId: string
): Promise<
  | { ok: true; target: { id: string; role: string | null; is_active: boolean } }
  | { ok: false; response: NextResponse }
> {
  if (!targetUserId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Compte cible manquant." },
        { status: 400 }
      ),
    }
  }

  if (targetUserId === context.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Vous ne pouvez pas modifier votre propre compte depuis cette page.",
        },
        { status: 403 }
      ),
    }
  }

  const { data: target, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active, school_id")
    .eq("id", targetUserId)
    .eq("school_id", context.schoolId)
    .maybeSingle()

  if (error) {
    console.error("Erreur lecture du compte cible :", error)

    return {
      ok: false,
      response: NextResponse.json(
        { error: "Impossible de lire le compte ciblé." },
        { status: 500 }
      ),
    }
  }

  if (!target) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ce compte n'appartient pas à votre établissement." },
        { status: 404 }
      ),
    }
  }

  return {
    ok: true,
    target: {
      id: target.id,
      role: target.role,
      is_active: target.is_active,
    },
  }
}
