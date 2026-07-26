import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import {
  requireManageableTarget,
  requireSchoolAdmin,
} from "@/src/lib/apiAuth"

/*
 * Modifie le rôle et/ou l'état actif d'un compte de l'école.
 *
 * Désactiver ne se limite pas à profiles.is_active : le compte est aussi
 * banni côté Auth, sinon l'utilisateur resterait capable de se connecter.
 */

// Bannissement de très longue durée = désactivation, levée par "none".
const BAN_DURATION = "876000h"
const UNBAN_DURATION = "none"

const ALLOWED_ROLES = ["admin", "teacher"]

export async function PATCH(
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

    const body = await request.json()
    const { role, isActive } = body

    if (role === undefined && isActive === undefined) {
      return NextResponse.json(
        { error: "Aucune modification demandée." },
        { status: 400 }
      )
    }

    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Rôle invalide. Valeurs acceptées : admin, teacher." },
        { status: 400 }
      )
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "L'état actif doit être un booléen." },
        { status: 400 }
      )
    }

    /*
     * L'opération Auth passe en premier : si elle réussit et que la mise à
     * jour du profil échoue, un compte désactivé reste bloqué à la connexion
     * (échec sûr) plutôt que l'inverse.
     */
    if (isActive !== undefined) {
      const { error: banError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: isActive ? UNBAN_DURATION : BAN_DURATION,
        })

      if (banError) {
        console.error("Erreur mise à jour Auth :", banError)

        return NextResponse.json(
          {
            error: isActive
              ? "Impossible de rétablir l'accès de ce compte."
              : "Impossible de révoquer l'accès de ce compte.",
          },
          { status: 500 }
        )
      }
    }

    const updates: { role?: string; is_active?: boolean } = {}

    if (role !== undefined) {
      updates.role = role
    }

    if (isActive !== undefined) {
      updates.is_active = isActive
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .eq("school_id", guard.context.schoolId)

    if (updateError) {
      console.error("Erreur mise à jour du profil :", updateError)

      return NextResponse.json(
        {
          error:
            "L'accès a été mis à jour, mais le profil n'a pas pu être enregistré. Réessayez.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
