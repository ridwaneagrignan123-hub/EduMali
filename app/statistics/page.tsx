"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

/*
 * Rapport statistique, destiné au papier.
 *
 * Ce qui est à l'écran n'est qu'un aperçu de la feuille A4 : les
 * sélecteurs disparaissent à l'impression, le reste sort tel quel. Le
 * rapport peut occuper deux pages ou un recto-verso selon le nombre de
 * matières — on ne comprime rien, on laisse le flux se répartir et on
 * empêche seulement les tableaux et les blocs de signature d'être coupés
 * en deux.
 *
 * L'espace d'observation est volontairement VIDE : l'enseignant y écrit
 * à la main, une fois la feuille sortie. Ce n'est pas un champ de
 * saisie, et rien n'est enregistré.
 *
 * Les chiffres viennent des fonctions stats_* en base, qui ne rendent
 * que des agrégats — jamais un nom d'élève, jamais une note isolée.
 */

type StatMatiere = {
  matiere: string
  eleves: number
  moyenne: number | null
  admis: number
  non_admis: number
  taux_admis: number | null
  masque: boolean
}

type Resume = {
  eleves: number
  moyenne_generale: number | null
  admis: number
  non_admis: number
  taux_admis: number | null
  meilleure: number | null
  plus_basse: number | null
  masque: boolean
}

type Comparaison = {
  matiere: string
  eleves_a: number
  admis_a: number
  non_admis_a: number
  taux_a: number | null
  moyenne_a: number | null
  eleves_b: number
  admis_b: number
  non_admis_b: number
  taux_b: number | null
  moyenne_b: number | null
  ecart_taux: number | null
}

type Option = { id: string; name: string }

