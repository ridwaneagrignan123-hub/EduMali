"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type Assessment = {
  id: string
  class_id: string
  subject_id: string
  academic_period_id: string
  title: string
  max_score: number
  coefficient: number
  assessment_date: string
  classes: { name: string } | null
  subjects: { name: string } | null
  academic_periods: { name: string } | null
}

type Student = {
  id: string
  first_name: string
  last_name: string
}

type GradeEntry = {
  gradeId: string | null
  score: string
}

export default function GradesPage() {
  const router = useRouter()

  const [schoolId, setSchoolId] = useState("")

  const [loading, setLoading] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("")

  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({})

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoadError(
        "Impossible de charger votre profil. Réessayez ou reconnectez-vous."
      )
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const { data: assessmentsData, error: assessmentsError } =
      await supabase
        .from("assessments")
        .select(`
          id,
          class_id,
          subject_id,
          academic_period_id,
          title,
          max_score,
          coefficient,
          assessment_date,
          classes ( name ),
          subjects ( name ),
          academic_periods ( name )
        `)
        .eq("school_id", profile.school_id)
        .order("assessment_date", { ascending: false })

    if (assessmentsError) {
      console.error("Erreur évaluations :", assessmentsError)
      setLoadError(
        "Impossible de charger la liste des évaluations."
      )
    } else {
      setAssessments((assessmentsData as unknown as Assessment[]) ?? [])
    }

    setLoading(false)
  }

  async function loadStudentsAndGrades(assessmentId: string) {
    setSelectedAssessmentId(assessmentId)
    setSaveMessage(null)
    setStudentsError(null)

    if (!assessmentId) {
      setStudents([])
      setGrades({})
      return
    }

    const assessment = assessments.find(
      (item) => item.id === assessmentId
    )

    if (!assessment) {
      return
    }

    setLoadingStudents(true)

    const { data: enrollments, error: enrollmentError } =
      await supabase
        .from("student_class_enrollments")
        .select(`
          student_id,
          students ( id, first_name, last_name )
        `)
        .eq("school_id", schoolId)
        .eq("class_id", assessment.class_id)

    if (enrollmentError) {
      console.error("Erreur inscriptions :", enrollmentError)
      setStudentsError(
        "Impossible de charger les élèves de cette classe."
      )
      setStudents([])
      setGrades({})
      setLoadingStudents(false)
      return
    }

    const loadedStudents: Student[] = (enrollments ?? [])
      .map((enrollment: any) => enrollment.students)
      .filter(Boolean)
      .sort((a: Student, b: Student) =>
        a.last_name.localeCompare(b.last_name)
      )

    setStudents(loadedStudents)

    const { data: existingGrades, error: gradesError } =
      await supabase
        .from("grades")
        .select("id, student_id, score")
        .eq("school_id", schoolId)
        .eq("assessment_id", assessmentId)

    if (gradesError) {
      console.error("Erreur notes existantes :", gradesError)
      setStudentsError(
        "Les élèves ont été chargés, mais les notes existantes n'ont pas pu être récupérées."
      )
    }

    const gradesMap: Record<string, GradeEntry> = {}

    loadedStudents.forEach((student) => {
      const existing = (existingGrades ?? []).find(
        (grade: any) => grade.student_id === student.id
      )

      gradesMap[student.id] = {
        gradeId: existing?.id ?? null,
        score:
          existing?.score !== undefined &&
          existing?.score !== null
            ? String(existing.score)
            : "",
      }
    })

    setGrades(gradesMap)
    setLoadingStudents(false)
  }

  function updateScore(studentId: string, value: string) {
    setGrades((current) => ({
      ...current,
      [studentId]: {
        gradeId: current[studentId]?.gradeId ?? null,
        score: value,
      },
    }))
  }

  const selectedAssessment = assessments.find(
    (item) => item.id === selectedAssessmentId
  )

  async function saveGrades() {
    if (!selectedAssessment) {
      return
    }

    const maxScore = Number(selectedAssessment.max_score)

    for (const student of students) {
      const entry = grades[student.id]

      if (!entry || entry.score.trim() === "") {
        continue
      }

      const scoreNumber = Number(entry.score)

      if (
        Number.isNaN(scoreNumber) ||
        scoreNumber < 0 ||
        scoreNumber > maxScore
      ) {
        alert(
          `La note de ${student.first_name} ${student.last_name} doit être comprise entre 0 et ${maxScore}.`
        )
        return
      }
    }

    setSaving(true)
    setSaveMessage(null)

    const updates = students
      .filter((student) => {
        const entry = grades[student.id]
        return entry && entry.score.trim() !== ""
      })
      .map((student) => {
        const entry = grades[student.id]
        const scoreNumber = Number(entry.score)

        if (entry.gradeId) {
          return supabase
            .from("grades")
            .update({ score: scoreNumber })
            .eq("id", entry.gradeId)
        }

        return supabase.from("grades").insert({
          school_id: schoolId,
          assessment_id: selectedAssessmentId,
          student_id: student.id,
          score: scoreNumber,
        })
      })

    const results = await Promise.all(updates)
    const failed = results.filter((result) => result.error)

    if (failed.length > 0) {
      console.error("Erreurs lors de l'enregistrement :", failed)
      setSaveMessage(
        `${failed.length} note(s) n'ont pas pu être enregistrées. Réessayez.`
      )
    } else {
      setSaveMessage("Notes enregistrées avec succès.")
    }

    await loadStudentsAndGrades(selectedAssessmentId)
    setSaving(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Chargement des notes...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">
              Saisie des notes
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">Notes</h2>
          <p className="mt-2 text-muted-foreground">
            Sélectionnez une évaluation pour saisir les notes des
            élèves.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border bg-background p-6">
          <label htmlFor="assessment" className="mb-2 block font-medium">
            Évaluation
          </label>

          {assessments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune évaluation n'a encore été créée.{" "}
              <button
                onClick={() => router.push("/assessments")}
                className="font-medium text-primary underline"
              >
                Créer une évaluation
              </button>
            </p>
          ) : (
            <select
              id="assessment"
              value={selectedAssessmentId}
              onChange={(event) =>
                loadStudentsAndGrades(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-3"
            >
              <option value="">
                Sélectionner une évaluation
              </option>

              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title} — {assessment.classes?.name ?? "—"}
                  {" / "}
                  {assessment.subjects?.name ?? "—"}
                  {" ("}
                  {assessment.academic_periods?.name ?? "—"}
                  {")"}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedAssessment && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {selectedAssessment.title}
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedAssessment.classes?.name ?? "—"} —{" "}
                  {selectedAssessment.subjects?.name ?? "—"} — Sur{" "}
                  {selectedAssessment.max_score} — Coef.{" "}
                  {selectedAssessment.coefficient}
                </p>
              </div>

              <button
                onClick={saveGrades}
                disabled={saving || loadingStudents || students.length === 0}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer les notes"}
              </button>
            </div>

            {saveMessage && (
              <p className="mt-4 text-sm text-muted-foreground">
                {saveMessage}
              </p>
            )}

            {studentsError && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {studentsError}
              </div>
            )}

            <div className="mt-6 overflow-x-auto">
              {loadingStudents ? (
                <p className="text-muted-foreground">
                  Chargement des élèves...
                </p>
              ) : students.length === 0 ? (
                <p className="text-muted-foreground">
                  Aucun élève inscrit dans cette classe.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">Élève</th>
                      <th className="px-4 py-3">
                        Note (/ {selectedAssessment.max_score})
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className="border-b last:border-0">
                        <td className="px-4 py-4 font-medium">
                          {student.last_name} {student.first_name}
                        </td>

                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="0"
                            max={selectedAssessment.max_score}
                            step="0.25"
                            value={grades[student.id]?.score ?? ""}
                            onChange={(event) =>
                              updateScore(student.id, event.target.value)
                            }
                            className="w-28 rounded-md border bg-background px-3 py-2"
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}