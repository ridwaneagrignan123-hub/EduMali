/*
 * Les trois langues de Ridwane.
 *
 * ---------------------------------------------------------------------
 * POURQUOI PAS DE ROUTAGE PAR LANGUE (/fr/, /en/, /ar/)
 *
 * C'est la façon habituelle de faire avec next-intl, et elle a été
 * écartée pour deux raisons concrètes :
 *
 *   - toutes les adresses de l'application changeraient, y compris
 *     `/update-password`, qui figure dans les URL de redirection
 *     autorisées du tableau de bord Supabase. Un lien d'accès déjà
 *     envoyé cesserait de fonctionner, et le réglage se corrige hors du
 *     dépôt (voir supabase/README.md) ;
 *   - l'application est presque entièrement faite de composants client
 *     qui lisent Supabase directement. Le gain principal de next-intl —
 *     la traduction côté serveur — ne s'appliquerait presque nulle part.
 *
 * La langue est donc une PRÉFÉRENCE, pas un segment d'URL : elle suit la
 * personne, et non l'adresse qu'elle a tapée.
 * ---------------------------------------------------------------------
 */

export const LANGUES = ["fr", "en", "ar"] as const

export type Langue = (typeof LANGUES)[number]

export const LANGUE_PAR_DEFAUT: Langue = "fr"

/** Le nom de chaque langue DANS cette langue — jamais traduit. */
export const NOMS_DE_LANGUE: Record<Langue, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
}

/** Le code que `toLocaleDateString` et consorts attendent. */
export const ETIQUETTES_LOCALE: Record<Langue, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-MA",
}

/**
 * L'arabe s'écrit de droite à gauche.
 *
 * Une fonction plutôt qu'une comparaison à « ar » recopiée partout : le
 * jour où une quatrième langue RTL arrive, il n'y a qu'un endroit à
 * changer — et surtout, aucun endroit à oublier.
 */
export function estRtl(langue: Langue) {
  return langue === "ar"
}

export function directionDe(langue: Langue) {
  return estRtl(langue) ? "rtl" : "ltr"
}

export function estUneLangue(valeur: unknown): valeur is Langue {
  return typeof valeur === "string" && LANGUES.includes(valeur as Langue)
}

/**
 * Ramène n'importe quelle valeur à une langue connue.
 *
 * Le repli est le FRANÇAIS et non la langue du navigateur : le français
 * est la langue source de l'application, celle dont on est sûr qu'aucune
 * clé ne manque.
 */
export function versLangue(valeur: unknown): Langue {
  return estUneLangue(valeur) ? valeur : LANGUE_PAR_DEFAUT
}

/** Le cookie qui retient le choix d'un visiteur non connecté. */
export const COOKIE_LANGUE = "ridwane_langue"
