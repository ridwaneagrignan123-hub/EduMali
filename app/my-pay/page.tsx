"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

/*
 * Ce que l'école doit à l'enseignant CONNECTÉ.
 *
 * ---------------------------------------------------------------------
 * POURQUOI UNE FONCTION PLUTÔT QU'UNE LECTURE DIRECTE
 *
 * Les colonnes de rémunération de `teachers` sont fermées au rôle
 * `authenticated` par des droits de colonne : un enseignant ne peut pas
 * lire son propre taux depuis la table. `my_payroll_month()` est la
 * seule voie, et elle est bornée dans son corps aux fiches dont
 * `profile_id = auth.uid()` — donc aux siennes, et à personne d'autre.
 * ---------------------------------------------------------------------
 *
 * Le montant affiché est celui des HEURES CONFIRMÉES par pointage. Il
 * n'est pas diminué des versements déjà reçus : l'enregistrement des
 * versements de salaire n'existe pas encore dans l'application.
 *
 * Un vacataire SANS compte ne verra jamais cet écran — c'est le cas le
 * plus fréquent. Son dû reste consultable et imprimable par
 * l'administration depuis la page Paie, qui n'exige aucun `profile_id`.
 */

type LigneDue = {
  enseignant_id: string
  enseignant: string
  contrat: string
  taux_horaire: number | null
  salaire_mensuel: number | null
  heures_pointees: number
  nb_pointages: number
  montant: number
  mois_cloture: boolean
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

function montant(valeur: number | null | undefined) {
  return `${Number(valeur ?? 0).toLocaleString("fr-FR")} FCFA`
}

export default function MyPayPage() {
  const router = useRouter()

  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois, setMois] = useState(maintenant.getMonth() + 1)

  const [lignes, setLignes] = useState<LigneDue[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false

    async function charger() {
      setChargement(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data, error } = await supabase.rpc("my_payroll_month", {
        p_year: annee,
        p_month: mois,
      })

      if (annule) {
        return
      }

      if (error) {
        console.error("Erreur rémunération :", error)
        setErreur("Vos heures n'ont pas pu être lues.")
        setLignes([])
      } else {
        setErreur(null)
        setLignes((data as LigneDue[]) ?? [])
      }

      setChargement(false)
    }

    charger()

    return () => {
      annule = true
    }
  }, [annee, mois, router])

  const libelleMois = `${MOIS[mois - 1]} ${annee}`

  return (
    <main className="min-h-screen bg-muted/30">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <section className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 print-hidden">
          <div>
            <h1 className="font-heading text-2xl font-bold">Ma rémunération</h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Les heures que l&apos;établissement a confirmées pour vous.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Retour
            </button>

            <button
              onClick={() => window.print()}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              Imprimer
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 print-hidden">
          <select
            value={mois}
            onChange={(event) => setMois(Number(event.target.value))}
            aria-label="Mois"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {MOIS.map((nom, index) => (
              <option key={nom} value={index + 1}>
                {nom}
              </option>
            ))}
          </select>

          <select
            value={annee}
            onChange={(event) => setAnnee(Number(event.target.value))}
            aria-label="Année"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {[annee - 1, annee, annee + 1].map((valeur) => (
              <option key={valeur} value={valeur}>
                {valeur}
              </option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Lecture de vos heures...</p>
        ) : lignes.length === 0 ? (
          <div className="rounded-xl border bg-background p-6">
            <p className="text-muted-foreground">
              Aucune fiche enseignant n&apos;est rattachée à votre compte. Si
              vous enseignez dans cet établissement, demandez à
              l&apos;administration de rattacher votre fiche.
            </p>
          </div>
        ) : (
          lignes.map((ligne) => (
            <div
              key={ligne.enseignant_id}
              className="rounded-xl border bg-background p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-lg font-bold">
                  {ligne.enseignant}
                </h2>

                <p className="text-sm text-muted-foreground">{libelleMois}</p>
              </div>

              <table className="mt-4 w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2">Contrat</td>
                    <td className="py-2 text-right font-medium">
                      {ligne.contrat === "permanent"
                        ? "Permanent"
                        : ligne.contrat === "vacataire"
                          ? "Vacataire"
                          : "Non défini"}
                    </td>
                  </tr>

                  {ligne.contrat === "vacataire" ? (
                    <>
                      <tr className="border-b">
                        <td className="py-2">Heures confirmées</td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {Number(ligne.heures_pointees).toLocaleString(
                            "fr-FR",
                            { minimumFractionDigits: 2 }
                          )}{" "}
                          h
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({ligne.nb_pointages} cours)
                          </span>
                        </td>
                      </tr>

                      <tr className="border-b">
                        <td className="py-2">Taux horaire</td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {montant(ligne.taux_horaire)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr className="border-b">
                      <td className="py-2">Salaire mensuel</td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {montant(ligne.salaire_mensuel)}
                      </td>
                    </tr>
                  )}

                  <tr className="bg-muted/50">
                    <td className="py-3 font-semibold">
                      Ce que l&apos;école vous doit
                    </td>
                    <td className="py-3 text-right text-lg font-bold tabular-nums">
                      {montant(ligne.montant)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-4 text-xs text-muted-foreground">
                {ligne.mois_cloture
                  ? "Ce mois est clôturé : ces heures sont définitives."
                  : "Ce mois n'est pas encore clôturé : le total peut encore évoluer."}{" "}
                Ce montant est celui des heures confirmées ; il ne tient pas
                compte des versements que vous avez déjà reçus.
              </p>
            </div>
          ))
        )}
      </section>
    </main>
  )
}
