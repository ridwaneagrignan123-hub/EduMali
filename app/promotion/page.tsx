"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"
import { AvertissementDirection } from "@/components/avertissement-direction"

/*
 * Passage de classe en masse, à la rentrée.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CET ÉCRAN EXISTE
 *
 * Au changement d'année, chaque élève doit être réinscrit dans sa
 * nouvelle classe. Sans outil, c'est la ressaisie de tout l'effectif —
 * le moment de l'année où un secrétaire abandonne le logiciel.
 * ---------------------------------------------------------------------
 *
 * L'unicité (student_id, academic_year_id) rend l'opération IDEMPOTENTE :
 * un élève déjà inscrit dans l'année cible est ignoré, pas rejeté. On
 * relance le passage sans rien dupliquer ni rien casser — ce qui compte
 * quand l'opération porte sur cent élèves et qu'on ne sait plus où elle
 * s'est arrêtée.
 */

/* Réservé aux rôles qui gèrent déjà les inscriptions (eleves.gerer). */
const ROLES_AUTORISES = [
  "admin",
  "promoteur",
  "directeur_general",
  "directeur_direction",
]

type AcademicYear = {
  id: string
  name: string
  is_active: boolean
}

type ClassItem = {
  id: string
  name: string
  level: string | null
}

type Student = {
  id: string
  first_name: string
  last_name: string
  student_number: string | null
}

/* Ce que l'on fait de chaque élève au passage. */
type Decision = "promouvoir" | "redouble" | "exclure"

