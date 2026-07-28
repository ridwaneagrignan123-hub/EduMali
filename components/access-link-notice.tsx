"use client"

import { useState } from "react"

/*
 * Affiche le lien d'accès d'un compte qui vient d'être créé, ou dont on
 * vient de redemander l'accès.
 *
 * Il ne s'agit pas d'un simple confort. La messagerie intégrée de Supabase
 * ne dessert que les membres de l'organisation : un enseignant ne reçoit
 * rien, alors que l'application annonçait « Invitation envoyée ». Tant
 * qu'un service d'envoi n'est pas configuré, ce lien est le seul chemin
 * réel vers le compte — et il correspond mieux à l'usage, où l'on
 * transmet par WhatsApp plutôt que par courriel.
 */

type Props = {
  email: string
  /** Faux quand la messagerie a refusé : ne rien promettre dans ce cas. */
  emailAttempted: boolean
  accessLink: string | null
  onClose: () => void
}

export function AccessLinkNotice({
  email,
  emailAttempted,
  accessLink,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!accessLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(accessLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Presse-papiers refusé : le lien reste sélectionnable à la main.
      setCopied(false)
    }
  }

  return (
    <div
      className="rounded-lg border p-4 text-sm"
      style={{
        background: "oklch(0.80 0.14 78 / 0.12)",
        borderColor: "oklch(0.57 0.14 78 / 0.5)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-medium">Compte créé pour {email}</p>

        <button
          onClick={onClose}
          aria-label="Fermer"
          className="shrink-0 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 text-muted-foreground">
        {emailAttempted
          ? "Un message a été adressé à cette adresse. Tant qu'un service d'envoi n'est pas configuré pour l'établissement, il n'arrivera probablement pas :"
          : "L'envoi par courriel a échoué, mais le compte existe bien :"}{" "}
        transmettez ce lien directement à la personne concernée.
      </p>

      {accessLink ? (
        <div className="mt-3 space-y-2">
          <input
            readOnly
            value={accessLink}
            onFocus={(event) => event.target.select()}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyLink}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {copied ? "Lien copié" : "Copier le lien"}
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Votre accès à Ridwane : ${accessLink}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Envoyer par WhatsApp
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            Ce lien vaut mot de passe : ne le diffusez qu&apos;à la personne
            concernée. Il s&apos;utilise une seule fois et expire.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground">
          Aucun lien n&apos;a pu être produit. Depuis la page « Comptes
          utilisateurs », le bouton d&apos;envoi du lien d&apos;accès permet
          d&apos;en redemander un.
        </p>
      )}
    </div>
  )
}
