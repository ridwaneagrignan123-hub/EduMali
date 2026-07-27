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

/*
 * Doit rester aligné sur la contrainte profiles_role_check en base :
 * une valeur absente d'ici passerait le contrôle applicatif mais serait
 * rejetée par Postgres.
 */
const ALLOWED_ROLES = [
  "admin",
  "teacher",
  "promoteur",
  "directeur_general",
  "directeur_direction",
  "comptable",
]

const DIRECTION_SCOPED_ROLE = "directeur_direction"

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
    const { role, isActive, directionId } = body

    if (role === undefined && isActive === undefined) {
      return NextResponse.json(
        { error: "Aucune modification demandée." },
        { status: 400 }
      )
    }

    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        {
          error: `Rôle invalide. Valeurs acceptées : ${ALLOWED_ROLES.join(", ")}.`,
        },
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
     * Un directeur de direction sans direction ne verrait aucune donnée :
     * on exige donc la direction dans la même opération que le rôle.
     * Et on vérifie qu'elle appartient bien à l'école de l'appelant, sinon
     * un admin pourrait rattacher un compte à la direction d'une autre école.
     */
    let nextDirectionId: string | null | undefined = undefined

    if (role === DIRECTION_SCOPED_ROLE) {
      if (!directionId) {
        return NextResponse.json(
          {
            error:
              "Choisissez la direction de ce directeur : sans elle, il n'aurait accès à aucune donnée.",
          },
          { status: 400 }
        )
      }

      const { data: direction, error: directionError } = await supabaseAdmin
        .from("directions")
        .select("id")
        .eq("id", directionId)
        .eq("school_id", guard.context.schoolId)
        .maybeSingle()

      if (directionError) {
        console.error("Erreur lecture de la direction :", directionError)

        return NextResponse.json(
          { error: "Impossible de vérifier la direction choisie." },
          { status: 500 }
        )
      }

      if (!direction) {
        return NextResponse.json(
          { error: "Cette direction n'appartient pas à votre établissement." },
          { status: 400 }
        )
      }

      nextDirectionId = directionId
    } else if (role !== undefined) {
      // Tout autre rôle : on efface une direction résiduelle.
      nextDirectionId = null
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

    const updates: {
      role?: string
      is_active?: boolean
      direction_id?: string | null
    } = {}

    if (role !== undefined) {
      updates.role = role
    }

    if (isActive !== undefined) {
      updates.is_active = isActive
    }

    if (nextDirectionId !== undefined) {
      updates.direction_id = nextDirectionId
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
