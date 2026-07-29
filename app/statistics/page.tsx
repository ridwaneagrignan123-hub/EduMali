"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

/*
 * Statistiques de l'établissement.
 *
 * Ouverte à tout le personnel, y compris à un enseignant qui ne voit
 * que sa classe ailleurs dans l'application. Ce n'est pas une entorse au
 * cloisonnement : les chiffres viennent des fonctions stats_* en base,
 * qui ne rendent que des agrégats — jamais un nom d'élève, jamais une
 * note isolée.
 *
 * Une classe comptant moins de trois notes est masquée : en deçà, une
 * « moyenne » est la note d'un élève identifiable.
 */

type StatClasse = {
  classe_id: string
  classe: string
  direction: string | null
  eleves: number
  moyenne: number | null
  taux_reussite: number | null
  note_min: number | null
  note_max: number | null
  masque: boolean
}

type Evaluation = {
  id: string
  titre: string
  classe: string
  matiere: string | null
  date_eval: string | null
  periode: string | null
}

type Comparaison = {
  classe: string
  eleves_communs: number
  moyenne_a: number | null
  moyenne_b: number | null
  ecart: number | null
  progressions: number
  regressions: number
  stables: number
  masque: boolean
}

type Periode = { id: string; name: string }

function couleurMoyenne(valeur: number | null) {
  if (valeur === null) return "oklch(0.6 0.02 60)"
  if (valeur >= 14) return "oklch(0.55 0.13 155)"
  if (valeur >= 10) return "oklch(0.585 0.16 38)"
  return "oklch(0.55 0.19 25)"
}

