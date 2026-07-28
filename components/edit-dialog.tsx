"use client"

import { FormEvent, ReactNode, useEffect } from "react"

/*
 * Boîte de dialogue de modification, partagée par les fiches élève,
 * enseignant et compte utilisateur.
 *
 * Elle ne connaît rien du métier : chaque page fournit ses champs et sa
 * fonction d'enregistrement. La boîte reste ouverte tant que
 * l'enregistrement n'a pas abouti, pour que l'erreur soit lue à côté des
 * valeurs saisies plutôt que dans une alerte détachée du formulaire.
 */

type Props = {
  title: string
  description?: string
  /** Message d'échec du dernier enregistrement, affiché au-dessus des champs. */
  error?: string | null
  saving: boolean
  submitLabel?: string
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}

export function EditDialog({
  title,
  description,
  error,
  saving,
  submitLabel = "Enregistrer",
  onSubmit,
  onClose,
  children,
}: Props) {
  /*
   * Échap ferme la boîte, sauf pendant l'enregistrement : fermer à cet
   * instant laisserait l'utilisateur sans le résultat de son action.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saving, onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(event) => {
        // Ne ferme que sur le fond, jamais sur un clic parti de la carte.
        if (event.target === event.currentTarget && !saving) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold">{title}</h3>

            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {children}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
