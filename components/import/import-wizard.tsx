"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import { parseSpreadsheet } from "@/src/lib/excel"
import { normalizeSearchText } from "@/src/lib/search"

/*
 * Assistant d'import Excel / CSV réutilisable.
 *
 * Il prend en charge tout ce qui est commun aux trois imports :
 * lecture du fichier, correspondance des colonnes, aperçu, confirmation,
 * progression et compte rendu. Chaque page fournit la validation métier
 * (validateRows) et l'insertion réelle (importRows).
 *
 * Règle de conduite : aucune ligne n'est importée sans que l'utilisateur
 * l'ait vue. Les lignes douteuses sont exclues par défaut et demandent une
 * action explicite.
 */

export type ImportField = {
  key: string
  label: string
  required?: boolean
  hint?: string
  /** Intitulés alternatifs, pour la détection automatique des colonnes. */
  aliases?: string[]
}

export type ImportRow = {
  /** Numéro de ligne dans le fichier, en-tête comprise. */
  lineNumber: number
  values: Record<string, string>
  /** Bloquant : la ligne ne peut pas être importée en l'état. */
  errors: string[]
  /** Douteux : la ligne est exclue tant qu'elle n'est pas confirmée. */
  warnings: string[]
  ignored: boolean
  confirmed: boolean
  /** Données prêtes à insérer, préparées par la page appelante. */
  payload?: Record<string, unknown>
}

export type ImportFailure = {
  lineNumber: number
  message: string
}

export type ImportOutcome = {
  imported: number
  failures: ImportFailure[]
}

export type RawRow = {
  lineNumber: number
  values: Record<string, string>
}

type Props = {
  title: string
  description: string
  fields: ImportField[]
  validateRows: (rows: RawRow[]) => ImportRow[]
  importRows: (
    rows: ImportRow[],
    onProgress: (done: number) => void
  ) => Promise<ImportOutcome>
  onClose: () => void
  /** Appelé après un import réussi, pour rafraîchir la page appelante. */
  onImported: () => void
  /** Contrôle supplémentaire par ligne (ex. choisir l'élève manuellement). */
  renderRowResolver?: (
    row: ImportRow,
    update: (patch: Partial<ImportRow>) => void
  ) => ReactNode
}

type Step = "upload" | "mapping" | "importing" | "done"

export function isRowImportable(row: ImportRow) {
  if (row.ignored || row.errors.length > 0) {
    return false
  }

  return row.warnings.length === 0 || row.confirmed
}

