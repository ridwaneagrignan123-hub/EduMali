/*
 * Utilitaires de recherche côté client.
 *
 * Les noms maliens et francophones contiennent souvent des accents
 * (Traoré, Diakité, Aïssata...). La normalisation retire les accents
 * et la casse pour que « traore » trouve bien « Traoré ».
 */

// Plage Unicode des signes diacritiques (accents) isolés par NFD.
const DIACRITICS = /[̀-ͯ]/g

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .trim()
}

/*
 * Recherche PAR MOTS, sur l'ensemble des champs réunis.
 *
 * ---------------------------------------------------------------------
 * CE QUI NE MARCHAIT PAS
 *
 * La version précédente comparait le texte recherché à chaque champ
 * ISOLÉMENT. Taper « Awa Traoré » ne trouvait donc rien : `first_name`
 * vaut « Awa », `last_name` vaut « Traoré », et aucun des deux ne
 * contient la chaîne entière. Seuls les mots isolés fonctionnaient —
 * alors que saisir le nom complet est le premier réflexe.
 * ---------------------------------------------------------------------
 *
 * On découpe donc la recherche en mots, et on exige que CHACUN se
 * retrouve dans les champs concaténés. « Awa Traoré », « Traoré Awa »,
 * « awa » et « traore » trouvent tous le même élève, l'ordre n'important
 * plus.
 *
 * Les champs sont joints par une espace : sans elle, « Awat » trouverait
 * un « Awa » suivi d'un « Traoré », deux champs distincts recollés par
 * accident.
 */
export function matchesSearch(
  search: string,
  ...fields: (string | null | undefined)[]
) {
  const mots = normalizeSearchText(search).split(/\s+/).filter(Boolean)

  if (mots.length === 0) {
    return true
  }

  const texte = fields
    .filter((field): field is string => field != null)
    .map(normalizeSearchText)
    .join(" ")

  return mots.every((mot) => texte.includes(mot))
}
