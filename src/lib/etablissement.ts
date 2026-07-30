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
