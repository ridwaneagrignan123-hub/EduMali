"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AvertissementDirection } from "@/components/avertissement-direction"

type ClassItem = {
  id: string
  name: string
  level: string | null
}

/* Le lien classe-matiere : ce que la classe etudie. */
type ClassSubjectLien = {
  class_id: string
  subject_id: string
}

type Subject = {
  id: string
  name: string
  code: string | null
}

type AcademicYear = {
  id: string
  name: string
  is_active: boolean
}

type AcademicPeriod = {
  id: string
  academic_year_id: string
  name: string
  period_type: string
  is_active: boolean
}

type Assessment = {
  id: string
  class_id: string
  subject_id: string
  academic_period_id: string
  title: string
  assessment_type: string
  max_score: number
  coefficient: number
  assessment_date: string
  classes: {
    name: string
  } | null
  subjects: {
    name: string
  } | null
  academic_periods: {
    name: string
  } | null
}

export default function AssessmentsPage() {
  const router = useRouter()

  const [schoolId, setSchoolId] = useState("")
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])

  /* Quelles matières chaque classe étudie — la source unique. */
  const [classSubjects, setClassSubjects] = useState<ClassSubjectLien[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [academicPeriodId, setAcademicPeriodId] = useState("")
  const [title, setTitle] = useState("")
  const [assessmentType, setAssessmentType] = useState("test")
  const [maxScore, setMaxScore] = useState("20")
  const [coefficient, setCoefficient] = useState("1")
  const [assessmentDate, setAssessmentDate] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const [
      classesResult,
      subjectsResult,
      yearsResult,
      periodsResult,
      assessmentsResult,
      classSubjectsResult,
    ] = await Promise.all([
      supabase
        .from("classes")
        .select("id, name, level")
        .eq("school_id", profile.school_id)
        .order("name"),

      supabase
        .from("subjects")
        .select("id, name, code")
        .eq("school_id", profile.school_id)
        .order("name"),

      supabase
        .from("academic_years")
        .select("id, name, is_active")
        .eq("school_id", profile.school_id)
        .order("start_date", {
          ascending: false,
        }),

      supabase
        .from("academic_periods")
        .select(
          "id, academic_year_id, name, period_type, is_active"
        )
        .eq("school_id", profile.school_id)
        .order("start_date"),

      supabase
        .from("assessments")
        .select(`
          id,
          class_id,
          subject_id,
          academic_period_id,
          title,
          assessment_type,
          max_score,
          coefficient,
          assessment_date,
          classes (
            name
          ),
          subjects (
            name
          ),
          academic_periods (
            name
          )
        `)
        .eq("school_id", profile.school_id)
        .order("assessment_date", {
          ascending: false,
        }),

      supabase
        .from("class_subjects")
        .select("class_id, subject_id")
        .eq("school_id", profile.school_id),
    ])

    const loadErrors: string[] = []

    if (classesResult.error) {
      console.error(
        "Erreur classes :",
        classesResult.error
      )
      loadErrors.push("les classes")
    }

    if (subjectsResult.error) {
      console.error(
        "Erreur matières :",
        subjectsResult.error
      )
      loadErrors.push("les matières")
    }

    if (yearsResult.error) {
      console.error(
        "Erreur années scolaires :",
        yearsResult.error
      )
      loadErrors.push("les années scolaires")
    }

    if (periodsResult.error) {
      console.error(
        "Erreur périodes :",
        periodsResult.error
      )
      loadErrors.push("les périodes scolaires")
    }

    if (assessmentsResult.error) {
      console.error(
        "Erreur évaluations :",
        assessmentsResult.error
      )
      loadErrors.push("les évaluations")
    }

    if (loadErrors.length > 0) {
      setLoadError(
        `Impossible de charger ${loadErrors.join(", ")}. Réessayez.`
      )
    }

    const loadedYears = yearsResult.data ?? []
    const loadedPeriods = periodsResult.data ?? []

    setClasses(classesResult.data ?? [])
    setSubjects(subjectsResult.data ?? [])
    setClassSubjects((classSubjectsResult.data as ClassSubjectLien[]) ?? [])
    setYears(loadedYears)
    setPeriods(loadedPeriods)
    setAssessments(
      (assessmentsResult.data as unknown as Assessment[]) ?? []
    )

    const activeYear =
      loadedYears.find(
        (year) => year.is_active
      )

    if (activeYear) {
      const activePeriod =
        loadedPeriods.find(
          (period) =>
            period.academic_year_id ===
              activeYear.id &&
            period.is_active
        )

      if (activePeriod) {
        setAcademicPeriodId(activePeriod.id)
      }
    }

    setLoading(false)
  }

  const selectedPeriod = periods.find(
    (period) =>
      period.id === academicPeriodId
  )

  /*
   * Seules les matières AFFECTÉES à la classe choisie.
   *
   * class_subjects est la source unique de ce que la classe étudie :
   * noter une matière absente donnait un bulletin vide, puisqu'il liste
   * les matières depuis cette table. Le déclencheur
   * assessments_matiere_de_la_classe refuse de toute façon l'écriture ;
   * ce filtre ne fait que ne pas proposer ce qui sera refusé.
   */
  const availableSubjects = classId
    ? subjects.filter((subject) =>
        classSubjects.some(
          (lien) =>
            lien.class_id === classId && lien.subject_id === subject.id
        )
      )
    : []

  async function createAssessment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!classId) {
      alert("Veuillez sélectionner une classe.")
      return
    }

    if (!subjectId) {
      alert("Veuillez sélectionner une matière.")
      return
    }

    if (!academicPeriodId) {
      alert("Veuillez sélectionner une période.")
      return
    }

    if (!title.trim()) {
      alert(
        "Le titre de l'évaluation est obligatoire."
      )
      return
    }

    const maxScoreNumber = Number(maxScore)
    const coefficientNumber = Number(coefficient)

    if (
      Number.isNaN(maxScoreNumber) ||
      maxScoreNumber <= 0
    ) {
      alert(
        "La note maximale doit être supérieure à 0."
      )
      return
    }

    if (
      Number.isNaN(coefficientNumber) ||
      coefficientNumber <= 0
    ) {
      alert(
        "Le coefficient doit être supérieur à 0."
      )
      return
    }

    if (!assessmentDate) {
      alert(
        "Veuillez sélectionner une date."
      )
      return
    }

    setCreating(true)

    const { error } = await supabase
      .from("assessments")
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
        academic_period_id: academicPeriodId,
        title: title.trim(),
        assessment_type: assessmentType,
        max_score: maxScoreNumber,
        coefficient: coefficientNumber,
        assessment_date: assessmentDate,
      })

    if (error) {
      console.error(
        "Erreur création évaluation :",
        error
      )

      alert(error.message)
      setCreating(false)
      return
    }

    setClassId("")
    setSubjectId("")
    setTitle("")
    setAssessmentType("test")
    setMaxScore("20")
    setCoefficient("1")
    setAssessmentDate("")

    await loadData()

    setCreating(false)
  }

  async function deleteAssessment(
    assessmentId: string
  ) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer cette évaluation ?"
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("assessments")
      .delete()
      .eq("id", assessmentId)

    if (error) {
      console.error(
        "Erreur suppression évaluation :",
        error
      )

      alert(error.message)
      return
    }

    await loadData()
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              Ridwane
            </h1>

            <p className="text-sm text-muted-foreground">
              Gestion des évaluations
            </p>
          </div>

          <button
            onClick={() =>
              router.push("/dashboard")
            }
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-8 p-6">
        <AvertissementDirection compact />
        <div>
          <h2 className="text-3xl font-bold">
            Évaluations
          </h2>

          <p className="mt-2 text-muted-foreground">
            Créez et gérez les évaluations de vos classes.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Nouvelle évaluation
            </h3>

            <form
              onSubmit={createAssessment}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="class">
                  Classe *
                </label>

                <select
                  id="class"
                  value={classId}
                  onChange={(event) =>
                    setClassId(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une classe
                  </option>

                  {classes.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                      {item.level
                        ? ` — ${item.level}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="subject">
                  Matière *
                </label>

                <select
                  id="subject"
                  value={subjectId}
                  onChange={(event) =>
                    setSubjectId(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    {!classId
                      ? "Choisissez d'abord une classe"
                      : availableSubjects.length === 0
                        ? "Aucune matière affectée à cette classe"
                        : "Sélectionner une matière"}
                  </option>

                  {availableSubjects.map(
                    (subject) => (
                      <option
                        key={subject.id}
                        value={subject.id}
                      >
                        {subject.name}
                        {subject.code
                          ? ` (${subject.code})`
                          : ""}
                      </option>
                    )
                  )}
                </select>

                {/*
                  Une classe sans matière affectée ne peut rien recevoir :
                  on dit où aller plutôt que de laisser un sélecteur vide.
                */}
                {classId && availableSubjects.length === 0 && (
                  <p className="text-sm text-amber-600">
                    Cette classe n&apos;a encore aucune matière.{" "}
                    <button
                      type="button"
                      onClick={() => router.push("/class_subjects")}
                      className="font-medium underline"
                    >
                      Commencez par lui affecter des matières
                    </button>{" "}
                    — on ne note que ce que la classe étudie.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="period">
                  Période scolaire *
                </label>

                <select
                  id="period"
                  value={academicPeriodId}
                  onChange={(event) =>
                    setAcademicPeriodId(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une période
                  </option>

                  {periods.map((period) => (
                    <option
                      key={period.id}
                      value={period.id}
                    >
                      {period.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="title">
                  Titre de l'évaluation *
                </label>

                <input
                  id="title"
                  type="text"
                  placeholder="Ex : Devoir surveillé 1"
                  value={title}
                  onChange={(event) =>
                    setTitle(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="type">
                  Type d'évaluation
                </label>

                <select
                  id="type"
                  value={assessmentType}
                  onChange={(event) =>
                    setAssessmentType(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="test">
                    Test
                  </option>

                  <option value="homework">
                    Devoir
                  </option>

                  <option value="exam">
                    Examen
                  </option>

                  <option value="composition">
                    Composition
                  </option>

                  <option value="other">
                    Autre
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="max-score">
                    Note maximale
                  </label>

                  <input
                    id="max-score"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={maxScore}
                    onChange={(event) =>
                      setMaxScore(
                        event.target.value
                      )
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="coefficient">
                    Coefficient
                  </label>

                  <input
                    id="coefficient"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={coefficient}
                    onChange={(event) =>
                      setCoefficient(
                        event.target.value
                      )
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="date">
                  Date de l'évaluation *
                </label>

                <input
                  id="date"
                  type="date"
                  value={assessmentDate}
                  onChange={(event) =>
                    setAssessmentDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Créer l'évaluation"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Évaluations existantes
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {assessments.length} évaluation(s)
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement...
              </p>
            ) : assessments.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune évaluation enregistrée.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">
                        Évaluation
                      </th>

                      <th className="px-4 py-3">
                        Classe
                      </th>

                      <th className="px-4 py-3">
                        Matière
                      </th>

                      <th className="px-4 py-3">
                        Période
                      </th>

                      <th className="px-4 py-3">
                        Note
                      </th>

                      <th className="px-4 py-3">
                        Coef.
                      </th>

                      <th className="px-4 py-3">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {assessments.map(
                      (assessment) => (
                        <tr
                          key={assessment.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-4 font-medium">
                            {assessment.title}
                          </td>

                          <td className="px-4 py-4">
                            {assessment.classes?.name ||
                              "—"}
                          </td>

                          <td className="px-4 py-4">
                            {assessment.subjects?.name ||
                              "—"}
                          </td>

                          <td className="px-4 py-4">
                            {assessment
                              .academic_periods
                              ?.name || "—"}
                          </td>

                          <td className="px-4 py-4">
                            {assessment.max_score}
                          </td>

                          <td className="px-4 py-4">
                            {assessment.coefficient}
                          </td>

                          <td className="px-4 py-4">
                            <button
                              onClick={() =>
                                deleteAssessment(
                                  assessment.id
                                )
                              }
                              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}