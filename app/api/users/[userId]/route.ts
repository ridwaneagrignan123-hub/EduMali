import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import {
  forbidRoleEscalation,
  requireManageableTarget,
  requirePermission,
} from "@/src/lib/apiAuth"
import { assignableRoles } from "@/src/lib/roles"
import { isFiliere } from "@/src/lib/etablissement"

/*
 * Modifie les informations personnelles, le rôle et/ou l'état actif d'un
 * compte de l'école.
 *
 * Désactiver ne se limite pas à profiles.is_active : le compte est aussi
 * banni côté Auth, sinon l'utilisateur resterait capable de se connecter.
 *
 * L'email n'est pas modifiable ici : c'est l'identifiant de connexion, il
 * appartient à auth.users et le changer demanderait de reconfirmer l'adresse.
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
  // « admin » a disparu du modèle : ses comptes sont devenus promoteur.
  "teacher",
  "promoteur",
  "directeur_general",
  "directeur_direction",
  "comptable",
  // Ajouté en même temps que la contrainte en base ; il manquait ici,
  // si bien qu'aucun surveillant ne pouvait être nommé depuis la page.
  "surveillant",
  "surveillant_general",
]

const DIRECTION_SCOPED_ROLE = "directeur_direction"

/*
 * Le surveillant est rattaché à UN cycle et n'y voit que la surveillance
 * de celui-ci. Le surveillant GÉNÉRAL voit les trois : il n'a donc pas
 * de cycle, et lui en donner un le rétrécirait.
 */
