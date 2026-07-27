import * as XLSX from "xlsx"

/*
 * Lecture des fichiers Excel / CSV côté client.
 *
 * On ne lit que la PREMIÈRE feuille : les fichiers transmis par les écoles
 * en contiennent rarement plusieurs, et deviner laquelle utiliser serait
 * une source d'erreur silencieuse.
 */

export type ParsedSheet = {
  sheetName: string
  headers: string[]
  /** Une entrée par ligne de données, indexée par nom de colonne. */
  rows: Record<string, string>[]
  /** Numéro de la ligne dans le fichier, en-tête comprise (1-based). */
  lineNumbers: number[]
}

function cellToString(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value).trim()
}

/*
 * Convertit une date de tableur au format attendu par Postgres (AAAA-MM-JJ).
 *
 * Trois retours distincts, volontairement :
 *   null      -> cellule vide, la date est simplement absente
 *   undefined -> format non reconnu, la ligne doit être signalée
 *   string    -> date valide
 */
export function parseSpreadsheetDate(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const french = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)

  if (french) {
    const [, day, month, year] = french
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }

  return undefined
}

export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer()

  /*
   * raw: false demande à SheetJS de restituer les valeurs telles qu'elles
   * sont affichées dans le tableur (dates formatées comprises) plutôt que
   * les nombres bruts du format Excel.
   */
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })

  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error("Ce fichier ne contient aucune feuille de calcul.")
  }

  const sheet = workbook.Sheets[sheetName]

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  })

  if (matrix.length === 0) {
    throw new Error("Cette feuille est vide.")
  }

  // La première ligne non vide sert d'en-tête.
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => cellToString(cell) !== "")
  )

  if (headerIndex === -1) {
    throw new Error("Cette feuille est vide.")
  }

  const rawHeaders = matrix[headerIndex].map(cellToString)

  /*
   * Deux colonnes peuvent porter le même titre : on suffixe les doublons
   * pour que la correspondance reste sans ambiguïté.
   */
  const seen = new Map<string, number>()

  const headers = rawHeaders.map((header, index) => {
    const base = header || `Colonne ${index + 1}`
    const count = seen.get(base) ?? 0

    seen.set(base, count + 1)

    return count === 0 ? base : `${base} (${count + 1})`
  })

  const rows: Record<string, string>[] = []
  const lineNumbers: number[] = []

  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const cells = matrix[index]

    const values: Record<string, string> = {}
    let hasContent = false

    headers.forEach((header, columnIndex) => {
      const value = cellToString(cells[columnIndex])

      values[header] = value

      if (value !== "") {
        hasContent = true
      }
    })

    // Les lignes entièrement vides sont ignorées sans le signaler.
    if (!hasContent) {
      continue
    }

    rows.push(values)
    lineNumbers.push(index + 1)
  }

  return { sheetName, headers, rows, lineNumbers }
}