export default function PromotionPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES)

  const [years, setYears] = useState<AcademicYear[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])

  const [sourceYearId, setSourceYearId] = useState("")
  const [sourceClassId, setSourceClassId] = useState("")
  const [targetYearId, setTargetYearId] = useState("")
  const [targetClassId, setTargetClassId] = useState("")

  /*
   * Où atterrissent les redoublants. Souvent la classe source elle-même,
   * portée sur l'année cible : l'élève reprend le même niveau.
   */
  const [repeatClassId, setRepeatClassId] = useState("")

  const [students, setStudents] = useState<Student[]>([])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  /* Élèves déjà inscrits dans l'année cible, quelle que soit la classe. */
  const [dejaInscrits, setDejaInscrits] = useState<Record<string, string>>({})

  const [searchTerm, setSearchTerm] = useState("")
  const [chargement, setChargement] = useState(true)
  const [chargementEffectif, setChargementEffectif] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [bilan, setBilan] = useState<string | null>(null)

  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId
    let annule = false

    async function charger() {
      const [yearsResult, classesResult] = await Promise.all([
        supabase
          .from("academic_years")
          .select("id, name, is_active")
          .eq("school_id", schoolId)
          .order("start_date", { ascending: false }),

        supabase
          .from("classes")
          .select("id, name, level")
          .eq("school_id", schoolId)
          .order("name"),
      ])

      if (annule) {
        return
      }

      if (yearsResult.error || classesResult.error) {
        console.error(
          "Erreur chargement :",
          yearsResult.error ?? classesResult.error
        )
        setErreur("Les années scolaires et les classes n'ont pas pu être lues.")
        setChargement(false)
        return
      }

      const annees = (yearsResult.data as AcademicYear[]) ?? []
      setYears(annees)
      setClasses((classesResult.data as ClassItem[]) ?? [])

      /*
       * Proposition par défaut la plus fréquente : on part de l'année
       * active et on inscrit dans la suivante, c'est-à-dire la plus
       * récente. L'utilisateur reste libre de changer.
       */
      const active = annees.find((annee) => annee.is_active)
      setSourceYearId(active?.id ?? annees[1]?.id ?? annees[0]?.id ?? "")
      setTargetYearId(annees[0]?.id ?? "")

      setChargement(false)
    }

    charger()

    return () => {
      annule = true
    }
  }, [gate])

  /* L'effectif de la classe source, et ce qui existe déjà côté cible. */
  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId
    const classeId = sourceClassId
    const anneeId = sourceYearId
    let annule = false

    /*
     * La remise à zéro se fait DANS la fonction asynchrone, pas dans le
     * corps de l'effet : un setState synchrone y déclencherait un rendu
     * en cascade.
     */
    async function chargerEffectif() {
      if (!classeId || !anneeId) {
        setStudents([])
        setDecisions({})
        return
      }

      setChargementEffectif(true)
      setErreur(null)
      setBilan(null)

      const { data, error } = await supabase
        .from("student_class_enrollments")
        .select(
          "student_id, students ( id, first_name, last_name, student_number )"
        )
        .eq("school_id", schoolId)
        .eq("class_id", classeId)
        .eq("academic_year_id", anneeId)

      if (annule) {
        return
      }

      if (error) {
        console.error("Erreur effectif :", error)
        setErreur("L'effectif de cette classe n'a pas pu être lu.")
        setStudents([])
        setChargementEffectif(false)
        return
      }

      const eleves = (data ?? [])
        .map((ligne) => (ligne as unknown as { students: Student }).students)
        .filter(Boolean)
        .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr"))

      setStudents(eleves)

      // Tout le monde monte par défaut : c'est le cas de très loin le plus
      // fréquent, et l'écran sert à signaler les exceptions.
      const parDefaut: Record<string, Decision> = {}
      eleves.forEach((eleve) => {
        parDefaut[eleve.id] = "promouvoir"
      })
      setDecisions(parDefaut)

      setChargementEffectif(false)
    }

    chargerEffectif()

    return () => {
      annule = true
    }
  }, [gate, sourceClassId, sourceYearId])

  /*
   * Ce qui existe déjà dans l'année cible. On le lit AVANT de valider
   * pour l'annoncer, plutôt que de laisser l'utilisateur découvrir que
   * la moitié de sa liste n'a rien fait.
   */
  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId
    const anneeCible = targetYearId
    const liste = students
    let annule = false

    async function chargerCible() {
      if (!anneeCible || liste.length === 0) {
        setDejaInscrits({})
        return
      }

      const { data, error } = await supabase
        .from("student_class_enrollments")
        .select("student_id, classes ( name )")
        .eq("school_id", schoolId)
        .eq("academic_year_id", anneeCible)
        .in(
          "student_id",
          liste.map((eleve) => eleve.id)
        )

      if (annule) {
        return
      }

      if (error) {
        console.error("Erreur inscriptions cibles :", error)
        return
      }

      const table: Record<string, string> = {}

      ;(data ?? []).forEach((ligne) => {
        const row = ligne as unknown as {
          student_id: string
          classes: { name: string } | null
        }

        table[row.student_id] = row.classes?.name ?? "une autre classe"
      })

      setDejaInscrits(table)
    }

    chargerCible()

    return () => {
      annule = true
    }
  }, [gate, targetYearId, students])

  const elevesFiltres = useMemo(
    () =>
      students.filter((eleve) =>
        matchesSearch(
          searchTerm,
          eleve.first_name,
          eleve.last_name,
          eleve.student_number
        )
      ),
    [students, searchTerm]
  )

  const compte = useMemo(() => {
    let promus = 0
    let redoublants = 0
    let exclus = 0
    let ignores = 0

    students.forEach((eleve) => {
      if (dejaInscrits[eleve.id]) {
        ignores++
        return
      }

      const decision = decisions[eleve.id] ?? "promouvoir"

      if (decision === "promouvoir") promus++
      else if (decision === "redouble") redoublants++
      else exclus++
    })

    return { promus, redoublants, exclus, ignores }
  }, [students, decisions, dejaInscrits])

  function nomClasse(id: string) {
    return classes.find((item) => item.id === id)?.name ?? ""
  }

  async function validerLePassage() {
    if (gate.statut !== "autorise") {
      return
    }

    if (!targetYearId || !targetClassId) {
      setErreur("Choisissez l'année et la classe d'arrivée.")
      return
    }

    if (targetYearId === sourceYearId && targetClassId === sourceClassId) {
      setErreur(
        "La classe d'arrivée est la classe de départ : il n'y a rien à faire."
      )
      return
    }

    if (compte.redoublants > 0 && !repeatClassId) {
      setErreur(
        "Choisissez la classe des redoublants, ou retirez-leur cette marque."
      )
      return
    }

    const lignes = students
      .filter((eleve) => !dejaInscrits[eleve.id])
      .map((eleve) => ({
        eleve,
        decision: decisions[eleve.id] ?? "promouvoir",
      }))
      .filter((item) => item.decision !== "exclure")
      .map((item) => ({
        school_id: gate.schoolId,
        student_id: item.eleve.id,
        academic_year_id: targetYearId,
        class_id:
          item.decision === "redouble" ? repeatClassId : targetClassId,
      }))

    if (lignes.length === 0) {
      setErreur("Aucun élève à inscrire : tout est déjà fait ou exclu.")
      return
    }

    setEnregistrement(true)
    setErreur(null)
    setBilan(null)

    /*
     * `ignoreDuplicates` porte l'idempotence : un élève déjà inscrit dans
     * l'année cible — parce qu'on relance le passage, ou parce qu'un
     * collègue l'a fait entre-temps — est ignoré au lieu de faire échouer
     * les cent autres.
     */
    const { data, error } = await supabase
      .from("student_class_enrollments")
      .upsert(lignes, {
        onConflict: "student_id,academic_year_id",
        ignoreDuplicates: true,
      })
      .select("student_id")

    setEnregistrement(false)

    if (error) {
      console.error("Erreur passage de classe :", error)
      setErreur(error.message || "Le passage de classe a échoué.")
      return
    }

    const inscrits = (data ?? []).length
    const ignores = lignes.length - inscrits

    setBilan(
      `${inscrits} élève(s) inscrit(s) pour ${
        years.find((annee) => annee.id === targetYearId)?.name ?? "l'année cible"
      }.` +
        (ignores > 0
          ? ` ${ignores} étai(en)t déjà inscrit(s) et n'ont pas été touché(s).`
          : "")
    )

    // On relit la cible : les lignes passent en « déjà inscrit ».
    setStudents((liste) => [...liste])
  }

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">
              Passage de classe
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Réinscrivez toute une classe dans l&apos;année suivante en une
              fois.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>

        <AvertissementDirection />

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {bilan && (
          <div className="rounded-lg border p-4 text-sm">{bilan}</div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Chargement...</p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-xl border bg-background p-6">
                <h2 className="font-semibold">D&apos;où partent-ils</h2>

                <div className="space-y-2">
                  <label htmlFor="source-year">Année de départ</label>

                  <select
                    id="source-year"
                    value={sourceYearId}
                    onChange={(event) => setSourceYearId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Choisir...</option>

                    {years.map((annee) => (
                      <option key={annee.id} value={annee.id}>
                        {annee.name}
                        {annee.is_active ? " (en cours)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="source-class">Classe de départ</label>

                  <select
                    id="source-class"
                    value={sourceClassId}
                    onChange={(event) => setSourceClassId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Choisir...</option>

                    {classes.map((classe) => (
                      <option key={classe.id} value={classe.id}>
                        {classe.name}
                        {classe.level ? ` — ${classe.level}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border bg-background p-6">
                <h2 className="font-semibold">Où vont-ils</h2>

                <div className="space-y-2">
                  <label htmlFor="target-year">Année d&apos;arrivée</label>

                  <select
                    id="target-year"
                    value={targetYearId}
                    onChange={(event) => setTargetYearId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Choisir...</option>

                    {years.map((annee) => (
                      <option key={annee.id} value={annee.id}>
                        {annee.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="target-class">Classe d&apos;arrivée</label>

                  <select
                    id="target-class"
                    value={targetClassId}
                    onChange={(event) => setTargetClassId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Choisir...</option>

                    {classes.map((classe) => (
                      <option key={classe.id} value={classe.id}>
                        {classe.name}
                        {classe.level ? ` — ${classe.level}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/*
                  Le redoublant ne monte pas : il est réinscrit dans une
                  classe du même niveau, souvent la classe de départ
                  portée sur l'année suivante.
                */}
                <div className="space-y-2">
                  <label htmlFor="repeat-class">
                    Classe des redoublants
                    {compte.redoublants > 0 ? " *" : ""}
                  </label>

                  <select
                    id="repeat-class"
                    value={repeatClassId}
                    onChange={(event) => setRepeatClassId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Aucune</option>

                    {classes.map((classe) => (
                      <option key={classe.id} value={classe.id}>
                        {classe.name}
                        {classe.level ? ` — ${classe.level}` : ""}
                      </option>
                    ))}
                  </select>

                  <p className="text-xs text-muted-foreground">
                    Où sont réinscrits ceux qui redoublent, pour
                    l&apos;année d&apos;arrivée. Souvent la classe de
                    départ elle-même.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-background p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">
                    Élèves de {nomClasse(sourceClassId) || "la classe choisie"}
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {students.length} élève(s) — {compte.promus} promu(s),{" "}
                    {compte.redoublants} redoublant(s), {compte.exclus}{" "}
                    exclu(s)
                    {compte.ignores > 0
                      ? `, ${compte.ignores} déjà inscrit(s)`
                      : ""}
                  </p>
                </div>

                {students.length > 0 && (
                  <input
                    type="search"
                    placeholder="Rechercher un élève"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  />
                )}
              </div>

              {chargementEffectif ? (
                <p className="mt-6 text-muted-foreground">
                  Lecture de l&apos;effectif...
                </p>
              ) : students.length === 0 ? (
                <p className="mt-6 text-muted-foreground">
                  Choisissez une année et une classe de départ pour voir son
                  effectif.
                </p>
              ) : (
                <>
                  <div className="mt-6 space-y-2">
                    {elevesFiltres.map((eleve) => {
                      const deja = dejaInscrits[eleve.id]
                      const decision = decisions[eleve.id] ?? "promouvoir"

                      return (
                        <div
                          key={eleve.id}
                          className="flex flex-wrap items-center gap-4 rounded-lg border p-3"
                        >
                          <div className="min-w-[220px] flex-1">
                            <p className="font-medium">
                              {eleve.last_name} {eleve.first_name}
                            </p>

                            {eleve.student_number && (
                              <p className="text-xs text-muted-foreground">
                                Matricule : {eleve.student_number}
                              </p>
                            )}
                          </div>

                          {deja ? (
                            <span className="text-sm text-muted-foreground">
                              Déjà inscrit en {deja} — sera ignoré
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-4 text-sm">
                              {(
                                [
                                  ["promouvoir", "Monte"],
                                  ["redouble", "Redouble"],
                                  ["exclure", "Ne réinscrit pas"],
                                ] as [Decision, string][]
                              ).map(([valeur, libelle]) => (
                                <label
                                  key={valeur}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="radio"
                                    name={`decision-${eleve.id}`}
                                    checked={decision === valeur}
                                    onChange={() =>
                                      setDecisions((current) => ({
                                        ...current,
                                        [eleve.id]: valeur,
                                      }))
                                    }
                                  />

                                  {libelle}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      onClick={validerLePassage}
                      disabled={enregistrement}
                      className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enregistrement
                        ? "Inscription en cours..."
                        : `Inscrire ${compte.promus + compte.redoublants} élève(s)`}
                    </button>

                    <p className="text-xs text-muted-foreground">
                      Relancer cette opération ne crée pas de doublon : un
                      élève déjà inscrit dans l&apos;année d&apos;arrivée est
                      ignoré.
                    </p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
