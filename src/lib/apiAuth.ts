import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import {
  Permission,
  can,
  canAssignRole,
  roleLabel,
} from "@/src/lib/roles"

/*
 * Garde d'authentification partagé par les routes serveur.
 *
 * On valide le jeton porteur avec la clé anon, puis on relit le profil
 * avec la clé service role pour connaître le rôle et l'école de l'appelant.
 *
 * L'école retournée ici est la SEULE frontière de sécurité des routes
 * appelantes : la clé service role contourne le RLS, donc chaque requête
 * doit être filtrée explicitement sur ce school_id.
 *
 * ---------------------------------------------------------------------
 * ICI, LA MATRICE DE src/lib/roles.ts FAIT FOI
 *
 * Ces routes écrivent avec la clé service role, qui passe outre le RLS.
 * Aucune policy ne les rattrapera : requirePermission() est leur unique
 * barrière. Élargir une permission dans PERMISSIONS ouvre donc vraiment
 * l'accès, contrairement à ce qui se passe côté navigateur.
 * ---------------------------------------------------------------------
 */

export type SchoolAdminContext = {
  userId: string
  schoolId: string
  role: string
}

type GuardResult =
  | { ok: true; context: SchoolAdminContext }
  | { ok: false; response: NextResponse }

/**
 * Exige que l'appelant détienne `permission`.
 *
 * Remplace un contrôle de rôle codé en dur, qui refusait la
 * page « Comptes utilisateurs » au promoteur — pourtant propriétaire de
 * l'établissement — et l'invitation d'un enseignant à tout l'encadrement.
 */
export async function requirePermission(
  request: Request,
  permission: Permission
): Promise<GuardResult> {
  return authenticate(request, permission)
}

/**
 * Conservé pour ce qui doit rester strictement administrateur : les
 * paramètres de l'établissement. Ce n'est plus un contrôle distinct,
 * seulement le nom lisible d'une permission.
 */
export async function requireSchoolAdmin(
  request: Request
): Promise<GuardResult> {
  return authenticate(request, "parametres.gerer")
}

async function authenticate(
  request: Request,
  permission: Permission
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

  if (!can(profile.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Votre rôle (${roleLabel(profile.role)}) ne permet pas cette action.`,
        },
        { status: 403 }
      ),
    }
  }

  // Un compte désactivé ne doit plus rien pouvoir administrer.
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
      role: profile.role ?? "",
    },
  }
}

/*
 * Plafond d'attribution des rôles.
 *
 * Sans lui, un directeur général — écarté des finances — pourrait se
 * donner un complice administrateur et lire par ce détour tout ce qui
 * lui est fermé, ou désactiver l'administrateur en place. Le contrôle
 * porte donc sur DEUX rôles : celui qu'on veut attribuer, et celui que
 * la cible porte déjà. Le second compte autant : rétrograder un
 * administrateur est aussi une prise de pouvoir.
 */
export function forbidRoleEscalation(
  context: SchoolAdminContext,
  roleActuelDeLaCible: string | null,
  roleDemande: string | null | undefined
): NextResponse | null {
  if (!canAssignRole(context.role, roleActuelDeLaCible)) {
    return NextResponse.json(
      {
        error: `Ce compte porte le rôle « ${roleLabel(roleActuelDeLaCible)} », que votre rôle ne permet pas de modifier.`,
      },
      { status: 403 }
    )
  }

  if (roleDemande !== undefined && !canAssignRole(context.role, roleDemande)) {
    return NextResponse.json(
      {
        error: `Votre rôle ne permet pas d'attribuer « ${roleLabel(roleDemande)} ».`,
      },
      { status: 403 }
    )
  }

  return null
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
