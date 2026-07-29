import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"

/*
 * Modifie les informations personnelles d'un enseignant.
 *
 * La fiche enseignant et le profil du compte portent les mêmes nom, prénom
 * et téléphone : les modifier séparément les ferait diverger, et la page des
 * comptes afficherait encore l'ancien nom. La mise à jour du profil demande
 * la clé service role — le RLS de `profiles` ne laisse chacun modifier que
 * le sien — d'où cette route serveur plutôt qu'un appel direct depuis la page.
 *
 * L'email n'est pas modifiable ici : c'est l'identifiant de connexion, il
 * vit dans auth.users et le changer ici ne ferait que désynchroniser la fiche
 * du compte réel.
 *
 * Le corps décrit l'état complet des champs modifiables : un champ facultatif
 * absent est effacé, pas conservé. La page envoie toujours le formulaire
 * entier, ce qui rend le comportement prévisible.
 */

// Format attendu des dates : celui d'un <input type="date">.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function readName(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false as const, error: `${label} est obligatoire.` }
  }

  return { ok: true as const, value: value.trim() }
}

function readOptionalText(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  return String(value).trim() || null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  try {
    const { teacherId } = await params

    const guard = await requirePermission(request, "enseignants.gerer")

    if (!guard.ok) {
      return guard.response
    }

    if (!teacherId) {
      return NextResponse.json(
        { error: "Enseignant cible manquant." },
        { status: 400 }
      )
    }

    const body = await request.json()

    const firstName = readName(body.firstName, "Le prénom")

    if (!firstName.ok) {
      return NextResponse.json({ error: firstName.error }, { status: 400 })
    }

    const lastName = readName(body.lastName, "Le nom")

    if (!lastName.ok) {
      return NextResponse.json({ error: lastName.error }, { status: 400 })
    }

    const phone = readOptionalText(body.phone)
    const specialty = readOptionalText(body.specialty)
    const hireDate = readOptionalText(body.hireDate)

    if (hireDate !== null && !DATE_PATTERN.test(hireDate)) {
      return NextResponse.json(
        { error: "La date d'embauche doit être au format AAAA-MM-JJ." },
        { status: 400 }
      )
    }

    /*
     * Le filtre sur school_id est la seule frontière : la clé service role
     * contourne le RLS, donc un identifiant d'une autre école doit ressortir
     * comme introuvable.
     */
    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("id, profile_id")
      .eq("id", teacherId)
      .eq("school_id", guard.context.schoolId)
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

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("teachers")
      .update({
        first_name: firstName.value,
        last_name: lastName.value,
        phone,
        specialty,
        hire_date: hireDate,
      })
      .eq("id", teacher.id)
      .eq("school_id", guard.context.schoolId)
      .select(
        "id, first_name, last_name, email, phone, specialty, hire_date, status"
      )
      .single()

    if (updateError || !updated) {
      console.error("Erreur mise à jour de l'enseignant :", updateError)

      return NextResponse.json(
        { error: "Les modifications n'ont pas pu être enregistrées." },
        { status: 500 }
      )
    }

    /*
     * Un enseignant importé avant l'existence des comptes peut n'avoir aucun
     * profil rattaché : il n'y a alors rien à synchroniser.
     */
    if (teacher.profile_id) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: firstName.value,
          last_name: lastName.value,
          phone,
        })
        .eq("id", teacher.profile_id)
        .eq("school_id", guard.context.schoolId)

      if (profileError) {
        console.error("Erreur mise à jour du profil enseignant :", profileError)

        return NextResponse.json(
          {
            error:
              "La fiche a été mise à jour, mais le compte associé porte encore l'ancien nom. Réessayez.",
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ teacher: updated }, { status: 200 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
