"use client"

import { useState } from "react"
import { useLangue } from "@/src/i18n/contexte"
import { LANGUES, Langue, NOMS_DE_LANGUE } from "@/src/i18n/langues"

/*
 * Le sélecteur de langue.
 *
 * ---------------------------------------------------------------------
 * CHAQUE LANGUE EST ÉCRITE DANS SA PROPRE LANGUE
 *
 * « Français », « English », « العربية » — jamais « Arabe » en français.
 * Quelqu'un qui cherche sa langue ne sait pas forcément lire celle qui
 * est affichée : c'est précisément pour cela qu'il cherche. Un libellé
 * traduit serait illisible pour la seule personne à qui il s'adresse.
 * ---------------------------------------------------------------------
 *
 * Le choix est enregistré sur le profil ET dans un cookie. Le cookie
 * couvre le visiteur non connecté, et sert au rendu serveur du `dir`
 * (voir app/layout.tsx). Le profil, lui, suit la personne d'un appareil
 * à l'autre.
 */
export function SelecteurLangue({ compact = false }: { compact?: boolean }) {
  const { langue, changerLangue, t } = useLangue()
  const [enCours, setEnCours] = useState(false)

  async function choisir(suivante: string) {
    setEnCours(true)
    await changerLangue(suivante as Langue)
    setEnCours(false)
  }

  return (
    <div className={compact ? "" : "space-y-2"}>
      {!compact && (
        <label htmlFor="selecteur-langue" className="text-sm">
          {t("langue.choisir")}
        </label>
      )}

      <select
        id="selecteur-langue"
        value={langue}
        onChange={(event) => choisir(event.target.value)}
        disabled={enCours}
        aria-label={t("langue.choisir")}
        className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
      >
        {LANGUES.map((valeur) => (
          <option key={valeur} value={valeur}>
            {NOMS_DE_LANGUE[valeur]}
          </option>
        ))}
      </select>
    </div>
  )
}