export function ImportWizard({
  title,
  description,
  fields,
  validateRows,
  importRows,
  onClose,
  onImported,
  renderRowResolver,
}: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [fileName, setFileName] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)

  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<RawRow[]>([])

  /** Champ attendu -> en-tête du fichier. */
  const [mapping, setMapping] = useState<Record<string, string>>({})

  const [rows, setRows] = useState<ImportRow[]>([])

  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  /*
   * validateRows est recréée à chaque rendu de la page appelante :
   * on la garde dans une ref pour ne relancer la validation que lorsque
   * la correspondance ou le contenu du fichier changent réellement.
   */
  const validateRef = useRef(validateRows)
  validateRef.current = validateRows

  const mappingSignature = fields
    .map((field) => `${field.key}=${mapping[field.key] ?? ""}`)
    .join("|")

  useEffect(() => {
    if (rawRows.length === 0) {
      setRows([])
      return
    }

    const mapped = rawRows.map((row) => {
      const values: Record<string, string> = {}

      fields.forEach((field) => {
        const header = mapping[field.key]
        values[field.key] = header ? (row.values[header] ?? "") : ""
      })

      return { lineNumber: row.lineNumber, values }
    })

    setRows(validateRef.current(mapped))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingSignature, rawRows])

  async function handleFile(file: File) {
    setParseError(null)
    setFileName(file.name)

    try {
      const sheet = await parseSpreadsheet(file)

      setHeaders(sheet.headers)

      setRawRows(
        sheet.rows.map((values, index) => ({
          lineNumber: sheet.lineNumbers[index],
          values,
        }))
      )

      // Détection automatique : le nom de colonne est comparé au libellé
      // du champ et à ses synonymes, sans accents ni casse.
      const guessed: Record<string, string> = {}
      const used = new Set<string>()

      fields.forEach((field) => {
        const candidates = [field.label, field.key, ...(field.aliases ?? [])].map(
          normalizeSearchText
        )

        const match = sheet.headers.find((header) => {
          if (used.has(header)) {
            return false
          }

          return candidates.includes(normalizeSearchText(header))
        })

        if (match) {
          guessed[field.key] = match
          used.add(match)
        }
      })

      setMapping(guessed)
      setStep("mapping")
    } catch (error) {
      console.error("Erreur de lecture du fichier :", error)

      setParseError(
        error instanceof Error
          ? error.message
          : "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un fichier Excel ou CSV."
      )
    }
  }

  function updateRow(lineNumber: number, patch: Partial<ImportRow>) {
    setRows((current) =>
      current.map((row) =>
        row.lineNumber === lineNumber ? { ...row, ...patch } : row
      )
    )
  }

  const missingRequired = fields.filter(
    (field) => field.required && !mapping[field.key]
  )

  const importableRows = rows.filter(isRowImportable)
  const errorRows = rows.filter((row) => !row.ignored && row.errors.length > 0)

  const warningRows = rows.filter(
    (row) => !row.ignored && row.errors.length === 0 && row.warnings.length > 0
  )

  const ignoredRows = rows.filter((row) => row.ignored)

  async function runImport() {
    if (importableRows.length === 0) {
      return
    }

    const confirmed = window.confirm(
      `Importer ${importableRows.length} ligne(s) ? Cette action écrit définitivement en base.`
    )

    if (!confirmed) {
      return
    }

    setStep("importing")
    setProgress(0)

    const result = await importRows(importableRows, (done) =>
      setProgress(done)
    )

    setOutcome(result)
    setStep("done")

    if (result.imported > 0) {
      onImported()
    }
  }

  return (
    <div className="rounded-xl border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-xl font-bold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        <button
          onClick={onClose}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          Fermer
        </button>
      </div>

      {step === "upload" && (
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="import-file" className="font-medium">
              Fichier Excel ou CSV
            </label>

            <input
              id="import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0]

                if (file) {
                  handleFile(file)
                }
              }}
              className="w-full rounded-md border bg-background px-3 py-2"
            />

            <p className="text-xs text-muted-foreground">
              Seule la première feuille du fichier est lue. La première ligne
              non vide sert d'en-tête.
            </p>
          </div>

          {parseError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {parseError}
            </div>
          )}
        </div>
      )}

      {step === "mapping" && (
        <div className="mt-6 space-y-8">
          <div>
            <p className="text-sm text-muted-foreground">
              Fichier : <span className="font-medium">{fileName}</span> —{" "}
              {rawRows.length} ligne(s) de données
            </p>
          </div>

          <div>
            <h4 className="font-heading text-lg font-bold">
              Correspondance des colonnes
            </h4>

            <p className="mt-1 text-sm text-muted-foreground">
              Associez chaque colonne de votre fichier au champ correspondant.
              Les colonnes reconnues ont été pré-remplies, vérifiez-les.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label htmlFor={`mapping-${field.key}`}>
                    {field.label}
                    {field.required && " *"}
                  </label>

                  <select
                    id={`mapping-${field.key}`}
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">— Aucune colonne —</option>

                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>

                  {field.hint && (
                    <p className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                Champs obligatoires sans colonne associée :{" "}
                {missingRequired.map((field) => field.label).join(", ")}.
              </div>
            )}
          </div>

          {missingRequired.length === 0 && (
            <div>
              <h4 className="font-heading text-lg font-bold">
                Aperçu de l'import
              </h4>

              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <span
                  className="rounded-full border px-3 py-1 font-semibold"
                  style={{
                    color: "oklch(0.55 0.13 155)",
                    borderColor: "oklch(0.55 0.13 155)",
                  }}
                >
                  {importableRows.length} à importer
                </span>

                {warningRows.length > 0 && (
                  <span
                    className="rounded-full border px-3 py-1 font-semibold"
                    style={{
                      color: "oklch(0.57 0.14 78)",
                      borderColor: "oklch(0.57 0.14 78)",
                    }}
                  >
                    {warningRows.length} à confirmer
                  </span>
                )}

                {errorRows.length > 0 && (
                  <span
                    className="rounded-full border px-3 py-1 font-semibold"
                    style={{
                      color: "oklch(0.577 0.245 27.325)",
                      borderColor: "oklch(0.577 0.245 27.325)",
                    }}
                  >
                    {errorRows.length} en erreur
                  </span>
                )}

                {ignoredRows.length > 0 && (
                  <span className="rounded-full border px-3 py-1 font-semibold text-muted-foreground">
                    {ignoredRows.length} ignorée(s)
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {rows.map((row) => {
                  const importable = isRowImportable(row)

                  const borderColor = row.ignored
                    ? undefined
                    : row.errors.length > 0
                      ? "oklch(0.577 0.245 27.325 / 0.5)"
                      : row.warnings.length > 0
                        ? "oklch(0.57 0.14 78 / 0.5)"
                        : undefined

                  return (
                    <div
                      key={row.lineNumber}
                      className="rounded-lg border p-4"
                      style={{
                        borderColor,
                        opacity: row.ignored ? 0.55 : 1,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            Ligne {row.lineNumber}
                          </p>

                          <p className="mt-1 font-medium">
                            {fields
                              .map((field) => row.values[field.key])
                              .filter((value) => value !== "")
                              .join(" · ") || "(ligne vide)"}
                          </p>

                          {row.errors.map((error) => (
                            <p
                              key={error}
                              className="mt-1 text-xs"
                              style={{ color: "oklch(0.577 0.245 27.325)" }}
                            >
                              {error}
                            </p>
                          ))}

                          {row.warnings.map((warning) => (
                            <p
                              key={warning}
                              className="mt-1 text-xs"
                              style={{ color: "oklch(0.57 0.14 78)" }}
                            >
                              {warning}
                            </p>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          {renderRowResolver?.(row, (patch) =>
                            updateRow(row.lineNumber, patch)
                          )}

                          {row.errors.length === 0 &&
                            row.warnings.length > 0 &&
                            !row.ignored && (
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={row.confirmed}
                                  onChange={(event) =>
                                    updateRow(row.lineNumber, {
                                      confirmed: event.target.checked,
                                    })
                                  }
                                />
                                Importer quand même
                              </label>
                            )}

                          <button
                            onClick={() =>
                              updateRow(row.lineNumber, {
                                ignored: !row.ignored,
                              })
                            }
                            className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                          >
                            {row.ignored ? "Réintégrer" : "Ignorer"}
                          </button>

                          <span
                            className="rounded-full border px-3 py-1 text-xs font-semibold"
                            style={{
                              color: importable
                                ? "oklch(0.55 0.13 155)"
                                : "oklch(0.45 0.02 60)",
                              borderColor: importable
                                ? "oklch(0.55 0.13 155)"
                                : "oklch(0.45 0.02 60)",
                            }}
                          >
                            {importable ? "Sera importée" : "Exclue"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  onClick={runImport}
                  disabled={importableRows.length === 0}
                  className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Importer {importableRows.length} ligne(s)
                </button>

                <button
                  onClick={() => setStep("upload")}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                >
                  Changer de fichier
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "importing" && (
        <div className="mt-6 space-y-3">
          <p className="font-medium">
            Import en cours : {progress} / {importableRows.length}
          </p>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${
                  importableRows.length === 0
                    ? 0
                    : (progress / importableRows.length) * 100
                }%`,
                background: "oklch(0.585 0.16 38)",
              }}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Les lignes sont traitées une par une. Ne fermez pas cette page.
          </p>
        </div>
      )}

      {step === "done" && outcome && (
        <div className="mt-6 space-y-4">
          <div
            className="rounded-lg border p-4"
            style={{
              background: "oklch(0.55 0.13 155 / 0.1)",
              borderColor: "oklch(0.55 0.13 155 / 0.4)",
            }}
          >
            <p className="font-medium">
              {outcome.imported} ligne(s) importée(s) avec succès.
            </p>
          </div>

          {outcome.failures.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">
                {outcome.failures.length} ligne(s) en échec — rien n'a été
                enregistré pour celles-ci :
              </p>

              <ul className="mt-3 space-y-1 text-sm text-destructive">
                {outcome.failures.map((failure) => (
                  <li key={failure.lineNumber}>
                    Ligne {failure.lineNumber} : {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setStep("upload")
                setOutcome(null)
                setRawRows([])
                setRows([])
                setHeaders([])
                setMapping({})
                setFileName("")
              }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Importer un autre fichier
            </button>

            <button
              onClick={onClose}
              className="rounded-md bg-primary px-6 py-2 font-medium text-primary-foreground"
            >
              Terminer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
