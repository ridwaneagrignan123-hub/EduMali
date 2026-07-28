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
 * Renvoie true si la recherche est vide, ou si au moins un des
 * champs fournis contient le texte recherché.
 */
export function matchesSearch(
  search: string,
  ...fields: (string | null | undefined)[]
) {
  const normalizedSearch = normalizeSearchText(search)

  if (!normalizedSearch) {
    return true
  }

  return fields.some(
    (field) =>
      field != null &&
      normalizeSearchText(field).includes(normalizedSearch)
  )
}
