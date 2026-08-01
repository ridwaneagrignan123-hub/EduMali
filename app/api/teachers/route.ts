import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"
import { formaterNom, formaterPrenom } from "@/src/lib/noms"

/*
 * Enregistrement d'un enseignant — SANS compte de connexion.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CETTE ROUTE EXISTE
 *
 * Le seul chemin d'enregistrement passait par /api/teachers/invite, qui
 * appelait inviteUserByEmail(). Créer un compte d'authentification impose
 * un email unique AU MONDE, et deux défauts en découlaient :
 *
 *   - un enseignant déjà enregistré dans une autre école était refusé,
 *     alors qu'un vacataire tourne précisément entre plusieurs écoles ;
 *   - l'email devenait obligatoire, alors que la plupart des vacataires
 *     n'en ont pas et ne se connecteront jamais.
 *
 * Une fiche enseignant est un enregistrement tenu par l'administration,
 * pas un compte. Elle ne touche donc plus à l'authentification du tout.
 * Créer un login reste possible, séparément : /api/teachers/invite le
 * fait désormais sur une fiche existante, et c'est le seul endroit où
 * l'authentification intervient.
 *
 * La collision d'email disparaît d'elle-même : plus aucun compte n'est
 * créé ici. Chaque école tient sa propre fiche du même enseignant, avec
 * son propre contrat et ses propres taux — un vacataire n'a pas le même
 * tarif partout, et c'est voulu.
 * ---------------------------------------------------------------------
 *
 * Les TAUX ne sont pas écrits ici, délibérément. « enseignants.gerer »
 * appartient à tout l'encadrement, directeur général compris, qui est
 * précisément écarté des finances. Les colonnes hourly_rate et
 * monthly_salary passent par set_teacher_compensation(), qui revérifie
 * can_see_money() en base. La page appelle cette fonction après la
 * création quand un taux a été saisi.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CONTRACT_TYPES = ["permanent", "vacataire"]

function readText(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  return String(value).trim() || null
}

export async function POST(request: Request) {
  try {
    const guard = await requirePermission(request, "enseignants.gerer")

    if (!guard.ok) {
      return guard.response
    }

    const { schoolId } = guard.context
    const body = await request.json()

    const firstName = readText(body.firstName)
    const lastName = readText(body.lastName)

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Le prénom et le nom sont obligatoires." },
        { status: 400 }
      )
    }

    /*
     * Le numéro WhatsApp remplace l'email comme coordonnée obligatoire :
     * c'est par là que passent réellement les échanges avec les
     * enseignants, et la page Vie scolaire s'en sert déjà pour ouvrir une
     * conversation. Un enseignant sans moyen de contact serait
     * inatteignable, d'où l'exigence.
     */
    const phone = readText(body.phone)

    if (!phone) {
      return NextResponse.json(
        { error: "Le numéro WhatsApp est obligatoire." },
        { status: 400 }
      )
    }

    if (phone.replace(/\D/g, "").length < 8) {
      return NextResponse.json(
        {
          error:
            "Le numéro WhatsApp doit comporter au moins 8 chiffres.",
        },
        { status: 400 }
      )
    }

    // Facultatif désormais — mais s'il est fourni, il doit être plausible.
    const email = readText(body.email)?.toLowerCase() ?? null

    if (email && !EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: `L'email « ${email} » n'est pas une adresse valide.` },
        { status: 400 }
      )
    }

    const contractType = readText(body.contractType)

    if (contractType && !CONTRACT_TYPES.includes(contractType)) {
      return NextResponse.json(
        { error: "Type de contrat inconnu." },
        { status: 400 }
      )
    }

    const hireDate = readText(body.hireDate)

    if (hireDate !== null && !DATE_PATTERN.test(hireDate)) {
      return NextResponse.json(
        { error: "La date d'embauche doit être au format AAAA-MM-JJ." },
        { status: 400 }
      )
    }

    const { data: teacher, error: insertError } = await supabaseAdmin
      .from("teachers")
      .insert({
        school_id: schoolId,
        /*
         * Mise en forme ici, et non a l'ecran : la saisie manuelle comme
         * l'import Excel passent tous deux par cette route, un seul
         * point suffit donc a les tenir tous les deux.
         */
        first_name: formaterPrenom(firstName),
        last_name: formaterNom(lastName),
        email,
        phone,
        specialty: readText(body.specialty),
        contract_type: contractType,
        hire_date: hireDate,
        status: "active",
        // profile_id reste nul : aucun compte n'est créé ici.
      })
      .select(
        "id, first_name, last_name, email, phone, specialty, contract_type, hire_date, status, profile_id"
      )
      .single()

    if (insertError) {
      console.error("Erreur enregistrement de l'enseignant :", insertError)

      /*
       * Le déclencheur teachers_whatsapp_unique renvoie déjà une phrase
       * lisible, nommant la personne qui détient le numéro. On la
       * transmet telle quelle plutôt que de la remplacer par un message
       * générique moins utile.
       */
      if (insertError.code === "P0001") {
        return NextResponse.json(
          { error: insertError.message },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: "L'enseignant n'a pas pu être enregistré." },
        { status: 500 }
      )
    }

    return NextResponse.json({ teacher }, { status: 201 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
