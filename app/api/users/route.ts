import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"

/*
 * Liste les comptes de l'école de l'admin appelant.
 *
 * Les emails et l'état d'invitation vivent dans auth.users, pas dans
 * profiles : on complète donc les profils avec les données Auth.
 */

const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 20

type AuthInfo = {
  email: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  bannedUntil: string | null
}

/*
 * listUsers() parcourt tous les comptes du projet Supabase, toutes écoles
 * confondues : on s'arrête dès que les identifiants recherchés sont résolus.
 * À surveiller si le nombre total d'écoles devient important.
 */
async function loadAuthInfoByUserId(userIds: string[]) {
  const wanted = new Set(userIds)
  const found = new Map<string, AuthInfo>()

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    })

    if (error) {
      console.error("Erreur listUsers :", error)
      return found
    }

    const users = data.users ?? []

    for (const authUser of users) {
      if (!wanted.has(authUser.id)) {
        continue
      }

      found.set(authUser.id, {
        email: authUser.email ?? null,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        emailConfirmedAt: authUser.email_confirmed_at ?? null,
        bannedUntil:
          (authUser as { banned_until?: string }).banned_until ?? null,
      })
    }

    if (found.size >= wanted.size || users.length < AUTH_USERS_PAGE_SIZE) {
      break
    }
  }

  return found
}

export async function GET(request: Request) {
  try {
    const guard = await requirePermission(request, "comptes.consulter")

    if (!guard.ok) {
      return guard.response
    }

    const { context } = guard

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, last_name, role, phone, is_active, created_at, direction_id, filiere, cycle"
      )
      .eq("school_id", context.schoolId)
      .order("last_name", { ascending: true })

    if (profilesError) {
      console.error("Erreur lecture des profils :", profilesError)

      return NextResponse.json(
        { error: "Impossible de charger la liste des comptes." },
        { status: 500 }
      )
    }

    const rows = profiles ?? []

    const authInfoByUserId = await loadAuthInfoByUserId(
      rows.map((row) => row.id)
    )

    const now = Date.now()

    const users = rows.map((row) => {
      const authInfo = authInfoByUserId.get(row.id) ?? null

      const isBanned =
        authInfo?.bannedUntil != null &&
        new Date(authInfo.bannedUntil).getTime() > now

      return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        directionId: row.direction_id,
        filiere: row.filiere,
        cycle: row.cycle,
        phone: row.phone,
        isActive: row.is_active,
        createdAt: row.created_at,
        email: authInfo?.email ?? null,
        lastSignInAt: authInfo?.lastSignInAt ?? null,
        // Jamais connecté : l'invitation n'a pas encore été acceptée.
        hasSignedIn: Boolean(authInfo?.lastSignInAt),
        isBanned,
        // Un admin ne peut pas agir sur son propre compte.
        isSelf: row.id === context.userId,
      }
    })

    return NextResponse.json({ users }, { status: 200 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