export default function StatisticsPage() {
  const router = useRouter()

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const [ecole, setEcole] = useState("")
  const [classes, setClasses] = useState<Option[]>([])
  const [periodes, setPeriodes] = useState<Option[]>([])

  const [classeId, setClasseId] = useState("")
  const [periodeId, setPeriodeId] = useState("")
  const [comparerA, setComparerA] = useState("")
  const [comparerB, setComparerB] = useState("")

  const [matieres, setMatieres] = useState<StatMatiere[]>([])
  const [resume, setResume] = useState<Resume | null>(null)
  const [comparaison, setComparaison] = useState<Comparaison[]>([])

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

      const { data: profil } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle()

      if (!profil?.school_id) {
        router.push("/setup-school")
        return
      }

      const [ecoleResultat, classesResultat, periodesResultat] =
        await Promise.all([
          supabase
            .from("schools")
            .select("name")
            .eq("id", profil.school_id)
            .maybeSingle(),
          supabase.from("classes").select("id, name").order("name"),
          supabase.from("academic_periods").select("id, name").order("name"),
        ])

      if (annule) return

      setEcole(ecoleResultat.data?.name ?? "")
      setClasses(classesResultat.data ?? [])
      setPeriodes(periodesResultat.data ?? [])
      setChargement(false)
    }

    charger()
    return () => {
      annule = true
    }
  }, [router])

  useEffect(() => {
    let annule = false

    async function calculer() {
      const [matieresResultat, resumeResultat] = await Promise.all([
        supabase.rpc("stats_subjects", {
          p_period_id: periodeId || null,
          p_class_id: classeId || null,
        }),
        supabase.rpc("stats_summary", {
          p_period_id: periodeId || null,
          p_class_id: classeId || null,
        }),
      ])

      if (annule) return

      if (matieresResultat.error || resumeResultat.error) {
        console.error(
          "Erreur statistiques :",
          matieresResultat.error ?? resumeResultat.error
        )
        setErreur("Les statistiques n'ont pas pu être calculées.")
        return
      }

      setErreur(null)
      setMatieres(matieresResultat.data ?? [])
      setResume(resumeResultat.data?.[0] ?? null)
    }

    calculer()
    return () => {
      annule = true
    }
  }, [periodeId, classeId])

  useEffect(() => {
    let annule = false

    async function comparer() {
      if (!comparerA || !comparerB || comparerA === comparerB) {
        setComparaison([])
        return
      }

      const { data, error } = await supabase.rpc("stats_compare_periods", {
        p_a: comparerA,
        p_b: comparerB,
        p_class_id: classeId || null,
      })

      if (annule) return

      if (error) {
        console.error("Erreur comparaison :", error)
        setErreur("La comparaison n'a pas pu être calculée.")
        return
      }

      setComparaison(data ?? [])
    }

    comparer()
    return () => {
      annule = true
    }
  }, [comparerA, comparerB, classeId])

  const nomClasse = useMemo(
    () => classes.find((classe) => classe.id === classeId)?.name ?? "Toutes les classes",
    [classes, classeId]
  )

  const nomPeriode = useMemo(
    () => periodes.find((p) => p.id === periodeId)?.name ?? "Année entière",
    [periodes, periodeId]
  )

  const nomPeriodeA = periodes.find((p) => p.id === comparerA)?.name ?? ""
  const nomPeriodeB = periodes.find((p) => p.id === comparerB)?.name ?? ""

  const totaux = useMemo(() => {
    return matieres.reduce(
      (somme, matiere) => ({
        eleves: somme.eleves + matiere.eleves,
        admis: somme.admis + matiere.admis,
        non_admis: somme.non_admis + matiere.non_admis,
      }),
      { eleves: 0, admis: 0, non_admis: 0 }
    )
  }, [matieres])

  if (chargement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement...</p>
      </main>
    )
  }

  return (
    <main className="stats-main min-h-screen bg-muted/30">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }

          /* Un tableau coupé en deux pages perd ses en-têtes de colonne. */
          .stats-bloc {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Les signatures ne doivent jamais partir seules sur une page. */
          .stats-signatures {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .stats-comparaison { break-before: page; page-break-before: always; }

          .stats-feuille {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }

          .stats-main { background: white !important; min-height: 0 !important; }

          /* Les en-têtes se répètent si un long tableau franchit une page. */
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }

          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      {/* ---------- Réglages, absents du papier ---------- */}
      <div className="print-hidden border-b bg-background">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-4 p-6">
          <div className="space-y-1">
            <label htmlFor="classe" className="text-xs font-medium text-muted-foreground">
              Classe
            </label>

            <select
              id="classe"
              value={classeId}
              onChange={(event) => setClasseId(event.target.value)}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Toutes les classes</option>

              {classes.map((classe) => (
                <option key={classe.id} value={classe.id}>
                  {classe.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="periode" className="text-xs font-medium text-muted-foreground">
              Période
            </label>

            <select
              id="periode"
              value={periodeId}
              onChange={(event) => setPeriodeId(event.target.value)}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Année entière</option>

              {periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="compA" className="text-xs font-medium text-muted-foreground">
              Comparer
            </label>

            <div className="flex items-center gap-2">
              <select
                id="compA"
                value={comparerA}
                onChange={(event) => setComparerA(event.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>

                {periodes.map((periode) => (
                  <option key={periode.id} value={periode.id}>
                    {periode.name}
                  </option>
                ))}
              </select>

              <span className="text-sm text-muted-foreground">à</span>

              <select
                value={comparerB}
                onChange={(event) => setComparerB(event.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>

                {periodes.map((periode) => (
                  <option key={periode.id} value={periode.id}>
                    {periode.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ms-auto flex gap-2">
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

        {erreur && (
          <div className="mx-auto max-w-4xl px-6 pb-4">
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </p>
          </div>
        )}
      </div>

      {/* ---------- La feuille ---------- */}
      <div className="stats-feuille mx-auto my-8 max-w-4xl bg-white p-10 text-black shadow-sm">
        <header className="stats-bloc border-b-2 border-black pb-4 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide">
            {ecole || "Établissement"}
          </h1>

          <p className="mt-2 text-xl font-bold">
            Rapport statistique des résultats
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm">
            <span>
              <strong>Classe :</strong> {nomClasse}
            </span>

            <span>
              <strong>Période :</strong> {nomPeriode}
            </span>

            <span>
              <strong>Édité le :</strong>{" "}
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </header>

        {matieres.length === 0 ? (
          <p className="mt-10 text-center text-sm">
            Aucune note n&apos;a été saisie pour cette sélection : il
            n&apos;y a rien à rapporter.
          </p>
        ) : (
          <>
            {/* ---------- Résultats par matière ---------- */}
            <section className="stats-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                I. Résultats par matière
              </h2>

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-100">
                    <th className="border border-black px-2 py-1.5 text-start">
                      Matière
                    </th>
                    <th className="border border-black px-2 py-1.5">
                      Élèves notés
                    </th>
                    <th className="border border-black px-2 py-1.5">
                      Ont la moyenne
                    </th>
                    <th className="border border-black px-2 py-1.5">
                      N&apos;ont pas la moyenne
                    </th>
                    <th className="border border-black px-2 py-1.5">
                      % de réussite
                    </th>
                    <th className="border border-black px-2 py-1.5">
                      Moyenne
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {matieres.map((matiere) => (
                    <tr key={matiere.matiere}>
                      <td className="border border-black px-2 py-1.5">
                        {matiere.matiere}
                      </td>

                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {matiere.eleves}
                      </td>

                      <td className="border border-black px-2 py-1.5 text-center font-semibold tabular-nums">
                        {matiere.admis}
                      </td>

                      <td className="border border-black px-2 py-1.5 text-center font-semibold tabular-nums">
                        {matiere.non_admis}
                      </td>

                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {matiere.taux_admis === null
                          ? "—"
                          : `${Number(matiere.taux_admis).toFixed(1)} %`}
                      </td>

                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {matiere.moyenne === null
                          ? "—"
                          : Number(matiere.moyenne).toFixed(2)}
                      </td>
                    </tr>
                  ))}

                  <tr className="bg-neutral-100 font-bold">
                    <td className="border border-black px-2 py-1.5">
                      Total (toutes matières)
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {totaux.eleves}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {totaux.admis}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {totaux.non_admis}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {totaux.eleves > 0
                        ? `${((100 * totaux.admis) / totaux.eleves).toFixed(1)} %`
                        : "—"}
                    </td>

                    <td className="border border-black px-2 py-1.5" />
                  </tr>
                </tbody>
              </table>

              <p className="mt-2 text-xs italic">
                Chaque ligne compte des élèves, non des notes : un élève est
                compté « ayant la moyenne » lorsque sa moyenne dans la
                matière, pondérée par les coefficients, atteint 10 sur 20.
              </p>
            </section>

            {/* ---------- Résumé général ---------- */}
            {resume && (
              <section className="stats-bloc mt-8">
                <h2 className="mb-3 text-base font-bold uppercase">
                  II. Résumé général
                </h2>

                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Effectif noté
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {resume.eleves}
                      </td>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Moyenne générale
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {resume.moyenne_generale === null
                          ? "—"
                          : `${Number(resume.moyenne_generale).toFixed(2)} / 20`}
                      </td>
                    </tr>

                    <tr>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Élèves ayant la moyenne
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center font-bold tabular-nums">
                        {resume.admis}
                      </td>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Taux de réussite
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center font-bold tabular-nums">
                        {resume.taux_admis === null
                          ? "—"
                          : `${Number(resume.taux_admis).toFixed(1)} %`}
                      </td>
                    </tr>

                    <tr>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Élèves n&apos;ayant pas la moyenne
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center font-bold tabular-nums">
                        {resume.non_admis}
                      </td>
                      <td className="border border-black px-2 py-1.5 font-medium">
                        Plus forte / plus faible moyenne
                      </td>
                      <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                        {resume.meilleure === null
                          ? "—"
                          : `${Number(resume.meilleure).toFixed(2)} / ${Number(resume.plus_basse).toFixed(2)}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {/* ---------- Comparaison ---------- */}
        {comparaison.length > 0 && (
          <section className="stats-comparaison stats-bloc mt-8">
            <h2 className="mb-3 text-base font-bold uppercase">
              III. Comparaison — {nomPeriodeA} / {nomPeriodeB}
            </h2>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-100">
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 text-start align-bottom"
                  >
                    Matière
                  </th>
                  <th colSpan={3} className="border border-black px-2 py-1.5">
                    {nomPeriodeA}
                  </th>
                  <th colSpan={3} className="border border-black px-2 py-1.5">
                    {nomPeriodeB}
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 align-bottom"
                  >
                    Écart
                  </th>
                </tr>

                <tr className="bg-neutral-100 text-xs">
                  <th className="border border-black px-2 py-1">Moyenne</th>
                  <th className="border border-black px-2 py-1">Sans</th>
                  <th className="border border-black px-2 py-1">%</th>
                  <th className="border border-black px-2 py-1">Moyenne</th>
                  <th className="border border-black px-2 py-1">Sans</th>
                  <th className="border border-black px-2 py-1">%</th>
                </tr>
              </thead>

              <tbody>
                {comparaison.map((ligne) => (
                  <tr key={ligne.matiere}>
                    <td className="border border-black px-2 py-1.5">
                      {ligne.matiere}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.admis_a}
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.non_admis_a}
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.taux_a === null
                        ? "—"
                        : `${Number(ligne.taux_a).toFixed(1)}`}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.admis_b}
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.non_admis_b}
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {ligne.taux_b === null
                        ? "—"
                        : `${Number(ligne.taux_b).toFixed(1)}`}
                    </td>

                    <td className="border border-black px-2 py-1.5 text-center font-semibold tabular-nums">
                      {ligne.ecart_taux === null
                        ? "—"
                        : `${Number(ligne.ecart_taux) > 0 ? "+" : ""}${Number(ligne.ecart_taux).toFixed(1)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-2 text-xs italic">
              « Moyenne » : élèves ayant obtenu 10 sur 20 ou plus dans la
              matière. « Sans » : ceux qui ne l&apos;ont pas obtenue.
              L&apos;écart est la différence de taux de réussite, en points.
            </p>
          </section>
        )}

        {/* ---------- Observations, à remplir à la main ---------- */}
        <section className="stats-bloc mt-8">
          <h2 className="mb-3 text-base font-bold uppercase">
            {comparaison.length > 0 ? "IV." : "III."} Observations de
            l&apos;enseignant
          </h2>

          {/*
            Volontairement vide : ces lignes se remplissent au stylo,
            une fois la feuille sortie de l'imprimante.
          */}
          <div className="border border-black">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-8 border-b border-dotted border-neutral-400 last:border-b-0"
              />
            ))}
          </div>
        </section>

        {/* ---------- Signatures ---------- */}
        <section className="stats-signatures mt-10 flex justify-between gap-8">
          <div className="w-64">
            <p className="text-sm font-semibold">L&apos;Enseignant</p>

            <p className="mt-1 text-xs italic">Nom et signature</p>

            <div className="mt-16 border-t border-black" />
          </div>

          <div className="w-64 text-end">
            <p className="text-sm font-semibold">Le Directeur</p>

            <p className="mt-1 text-xs italic">Nom, signature et cachet</p>

            <div className="mt-16 border-t border-black" />
          </div>
        </section>
      </div>
    </main>
  )
}
