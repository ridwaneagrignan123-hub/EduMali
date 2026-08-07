"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/src/lib/supabase"
import { CodeParent, etatAcces } from "@/src/lib/acces-parent"

/*
 * Le code d'accès de la famille, côté école.
 *
 * ---------------------------------------------------------------------
 * LE CODE SE RELIT, IL NE SE RÉENGENDRE PAS À CHAQUE FOIS
 *
 * C'est tout l'intérêt de ne pas l'avoir haché : un parent qui a perdu
 * son papier revient au secrétariat, et on le lui redonne. Réengendrer
 * invaliderait celui que l'autre parent détient peut-être déjà — et
 * personne ne saurait lequel des deux papiers vaut encore.
 *
 * On ne réengendre donc que sur RETRAIT explicite, et l'écran le dit.
 * ---------------------------------------------------------------------
 *
 * « Jamais ouvert » est l'information qui manque le plus au secrétariat :
 * elle distingue le parent qui n'a rien compris de celui qui n'a pas
 * reçu le papier.
 */

/*
 * L'état de l'accès est calculé dans src/lib/acces-parent.ts, partagé
 * avec le tableau des familles. Deux écrans qui traduiraient le même
 * état chacun de son côté finiraient par se contredire.
 */
type Code = CodeParent

export function CodeAccesParent({
  studentId,
  schoolId,
  nomEleve,
  peutEcrire,
}: {
  studentId: string
  schoolId: string
  nomEleve: string
  peutEcrire: boolean
}) {
  const [code, setCode] = useState<Code | null>(null)
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from("student_access_codes")
      .select("id, code, created_at, last_used_at, opened_count")
      .eq("student_id", studentId)
      .is("revoked_at", null)
      .maybeSingle()

    setCode((data as Code) ?? null)
    setChargement(false)
  }, [studentId])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  async function engendrer() {
    setErreur(null)
    setEnvoi(true)

    /*
     * `code` est envoyé vide : le déclencheur en base l'écrase. Ce qui
     * part d'ici n'est qu'un marqueur de place — mesuré, une valeur
     * choisie par le client est ignorée.
     */
    const { error } = await supabase.from("student_access_codes").insert({
      school_id: schoolId,
      student_id: studentId,
      code: "",
    })

    setEnvoi(false)

    if (error) {
      console.error("Code d'accès parent :", error)
      setErreur(
        error.message.includes("row-level security")
          ? "Seule la direction peut ouvrir un accès famille."
          : "Le code n'a pas pu être créé."
      )
      return
    }

    await charger()
  }

  async function retirer() {
    if (
      !confirm(
        `Retirer l'accès de la famille de ${nomEleve} ?\n\nLe code actuel cessera immédiatement de fonctionner, y compris pour un parent déjà connecté. Vous pourrez en créer un nouveau.`
      )
    ) {
      return
    }

    setErreur(null)

    const { error } = await supabase
      .from("student_access_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", code?.id ?? "")

    if (error) {
      console.error("Retrait du code parent :", error)
      setErreur("Le code n'a pas pu être retiré.")
      return
    }

    await charger()
  }

  return (
    <div className="rounded-xl border bg-background p-6">
      <h3 className="text-lg font-semibold">Accès de la famille</h3>

      <p className="mt-1 text-sm text-muted-foreground">
        Un code personnel qui ouvre <span className="font-medium">/parent</span>{" "}
        en lecture seule : notes, absences et situation de la scolarité.
        Remettez-le sur papier.
      </p>

      {chargement ? (
        <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>
      ) : code ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="font-mono text-3xl font-bold tracking-[0.3em]">
              {code.code}
            </p>

            {(() => {
              const etat = etatAcces(code)

              return (
                <div
                  className="mt-3 rounded-lg border p-3"
                  style={
                    etat.alerte
                      ? {
                          background: "oklch(0.80 0.14 78 / 0.12)",
                          borderColor: "oklch(0.57 0.14 78 / 0.5)",
                        }
                      : undefined
                  }
                >
                  <p className="text-sm font-medium">{etat.titre}</p>

                  {etat.detail && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {etat.detail}
                    </p>
                  )}
                </div>
              )
            })()}

            {/*
              La date exacte reste lisible, en petit : « il y a deux mois »
              suffit pour décider, mais pas pour retrouver la trace d'une
              remise dans un cahier de secrétariat.
            */}
            <p className="mt-2 text-xs text-muted-foreground">
              Code créé le{" "}
              {new Date(code.created_at).toLocaleDateString("fr-FR")}
              {code.last_used_at
                ? ` · dernière ouverture le ${new Date(code.last_used_at).toLocaleDateString("fr-FR")}`
                : ""}
            </p>
          </div>

          {peutEcrire && (
            <button
              type="button"
              onClick={retirer}
              className="rounded-md border px-4 py-2 text-sm text-destructive hover:bg-muted"
            >
              Retirer cet accès
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {peutEcrire ? (
            <button
              type="button"
              onClick={engendrer}
              disabled={envoi}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {envoi ? "Création…" : "Créer le code d'accès"}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun accès ouvert. Seule la direction peut en créer un.
            </p>
          )}
        </div>
      )}

      {erreur && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {erreur}
        </p>
      )}
    </div>
  )
}