const CYCLE_SCOPED_ROLE = "surveillant"
const CYCLES_ADMIS = ["premier_cycle", "second_cycle", "lycee"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    const guard = await requirePermission(request, "comptes.gerer")

    if (!guard.ok) {
      return guard.response
    }

    const targetGuard = await requireManageableTarget(guard.context, userId)

    if (!targetGuard.ok) {
      return targetGuard.response
    }

    const body = await request.json()
    const {
      role,
      isActive,
      directionId,
      filiere,
      cycle,
      firstName,
      lastName,
      phone,
    } = body

    /*
     * Le plafond d'attribution s'applique dès qu'on touche au rôle ou à
     * l'activation : ce sont les deux opérations qui déplacent du
     * pouvoir. Renommer un compte ou lui renvoyer un lien d'accès reste
     * ouvert à « comptes.gerer ».
     *
     * Il porte aussi sur le rôle ACTUEL de la cible : sans cela, un
     * directeur général pourrait désactiver l'administrateur, ou le
     * rétrograder en enseignant, et régner seul.
     */
    if (role !== undefined || isActive !== undefined) {
      if (assignableRoles(guard.context.role).length === 0) {
        return NextResponse.json(
          {
            error:
              "Votre rôle ne permet pas de modifier le rôle ni l'état d'un compte.",
          },
          { status: 403 }
        )
      }

      const refus = forbidRoleEscalation(
        guard.context,
        targetGuard.target.role,
        role
      )

      if (refus) {
        return refus
      }
    }

    if (
      role === undefined &&
      isActive === undefined &&
      firstName === undefined &&
      lastName === undefined &&
      phone === undefined
    ) {
      return NextResponse.json(
        { error: "Aucune modification demandée." },
        { status: 400 }
      )
    }

    /*
     * Prénom et nom se modifient ensemble : accepter l'un sans l'autre
     * ouvrirait la porte à un compte à moitié renommé.
     */
    const identityAsked = firstName !== undefined || lastName !== undefined

    if (identityAsked) {
      if (
        typeof firstName !== "string" ||
        !firstName.trim() ||
        typeof lastName !== "string" ||
        !lastName.trim()
      ) {
        return NextResponse.json(
          { error: "Le prénom et le nom sont obligatoires." },
          { status: 400 }
        )
      }
    }

    if (
      phone !== undefined &&
      phone !== null &&
      typeof phone !== "string"
    ) {
      return NextResponse.json(
        { error: "Le téléphone doit être un texte." },
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
     * La FILIÈRE d'un directeur de direction — école franco-arabe.
     *
     * Elle distingue les DEUX directeurs qui partagent une direction :
     * un français, un arabe. Rien n'empêchait déjà deux directeurs sur
     * une même direction ; ce qui manquait, c'était de savoir lequel
     * répond de quel programme.
     *
     * Elle ne restreint AUCUN périmètre RLS — voir la note dans
     * supabase/franco-arabe.sql. L'index partiel
     * profiles_directeur_par_filiere empêche seulement deux directeurs
     * de la même filière sur une même direction.
     *
     * En école classique on ne l'envoie pas, et elle reste nulle.
     */
    let nextFiliere: string | null | undefined = undefined

    if (filiere !== undefined) {
      if (filiere !== null && !isFiliere(filiere)) {
        return NextResponse.json(
          { error: "Filière inconnue." },
          { status: 400 }
        )
      }

      if (filiere !== null && role !== DIRECTION_SCOPED_ROLE) {
        return NextResponse.json(
          {
            error:
              "La filière ne s'applique qu'à un directeur de direction.",
          },
          { status: 400 }
        )
      }

      nextFiliere = filiere
    } else if (role !== undefined && role !== DIRECTION_SCOPED_ROLE) {
      // Changement de rôle : on efface une filière résiduelle.
      nextFiliere = null
    }

    /*
     * Le CYCLE d'un surveillant. Exigé au moment où on lui donne le
     * rôle : un surveillant sans cycle ne surveille rien — la fonction
     * private.surveille_classe() le laisse volontairement les mains
     * vides plutôt que de lui ouvrir toute l'école par défaut.
     */
    let nextCycle: string | null | undefined = undefined

    if (role === CYCLE_SCOPED_ROLE) {
      if (!cycle || !CYCLES_ADMIS.includes(cycle)) {
        return NextResponse.json(
          {
            error:
              "Choisissez le cycle de ce surveillant : sans lui, il ne verrait aucune classe.",
          },
          { status: 400 }
        )
      }

      nextCycle = cycle
    } else if (role !== undefined) {
      // Tout autre rôle, surveillant général compris : pas de cycle.
      nextCycle = null
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
      filiere?: string | null
      cycle?: string | null
      first_name?: string
      last_name?: string
      phone?: string | null
    } = {}

    if (identityAsked) {
      updates.first_name = String(firstName).trim()
      updates.last_name = String(lastName).trim()
    }

    if (phone !== undefined) {
      updates.phone = phone === null ? null : String(phone).trim() || null
    }

    if (role !== undefined) {
      updates.role = role
    }

    if (isActive !== undefined) {
      updates.is_active = isActive
    }

    if (nextDirectionId !== undefined) {
      updates.direction_id = nextDirectionId
    }

    if (nextFiliere !== undefined) {
      updates.filiere = nextFiliere
    }

    if (nextCycle !== undefined) {
      updates.cycle = nextCycle
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

    /*
     * Un compte d'enseignant a une fiche dans `teachers` qui répète nom,
     * prénom et téléphone. Sans cette mise à jour, la page des enseignants
     * continuerait d'afficher l'ancienne identité. Aucune ligne à mettre à
     * jour pour les autres rôles : la requête ne touche alors rien.
     */
    if (identityAsked || phone !== undefined) {
      const { error: teacherSyncError } = await supabaseAdmin
        .from("teachers")
        .update({
          ...(identityAsked
            ? {
                first_name: updates.first_name,
                last_name: updates.last_name,
              }
            : {}),
          ...(phone !== undefined ? { phone: updates.phone } : {}),
        })
        .eq("profile_id", userId)
        .eq("school_id", guard.context.schoolId)

      if (teacherSyncError) {
        console.error(
          "Erreur synchronisation de la fiche enseignant :",
          teacherSyncError
        )

        return NextResponse.json(
          {
            error:
              "Le compte a été mis à jour, mais la fiche enseignant porte encore l'ancienne identité. Réessayez.",
          },
          { status: 500 }
        )
      }
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
