/*
 * Type d'établissement.
 *
 * Il pilote l'AFFICHAGE, pas les droits. Une école `classique` garde
 * exactement la configuration d'origine ; une école `franco_arabe`
 * débloque l'axe filière (français / arabe) : double direction et
 * double titulaire de premier cycle.
 *
 * La contrainte schools_school_type_check en base fait foi. Cette liste
 * doit lui rester identique.
 */

export const SCHOOL_TYPES = ["classique", "franco_arabe"] as const

export type SchoolType = (typeof SCHOOL_TYPES)[number]

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  classique: "École classique",
  franco_arabe: "École franco-arabe",
}

export const SCHOOL_TYPE_HINTS: Record<SchoolType, string> = {
  classique: "Programme unique, un titulaire par classe au premier cycle.",
  franco_arabe:
    "Programmes français et arabe : deux directeurs par direction et deux titulaires par classe de premier cycle.",
}

export function isSchoolType(value: unknown): value is SchoolType {
  return (
    typeof value === "string" && SCHOOL_TYPES.includes(value as SchoolType)
  )
}

/**
 * Repli sur `classique` pour toute valeur inattendue : l'écran doit
 * s'afficher même si la colonne n'a pas encore été lue.
 */
export function toSchoolType(value: unknown): SchoolType {
  return isSchoolType(value) ? value : "classique"
}

/** L'axe filière n'existe QUE dans une école franco-arabe. */
export function hasFiliere(schoolType: unknown): boolean {
  return toSchoolType(schoolType) === "franco_arabe"
}

/*
 * Les trois cycles maliens.
 *
 * Colonne structurée, et non le champ `level` : celui-ci est un texte
 * libre où « 6eme », « 6e » et « Sixième » coexistent. Une règle
 * d'affectation ne peut pas s'appuyer là-dessus.
 *
 * `null` reste possible : les classes créées avant cette colonne n'ont
 * pas de cycle, et le deviner à leur place serait se tromper.
 */
export const CYCLES = ["premier_cycle", "second_cycle", "lycee"] as const

export type Cycle = (typeof CYCLES)[number]

export const CYCLE_LABELS: Record<Cycle, string> = {
  premier_cycle: "Premier cycle",
  second_cycle: "Second cycle",
  lycee: "Lycée",
}

export const CYCLE_HINTS: Record<Cycle, string> = {
  premier_cycle:
    "Un enseignant titulaire tient toute la classe, toutes matières confondues.",
  second_cycle: "Un enseignant par matière.",
  lycee: "Un enseignant par matière.",
}

export function isCycle(value: unknown): value is Cycle {
  return typeof value === "string" && CYCLES.includes(value as Cycle)
}

export function cycleLabel(value: unknown): string {
  return isCycle(value) ? CYCLE_LABELS[value] : "Cycle non défini"
}

/**
 * Vrai quand la classe se tient avec UN titulaire pour toutes les
 * matières, faux quand elle s'affecte matière par matière.
 *
 * Un cycle non défini retombe sur le mode par matière : c'est le
 * fonctionnement actuel, et le seul qui ne présuppose rien.
 */
export function estModeTitulaire(cycle: unknown): boolean {
  return cycle === "premier_cycle"
}

/*
 * L'axe filière : français / arabe. N'existe qu'en école franco-arabe.
 */
export const FILIERES = ["francais", "arabe"] as const

export type Filiere = (typeof FILIERES)[number]

export const FILIERE_LABELS: Record<Filiere, string> = {
  francais: "Français",
  arabe: "Arabe",
}

export function isFiliere(value: unknown): value is Filiere {
  return typeof value === "string" && FILIERES.includes(value as Filiere)
}

export function filiereLabel(value: unknown): string {
  return isFiliere(value) ? FILIERE_LABELS[value] : "Sans filière"
}
