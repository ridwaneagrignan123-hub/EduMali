import * as XLSX from "xlsx"
import { supabase } from "@/src/lib/supabase"

/*
 * La copie téléchargeable des données d'une école.
 *
 * =====================================================================
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * =====================================================================
 *
 * C'est une COPIE, de sécurité et de portabilité. Le promoteur la
 * télécharge quand il veut, l'ouvre dans n'importe quel tableur, la
 * garde chez lui. Elle existe pour qu'il n'ait jamais à demander à
 * quiconque l'autorisation de consulter ses propres données.
 *
 * CE N'EST PAS UNE RESTAURATION, et on ne le laisse pas croire. Aucun
 * bouton ne réinjecte ce fichier : recréer une école à partir d'un
 * classeur supposerait de reconstruire des identifiants, des liens entre
 * tables et des droits — un travail qui, mal fait, abîmerait plus qu'il
 * ne répare. La vraie reprise après incident repose sur les sauvegardes
 * automatiques quotidiennes de Supabase, côté infrastructure.
 *
 * Promettre « restaurer depuis ce fichier » serait la promesse la plus
 * dangereuse de l'application : on ne la découvrirait fausse que le jour
 * où tout aurait déjà été perdu.
 *
 * =====================================================================
 * LE CLOISONNEMENT N'EST PAS FAIT ICI
 * =====================================================================
 *
 * Aucune de ces lectures ne filtre sur `school_id`. C'est le RLS qui
 * s'en charge, comme partout ailleurs : un compte ne voit que son école,
 * donc n'exporte que son école. Ajouter un filtre applicatif donnerait
 * l'illusion que la sécurité se joue ici — et masquerait un trou le jour
 * où il y en aurait un.
 */

/** PostgREST plafonne à 1000 lignes ; au-delà, il faut pagi­ner. */
const PAGE = 1000

/**
 * Lit une table ENTIÈRE, page par page.
 *
 * Sans cette boucle, une école de plus de mille élèves exporterait un
 * fichier tronqué — silencieusement, ce qui est le pire des cas pour une
 * sauvegarde : on ne s'en aperçoit qu'en la relisant, trop tard.
 */
async function lireTout(table: string, colonnes: string) {
  const lignes: Record<string, unknown>[] = []

  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(colonnes)
      .range(debut, debut + PAGE - 1)

    if (error) {
      throw new Error(`${table} : ${error.message}`)
    }

    const page = (data ?? []) as unknown as Record<string, unknown>[]
    lignes.push(...page)

    if (page.length < PAGE) {
      return lignes
    }
  }
}

/*
 * Une feuille par entité, dans l'ordre où on la consulte : d'abord qui,
 * puis quoi, puis l'argent, puis la vie scolaire.
 *
 * Les colonnes sont NOMMÉES et jamais `*`. Deux raisons : les colonnes
 * de rémunération de `teachers` sont fermées au rôle `authenticated` et
 * une étoile ferait échouer la requête entière ; et un classeur destiné
 * à être lu par un humain n'a pas à porter des colonnes techniques dont
 * personne ne fera rien.
 */
const FEUILLES: { nom: string; table: string; colonnes: string }[] = [
  {
    nom: "Élèves",
    table: "students",
    colonnes:
      "id, student_number, last_name, first_name, date_of_birth, gender, address, parent_name, parent_phone, photo_url, created_at",
  },
  {
    nom: "Classes",
    table: "classes",
    colonnes:
      "id, name, level, cycle, academic_year, direction_id, notes_saisies_par, created_at",
  },
  {
    nom: "Inscriptions",
    table: "student_class_enrollments",
    colonnes: "id, student_id, class_id, academic_year_id, created_at",
  },
  {
    nom: "Matières",
    table: "subjects",
    colonnes: "id, name, code, coefficient, filiere, created_at",
  },
  {
    nom: "Classes-matières",
    table: "class_subjects",
    colonnes: "id, class_id, subject_id, teacher_id, created_at",
  },
  {
    nom: "Évaluations",
    table: "assessments",
    colonnes:
      "id, class_id, subject_id, academic_period_id, title, assessment_type, max_score, coefficient, assessment_date, created_at",
  },
  {
    nom: "Notes",
    table: "grades",
    colonnes: "id, assessment_id, student_id, score, created_at",
  },
  {
    nom: "Frais",
    table: "fee_assessments",
    colonnes: "id, student_id, academic_year_id, amount_due, created_at",
  },
  {
    nom: "Paiements",
    table: "fee_payments",
    colonnes:
      "id, fee_assessment_id, receipt_number, amount_paid, payment_date, payment_method, note, cancelled_at, cancellation_reason, created_at",
  },
  {
    nom: "Présences",
    table: "attendance",
    colonnes: "id, student_id, class_id, attendance_date, status, created_at",
  },
  {
    nom: "Présences par leçon",
    table: "lesson_attendance",
    colonnes:
      "id, student_id, class_id, subject_id, slot_id, lesson_date, status, note, created_at",
  },
  {
    nom: "Retenues",
    table: "detentions",
    colonnes:
      "id, student_id, class_id, detention_date, reason, created_at",
  },
  {
    nom: "Manquements",
    table: "rule_violations",
    colonnes: "id, student_id, rule_id, violation_date, note, created_at",
  },
  {
    nom: "Règlement intérieur",
    table: "school_rules",
    colonnes: "id, label, rule_text, is_active",
  },
  {
    nom: "Enseignants",
    table: "teachers",
    colonnes:
      "id, last_name, first_name, email, phone, specialty, contract_type, hire_date, status, created_at",
  },
  {
    nom: "Emploi du temps",
    table: "timetable_slots",
    colonnes:
      "id, class_id, subject_id, teacher_id, academic_year_id, day_of_week, start_time, end_time, created_at",
  },
]

export type Avancement = { fait: number; total: number; feuille: string }

/**
 * Construit le classeur et le fait télécharger.
 *
 * Rend le compte de lignes par feuille, pour que l'écran puisse dire ce
 * qui est réellement parti — une sauvegarde muette ne rassure personne.
 */
export async function telechargerSauvegarde(
  nomEcole: string,
  surAvancement?: (avancement: Avancement) => void
) {
  const classeur = XLSX.utils.book_new()
  const comptes: { feuille: string; lignes: number }[] = []

  for (const [index, feuille] of FEUILLES.entries()) {
    surAvancement?.({
      fait: index,
      total: FEUILLES.length,
      feuille: feuille.nom,
    })

    const lignes = await lireTout(feuille.table, feuille.colonnes)

    /*
     * Une feuille vide reste dans le classeur, avec ses en-têtes. Une
     * feuille absente laisserait croire à un oubli de l'export ; une
     * feuille vide dit clairement « rien à cet endroit ».
     */
    const donnees =
      lignes.length > 0
        ? XLSX.utils.json_to_sheet(lignes)
        : XLSX.utils.aoa_to_sheet([
            feuille.colonnes.split(",").map((colonne) => colonne.trim()),
          ])

    // Excel refuse les noms de feuille au-delà de 31 caractères.
    XLSX.utils.book_append_sheet(classeur, donnees, feuille.nom.slice(0, 31))

    comptes.push({ feuille: feuille.nom, lignes: lignes.length })
  }

  surAvancement?.({
    fait: FEUILLES.length,
    total: FEUILLES.length,
    feuille: "",
  })

  const jour = new Date().toISOString().slice(0, 10)
  const ecole = (nomEcole || "ecole")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  XLSX.writeFile(classeur, `ridwane-${ecole}-${jour}.xlsx`)

  return comptes
}

export const NOMBRE_DE_FEUILLES = FEUILLES.length
