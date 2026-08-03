"use client"

import { useState } from "react"
import { supabase } from "@/src/lib/supabase"
import {
  RegleProposee,
  decouperReglement,
  fusionner,
  separer,
} from "@/src/lib/decoupage-reglement"
import { FormatNonLu, lireCommeTexte } from "@/src/lib/lire-document"

/*
 * Importer le règlement intérieur depuis un fichier.
 *
 * ---------------------------------------------------------------------
 * LE DÉCOUPAGE EST PROPOSÉ, PAS IMPOSÉ
 *
 * Recopier un règlement à la main décourage l'adoption ; un import
 * opaque la décourage autrement — on ne fait pas confiance à ce qu'on
 * n'a pas vu. D'où l'étape intermédiaire : la liste des règles détectées
 * s'affiche, se corrige, se fusionne, se sépare, se supprime. Rien
 * n'entre en base avant que l'utilisateur ait validé ce qu'il lit.
 *
 * TOLÉRANT, comme l'import d'élèves : un fichier mal formé n'est jamais
 * rejeté en bloc. Au pire le découpage est grossier — une règle par
 * ligne — et l'utilisateur l'affine ici même, sans repasser par le
 * fichier source.
 * ---------------------------------------------------------------------
 *
 * Le cloisonnement n'est pas fait ici : l'insertion passe par le RLS,
 * qui borne à l'école de l'appelant comme partout ailleurs.
 */

type Etat = "attente" | "lecture" | "revue" | "enregistrement"

export function ImportReglement({
  schoolId,
  onImporte,
}: {
  schoolId: string
  onImporte: () => void
}) {
  const [etat, setEtat] = useState<Etat>("attente")
  const [nomFichier, setNomFichier] = useState("")
  const [regles, setRegles] = useState<RegleProposee[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [bilan, setBilan] = useState<string | null>(null)

  async function lireLeFichier(fichier: File) {
    setEtat("lecture")
    setErreur(null)
    setBilan(null)
    setNomFichier(fichier.name)

    try {
      const texte = await lireCommeTexte(fichier)
      const proposees = decouperReglement(texte)

      if (proposees.length === 0) {
        setErreur(
          "Aucun texte n'a été trouvé dans ce fichier. Vérifiez qu'il contient bien le règlement."
        )
        setEtat("attente")
        return
      }

      setRegles(proposees)
      setEtat("revue")
    } catch (error) {
      console.error("Erreur lecture du règlement :", error)

      setErreur(
        error instanceof FormatNonLu
          ? error.message
          : "Ce fichier n'a pas pu être lu. Essayez de copier son texte dans un fichier .txt."
      )
      setEtat("attente")
    }
  }

  function modifier(index: number, champ: keyof RegleProposee, valeur: string) {
    setRegles((actuelles) =>
      actuelles.map((regle, i) =>
        i === index ? { ...regle, [champ]: valeur } : regle
      )
    )
  }

  async function enregistrer() {
    setEtat("enregistrement")
    setErreur(null)

    const valides = regles.filter(
      (regle) => regle.label.trim().length >= 2 && regle.texte.trim()
    )

    if (valides.length === 0) {
      setErreur("Aucune règle à enregistrer : chaque règle a besoin d'un titre.")
      setEtat("revue")
      return
    }

    /*
     * `upsert` sur (school_id, label) : réimporter un règlement corrigé
     * met à jour les règles existantes au lieu d'échouer sur la
     * contrainte d'unicité. Sans cela, une seconde tentative après une
     * coquille rejetterait tout le fichier.
     */
    const { error } = await supabase.from("school_rules").upsert(
      valides.map((regle) => ({
        school_id: schoolId,
        label: regle.label.trim(),
        rule_text: regle.texte.trim(),
        is_active: true,
      })),
      { onConflict: "school_id,label" }
    )

    if (error) {
      console.error("Erreur import du règlement :", error)
      setErreur(error.message)
      setEtat("revue")
      return
    }

    setBilan(`${valides.length} règle(s) enregistrée(s).`)
    setRegles([])
    setNomFichier("")
    setEtat("attente")
    onImporte()
  }

  return (
    <div className="rounded-xl border bg-background p-6">
      <h3 className="text-xl font-semibold">Importer le règlement</h3>

      <p className="mt-2 text-sm text-muted-foreground">
        Déposez un fichier Word (.docx), texte (.txt) ou tableur (.xlsx,
        .csv). Le découpage en articles vous sera proposé — vous le
        corrigez avant d&apos;enregistrer.
      </p>

      {etat === "attente" && (
        <div className="mt-4">
          <input
            type="file"
            accept=".docx,.txt,.md,.csv,.xlsx,.xls"
            onChange={(event) => {
              const fichier = event.target.files?.[0]

              if (fichier) {
                lireLeFichier(fichier)
              }
            }}
            className="block w-full text-sm"
          />
        </div>
      )}

      {etat === "lecture" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Lecture de {nomFichier}...
        </p>
      )}

      {erreur && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreur}
        </div>
      )}

      {bilan && (
        <div className="mt-4 rounded-lg border p-3 text-sm">{bilan}</div>
      )}

      {(etat === "revue" || etat === "enregistrement") && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{regles.length}</strong> règle(s) détectée(s) dans{" "}
              {nomFichier}. Corrigez avant d&apos;enregistrer.
            </p>

            <button
              type="button"
              onClick={() => {
                setRegles([])
                setEtat("attente")
              }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Recommencer
            </button>
          </div>

          <div className="space-y-3">
            {regles.map((regle, index) => (
              <div key={index} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-2 w-6 shrink-0 text-xs text-muted-foreground">
                    {index + 1}.
                  </span>

                  <div className="flex-1 space-y-2">
                    <input
                      value={regle.label}
                      onChange={(event) =>
                        modifier(index, "label", event.target.value)
                      }
                      aria-label={`Titre de la règle ${index + 1}`}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-medium"
                    />

                    <textarea
                      value={regle.texte}
                      onChange={(event) =>
                        modifier(index, "texte", event.target.value)
                      }
                      aria-label={`Texte de la règle ${index + 1}`}
                      rows={2}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {/*
                    Fusionner et séparer sont les deux corrections qui
                    évitent de retoucher le fichier source : un découpage
                    trop fin se recolle, un trop grossier se coupe.
                  */}
                  {index < regles.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setRegles(fusionner(regles, index))}
                      className="rounded border px-2 py-1 hover:bg-muted"
                    >
                      Fusionner avec la suivante
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setRegles(
                        separer(
                          regles,
                          index,
                          Math.floor(regle.texte.length / 2)
                        )
                      )
                    }
                    className="rounded border px-2 py-1 hover:bg-muted"
                  >
                    Séparer en deux
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setRegles(regles.filter((_, i) => i !== index))
                    }
                    className="rounded border px-2 py-1 text-destructive hover:bg-muted"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={enregistrer}
            disabled={etat === "enregistrement"}
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {etat === "enregistrement"
              ? "Enregistrement..."
              : `Enregistrer ${regles.length} règle(s)`}
          </button>
        </div>
      )}
    </div>
  )
}