export default function StatisticsPage() {
  const router = useRouter()

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [classes, setClasses] = useState<StatClasse[]>([])

  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [evalA, setEvalA] = useState("")
  const [evalB, setEvalB] = useState("")
  const [comparaison, setComparaison] = useState<Comparaison[] | null>(null)
  const [comparaisonEnCours, setComparaisonEnCours] = useState(false)

  useEffect(() => {
    let annule = false

    async function charger() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const [periodesResultat, evaluationsResultat] = await Promise.all([
        supabase.from("academic_periods").select("id, name").order("name"),
        supabase.rpc("stats_assessments"),
      ])

      if (annule) return

      if (evaluationsResultat.error) {
        console.error("Erreur évaluations :", evaluationsResultat.error)
        setErreur("Impossible de charger la liste des évaluations.")
      }

      setPeriodes(periodesResultat.data ?? [])
      setEvaluations(evaluationsResultat.data ?? [])
      setChargement(false)
    }

    charger()
    return () => {
      annule = true
    }
  }, [router])

  useEffect(() => {
    let annule = false

    async function chargerClasses() {
      const { data, error } = await supabase.rpc("stats_classes", {
        p_period_id: periodeId || null,
      })

      if (annule) return

      if (error) {
        console.error("Erreur statistiques :", error)
        setErreur("Impossible de calculer les statistiques.")
        return
      }

      setErreur(null)
      setClasses(data ?? [])
    }

    chargerClasses()
    return () => {
      annule = true
    }
  }, [periodeId])

  async function comparer() {
    if (!evalA || !evalB || evalA === evalB) {
      return
    }

    setComparaisonEnCours(true)

    const { data, error } = await supabase.rpc("stats_compare_assessments", {
      p_a: evalA,
      p_b: evalB,
    })

    setComparaisonEnCours(false)

    if (error) {
      console.error("Erreur comparaison :", error)
      setErreur("La comparaison n'a pas pu être calculée.")
      return
    }

    setErreur(null)
    setComparaison(data ?? [])
  }

  const visibles = useMemo(
    () => classes.filter((classe) => !classe.masque),
    [classes]
  )

  const masquees = classes.length - visibles.length

  const moyenneEcole = useMemo(() => {
    const avecNote = visibles.filter((classe) => classe.moyenne !== null)

    if (avecNote.length === 0) return null

    const total = avecNote.reduce(
      (somme, classe) => somme + Number(classe.moyenne) * classe.eleves,
      0
    )
    const effectif = avecNote.reduce((somme, classe) => somme + classe.eleves, 0)

    return effectif > 0 ? total / effectif : null
  }, [visibles])

  const meilleure = useMemo(
    () =>
      visibles
        .filter((c) => c.moyenne !== null)
        .sort((a, b) => Number(b.moyenne) - Number(a.moyenne))[0] ?? null,
    [visibles]
  )

  function libelleEvaluation(evaluation: Evaluation) {
    const morceaux = [evaluation.titre, evaluation.classe]

    if (evaluation.matiere) morceaux.push(evaluation.matiere)
    if (evaluation.date_eval) {
      morceaux.push(new Date(evaluation.date_eval).toLocaleDateString("fr-FR"))
    }

    return morceaux.join(" — ")
  }

  if (chargement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement des statistiques...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Statistiques</h1>

            <p className="mt-2 text-muted-foreground">
              Comparaison des classes et des évaluations. Les chiffres sont
              des moyennes : aucune note d&apos;élève n&apos;y figure.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {/* ---------- Vue d'ensemble ---------- */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-background p-6">
            <p className="text-sm text-muted-foreground">Moyenne générale</p>

            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: couleurMoyenne(moyenneEcole) }}
            >
              {moyenneEcole === null
                ? "—"
                : `${moyenneEcole.toFixed(2)} / 20`}
            </p>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <p className="text-sm text-muted-foreground">Classes comparées</p>
            <p className="mt-2 text-3xl font-bold">{visibles.length}</p>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <p className="text-sm text-muted-foreground">Meilleure moyenne</p>

            <p className="mt-2 text-xl font-bold">
              {meilleure ? meilleure.classe : "—"}
            </p>

            {meilleure && (
              <p className="text-sm text-muted-foreground">
                {Number(meilleure.moyenne).toFixed(2)} / 20
              </p>
            )}
          </div>
        </div>

        {/* ---------- Comparaison des classes ---------- */}
        <div className="rounded-xl border bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Comparaison des classes</h2>

            <select
              value={periodeId}
              onChange={(event) => setPeriodeId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Toute l&apos;année</option>

              {periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.name}
                </option>
              ))}
            </select>
          </div>

          {visibles.length === 0 ? (
            <p className="mt-6 text-muted-foreground">
              Aucune note saisie sur cette période : il n&apos;y a rien à
              comparer pour l&apos;instant.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Classe</th>
                    <th className="pb-2 pr-4 font-medium">Élèves</th>
                    <th className="pb-2 pr-4 font-medium">Moyenne</th>
                    <th className="pb-2 pr-4 font-medium">Réussite</th>
                    <th className="pb-2 pr-4 font-medium">Min</th>
                    <th className="pb-2 font-medium">Max</th>
                  </tr>
                </thead>

                <tbody>
                  {visibles.map((classe) => (
                    <tr key={classe.classe_id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-medium">{classe.classe}</span>

                        {classe.direction && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {classe.direction}
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-4 tabular-nums">{classe.eleves}</td>

                      <td className="py-3 pr-4">
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: couleurMoyenne(classe.moyenne) }}
                        >
                          {Number(classe.moyenne).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${classe.taux_reussite ?? 0}%`,
                                background: couleurMoyenne(classe.moyenne),
                              }}
                            />
                          </div>

                          <span className="tabular-nums text-muted-foreground">
                            {Number(classe.taux_reussite).toFixed(0)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                        {Number(classe.note_min).toFixed(2)}
                      </td>

                      <td className="py-3 tabular-nums text-muted-foreground">
                        {Number(classe.note_max).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {masquees > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {masquees === 1
                ? "1 classe est masquée"
                : `${masquees} classes sont masquées`}{" "}
              : moins de trois notes y ont été saisies, et une moyenne
              calculée sur si peu reviendrait à publier la note d&apos;un
              élève reconnaissable.
            </p>
          )}
        </div>

        {/* ---------- Comparaison de deux évaluations ---------- */}
        <div className="rounded-xl border bg-background p-6">
          <h2 className="text-xl font-semibold">
            Comparer deux évaluations
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Les notes sont ramenées sur 20 : un devoir sur 10 et une
            composition sur 20 restent comparables.
          </p>

          {evaluations.length < 2 ? (
            <p className="mt-6 text-muted-foreground">
              Il faut au moins deux évaluations pour en comparer deux.
            </p>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="evalA" className="text-sm font-medium">
                    Première évaluation
                  </label>

                  <select
                    id="evalA"
                    value={evalA}
                    onChange={(event) => setEvalA(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">À choisir</option>

                    {evaluations.map((evaluation) => (
                      <option key={evaluation.id} value={evaluation.id}>
                        {libelleEvaluation(evaluation)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="evalB" className="text-sm font-medium">
                    Seconde évaluation
                  </label>

                  <select
                    id="evalB"
                    value={evalB}
                    onChange={(event) => setEvalB(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">À choisir</option>

                    {evaluations.map((evaluation) => (
                      <option key={evaluation.id} value={evaluation.id}>
                        {libelleEvaluation(evaluation)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {evalA && evalB && evalA === evalB && (
                <p className="mt-3 text-sm text-destructive">
                  Choisissez deux évaluations différentes.
                </p>
              )}

              <button
                onClick={comparer}
                disabled={!evalA || !evalB || evalA === evalB || comparaisonEnCours}
                className="mt-4 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {comparaisonEnCours ? "Calcul..." : "Comparer"}
              </button>
            </>
          )}

          {comparaison && comparaison.length === 0 && (
            <p className="mt-6 text-muted-foreground">
              Aucun élève n&apos;a de note dans les deux évaluations : il
              n&apos;y a rien à comparer.
            </p>
          )}

          {comparaison && comparaison.length > 0 && (
            <div className="mt-6 space-y-3">
              {comparaison.map((ligne) => (
                <div key={ligne.classe} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{ligne.classe}</p>

                      <p className="text-xs text-muted-foreground">
                        {ligne.eleves_communs} élève
                        {ligne.eleves_communs > 1 ? "s" : ""} noté
                        {ligne.eleves_communs > 1 ? "s" : ""} dans les deux
                      </p>
                    </div>

                    {ligne.masque ? (
                      <p className="text-sm text-muted-foreground">
                        Trop peu d&apos;élèves pour publier une moyenne.
                      </p>
                    ) : (
                      <div className="flex items-center gap-3 text-sm tabular-nums">
                        <span>{Number(ligne.moyenne_a).toFixed(2)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span>{Number(ligne.moyenne_b).toFixed(2)}</span>

                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            color:
                              Number(ligne.ecart) >= 0
                                ? "oklch(0.45 0.13 155)"
                                : "oklch(0.5 0.19 25)",
                            background:
                              Number(ligne.ecart) >= 0
                                ? "oklch(0.55 0.13 155 / 0.15)"
                                : "oklch(0.55 0.19 25 / 0.13)",
                          }}
                        >
                          {Number(ligne.ecart) >= 0 ? "+" : ""}
                          {Number(ligne.ecart).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>{ligne.progressions} en progrès</span>
                    <span>{ligne.stables} stables</span>
                    <span>{ligne.regressions} en recul</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
