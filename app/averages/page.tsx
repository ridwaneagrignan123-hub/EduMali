"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { estPremierCycle } from "@/src/lib/premier-cycle"
import { matchesSearch } from "@/src/lib/search"
import { AvertissementDirection } from "@/components/avertissement-direction"

type Student = {
  id: string
  first_name: string
  last_name: string
}

type ClassItem = {
  id: string
  name: string
}

type School = {
  grading_scale: number
}

// Valeur de repli si l'école n'est pas encore chargée : même défaut qu'en base.
const DEFAULT_GRADING_SCALE = 20

type SubjectAverage = {
  subjectName: string
  average: number
  subjectCoefficient: number
  assessmentCoefficientTotal: number
}

type StudentResult = {
  student: Student
  subjects: SubjectAverage[]
  generalAverage: number | null
}

export default function AveragesPage() {
  const router = useRouter()

  const [school, setSchool] =
    useState<School | null>(null)

  /*
   * Échelle de notation configurée dans
   * les paramètres de l'établissement
   * (schools.grading_scale).
   */
  const gradingScale = Number(
    school?.grading_scale ??
      DEFAULT_GRADING_SCALE
  )

  function formatScore(
    value: number
  ) {
    return value.toLocaleString(
      "fr-FR",
      {
        maximumFractionDigits: 2,
      }
    )
  }

  const [loading, setLoading] =
    useState(true)

  const [loadingResults, setLoadingResults] =
    useState(false)

  const [schoolId, setSchoolId] =
    useState("")

  const [classes, setClasses] =
    useState<ClassItem[]>([])

  const [selectedClassId, setSelectedClassId] =
    useState("")

  const [results, setResults] =
    useState<StudentResult[]>([])

  const [loadError, setLoadError] =
    useState<string | null>(null)

  const [searchTerm, setSearchTerm] =
    useState("")

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

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        "Erreur profil :",
        profileError
      )

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

    const currentSchoolId =
      profile.school_id

    setSchoolId(currentSchoolId)

    const {
      data: schoolData,
      error: schoolError,
    } = await supabase
      .from("schools")
      .select(
        "grading_scale"
      )
      .eq(
        "id",
        currentSchoolId
      )
      .maybeSingle()

    if (schoolError) {
      console.error(
        "Erreur école :",
        schoolError
      )
    } else {
      setSchool(
        schoolData as School
      )
    }

    /*
     * Le barème est passé explicitement au calcul :
     * setSchool() n'est pas encore reflété dans la
     * closure de ce premier appel.
     */
    const currentGradingScale =
      Number(
        schoolData?.grading_scale ??
          DEFAULT_GRADING_SCALE
      )

    const {
      data: classesData,
      error: classesError,
    } = await supabase
      .from("classes")
      .select("id, name")
      .eq(
        "school_id",
        currentSchoolId
      )
      .order("name")

    if (classesError) {
      console.error(
        "Erreur classes :",
        classesError
      )

      setLoadError("Impossible de charger la liste des classes.")
      setLoading(false)
      return
    }

    const loadedClasses =
      (classesData as ClassItem[]) ?? []

    setClasses(loadedClasses)

    if (loadedClasses.length > 0) {
      const firstClass =
        loadedClasses[0]

      setSelectedClassId(
        firstClass.id
      )

      await calculateAverages(
        firstClass.id,
        currentSchoolId,
        currentGradingScale
      )
    }

    setLoading(false)
  }

  async function calculateAverages(
    classId: string,
    currentSchoolId: string,
    scale: number
  ) {
    setLoadingResults(true)
    setLoadError(null)

    /*
     * 1. Récupérer les élèves
     * inscrits dans la classe.
     */

    const {
      data: enrollments,
      error: enrollmentError,
    } = await supabase
      .from(
        "student_class_enrollments"
      )
      .select(`
        student_id,
        students (
          id,
          first_name,
          last_name
        )
      `)
      .eq(
        "school_id",
        currentSchoolId
      )
      .eq(
        "class_id",
        classId
      )

    if (enrollmentError) {
      console.error(
        "Erreur inscriptions :",
        enrollmentError
      )

      setLoadError("Impossible de charger les élèves de cette classe.")
      setResults([])
      setLoadingResults(false)
      return
    }

    const students: Student[] =
      (enrollments ?? [])
        .map(
          (enrollment: any) =>
            enrollment.students
        )
        .filter(Boolean)

    if (students.length === 0) {
      setResults([])
      setLoadingResults(false)
      return
    }

    const studentIds =
      students.map(
        (student) =>
          student.id
      )

    /*
     * 2. Récupérer les coefficients des matières
     * affectées à cette classe.
     */

    const {
      data: classSubjectsData,
      error: classSubjectsError,
    } = await supabase
      .from("class_subjects")
      .select(`
        subject_id,
        coefficient,
        subjects ( name )
      `)
      .eq(
        "school_id",
        currentSchoolId
      )
      .eq(
        "class_id",
        classId
      )

    if (classSubjectsError) {
      console.error(
        "Erreur matières de la classe :",
        classSubjectsError
      )

      setLoadError("Impossible de charger les matières affectées à cette classe.")
      setResults([])
      setLoadingResults(false)
      return
    }

    const subjectCoefficients = new Map<string, number>(
      (classSubjectsData ?? []).map(
        (item: any) => [
          item.subject_id,
          Number(item.coefficient) || 1,
        ]
      )
    )

    /*
     * PREMIER CYCLE : la moyenne est simple, sur /10, et une matière non
     * notée compte 0. Il faut donc partir des matières de la CLASSE, et
     * non des seules matières notées — sinon une matière vide
     * disparaîtrait du calcul au lieu d'y peser zéro.
     *
     * La règle vit dans src/lib/premier-cycle.ts, partagée avec la
     * grille et le bulletin : c'est ce qui garantit qu'ils affichent la
     * même moyenne.
     */
    const { data: classeData } = await supabase
      .from("classes")
      .select("cycle")
      .eq("id", classId)
      .maybeSingle()

    const premierCycle = estPremierCycle(classeData?.cycle)

    const matieresDeLaClasse = (classSubjectsData ?? []).map((item) => {
      const ligne = item as unknown as {
        subject_id: string
        subjects: { name: string } | null
      }

      return {
        id: ligne.subject_id,
        nom: ligne.subjects?.name ?? "—",
      }
    })

    /*
     * 3. Récupérer les notes des élèves.
     */

    const {
      data: gradesData,
      error: gradesError,
    } = await supabase
      .from("grades")
      .select(`
        student_id,
        score,
        assessment_id,
        assessments (
          subject_id,
          max_score,
          coefficient,
          subjects (
            name
          )
        )
      `)
      .eq(
        "school_id",
        currentSchoolId
      )
      .in(
        "student_id",
        studentIds
      )

    if (gradesError) {
      console.error(
        "Erreur notes :",
        gradesError
      )

      setLoadError("Impossible de charger les notes des élèves.")
      setResults([])
      setLoadingResults(false)
      return
    }

    /*
     * 4. Calculer les moyennes
     * de chaque élève.
     */

    const calculatedResults:
      StudentResult[] =
      students.map(
        (student) => {
          const studentGrades =
            (gradesData ?? []).filter(
              (grade: any) =>
                grade.student_id ===
                student.id
            )

          /*
           * Une matière peut avoir
           * plusieurs évaluations.
           *
           * Le coefficient de
           * l'évaluation sert à
           * calculer la moyenne
           * de la matière.
           */

          const subjectMap =
            new Map<
              string,
              {
                subjectName: string
                subjectCoefficient: number
                weightedTotal: number
                totalAssessmentCoefficient: number
              }
            >()

          /*
           * Au premier cycle, chaque matière de la classe entre dans le
           * calcul, notée ou non : une case vide vaut 0.
           */
          if (premierCycle) {
            matieresDeLaClasse.forEach((matiere) => {
              subjectMap.set(matiere.nom, {
                subjectName: matiere.nom,
                subjectCoefficient: 1,
                weightedTotal: 0,
                totalAssessmentCoefficient: 1,
              })
            })
          }

          studentGrades.forEach(
            (grade: any) => {
              const assessment =
                grade.assessments

              if (!assessment) {
                return
              }

              const subject =
                assessment.subjects

              if (!subject) {
                return
              }

              const score =
                Number(
                  grade.score
                )

              const maxScore =
                Number(
                  assessment.max_score
                )

              const assessmentCoefficient =
                Number(
                  assessment.coefficient
                ) || 1

              const subjectCoefficient =
                subjectCoefficients.get(
                  assessment.subject_id
                ) ?? 1

              if (
                Number.isNaN(score) ||
                !maxScore ||
                maxScore <= 0
              ) {
                return
              }

              /*
               * Normalisation sur le barème
               * de l'établissement.
               *
               * Exemple sur /20 :
               *
               * 9/10 = 18/20
               * 15/30 = 10/20
               */

              const normalizedScore = premierCycle
                ? score
                : (score /
                  maxScore) *
                scale

              const existing =
                subjectMap.get(
                  subject.name
                )

              if (existing) {
                if (premierCycle) {
                  /*
                   * L'entrée a été amorcée à 0 : on y pose la note, on
                   * ne l'additionne pas. Une seule composition par
                   * matière au premier cycle.
                   */
                  existing.weightedTotal = normalizedScore
                  existing.totalAssessmentCoefficient = 1
                } else {
                  existing.weightedTotal +=
                    normalizedScore *
                    assessmentCoefficient

                  existing.totalAssessmentCoefficient +=
                    assessmentCoefficient
                }
              } else {
                subjectMap.set(
                  subject.name,
                  {
                    subjectName:
                      subject.name,

                    subjectCoefficient,

                    weightedTotal:
                      normalizedScore *
                      assessmentCoefficient,

                    totalAssessmentCoefficient:
                      assessmentCoefficient,
                  }
                )
              }
            }
          )

          /*
           * Calcul de la moyenne
           * de chaque matière.
           */

          const subjects:
            SubjectAverage[] =
            Array.from(
              subjectMap.values()
            ).map(
              (subject) => ({
                subjectName:
                  subject.subjectName,

                average:
                  subject.weightedTotal /
                  subject.totalAssessmentCoefficient,

                subjectCoefficient:
                  subject.subjectCoefficient,

                assessmentCoefficientTotal:
                  subject.totalAssessmentCoefficient,
              })
            )

          /*
           * Moyenne générale pondérée
           * par le coefficient de
           * chaque matière.
           *
           * Formule :
           *
           * Σ(moyenne matière ×
           * coefficient matière)
           *
           * ÷
           *
           * Σ(coefficients matières)
           */

          let generalAverage:
            number | null = null

          if (
            subjects.length > 0
          ) {
            const weightedTotal =
              subjects.reduce(
                (
                  sum,
                  subject
                ) =>
                  sum +
                  subject.average *
                    subject.subjectCoefficient,

                0
              )

            const totalSubjectCoefficients =
              subjects.reduce(
                (
                  sum,
                  subject
                ) =>
                  sum +
                  subject.subjectCoefficient,

                0
              )

            if (
              totalSubjectCoefficients >
              0
            ) {
              generalAverage =
                weightedTotal /
                totalSubjectCoefficients
            }
          }

          return {
            student,
            subjects,
            generalAverage,
          }
        }
      )

    setResults(
      calculatedResults
    )

    setLoadingResults(false)
  }

  async function handleClassChange(
    classId: string
  ) {
    setSelectedClassId(
      classId
    )

    await calculateAverages(
      classId,
      schoolId,
      gradingScale
    )
  }

  const selectedClassName =
    classes.find(
      (classItem) =>
        classItem.id ===
        selectedClassId
    )?.name ?? ""

  /*
   * Filtrage côté client sur les résultats déjà calculés :
   * pas de nouvelle requête Supabase à chaque frappe.
   */
  const filteredResults = useMemo(
    () =>
      results.filter(
        (result) =>
          matchesSearch(
            searchTerm,
            result.student.first_name,
            result.student.last_name
          )
      ),
    [results, searchTerm]
  )

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Chargement des moyennes...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              Ridwane
            </h1>

            <p className="text-sm text-muted-foreground">
              Calcul des moyennes
            </p>
          </div>

          <button
            onClick={() =>
              router.push(
                "/dashboard"
              )
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
            Moyennes des élèves
          </h2>

          <p className="mt-2 text-muted-foreground">
            Les moyennes sont calculées automatiquement à partir des notes enregistrées.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-6 rounded-xl border bg-background p-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="class"
              className="mb-2 block font-medium"
            >
              Sélectionner une classe
            </label>

            {classes.length === 0 ? (
              <p className="text-muted-foreground">
                Aucune classe disponible.
              </p>
            ) : (
              <select
                id="class"
                value={
                  selectedClassId
                }
                onChange={(
                  event
                ) =>
                  handleClassChange(
                    event.target.value
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-3"
              >
                {classes.map(
                  (classItem) => (
                    <option
                      key={
                        classItem.id
                      }
                      value={
                        classItem.id
                      }
                    >
                      {
                        classItem.name
                      }
                    </option>
                  )
                )}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="student-search"
              className="mb-2 block font-medium"
            >
              Rechercher un élève
            </label>

            <input
              id="student-search"
              type="search"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(
                  event.target.value
                )
              }
              placeholder="Nom ou prénom de l'élève"
              className="w-full rounded-md border bg-background px-3 py-3"
            />

            <p className="mt-2 text-sm text-muted-foreground">
              Filtre les élèves de la classe affichée.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-6">
          {loadingResults ? (
            <p className="py-8 text-center text-muted-foreground">
              Calcul des moyennes...
            </p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                Aucun élève ou aucune note disponible pour cette classe.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                <h3 className="font-heading text-lg font-bold">
                  {
                    selectedClassName ||
                    "Classe"
                  }
                </h3>

                <p className="text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? `${filteredResults.length} élève(s) sur ${results.length}`
                    : `${results.length} élève(s)`}
                </p>
              </div>

              {filteredResults.length ===
              0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-muted-foreground">
                    Aucun élève ne correspond à «{" "}
                    {searchTerm.trim()} ».
                  </p>
                </div>
              ) : (
                filteredResults.map(
                (result) => (
                  <div
                    key={
                      result.student.id
                    }
                    className="rounded-lg border p-5"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {
                            result
                              .student
                              .last_name
                          }{" "}
                          {
                            result
                              .student
                              .first_name
                          }
                        </h3>

                        <p className="text-sm text-muted-foreground">
                          Résultats scolaires
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Moyenne générale
                        </p>

                        <p className="text-2xl font-bold">
                          {result.generalAverage !==
                          null
                            ? result.generalAverage.toFixed(
                                2
                              )
                            : "—"}{" "}
                          / {formatScore(gradingScale)}
                        </p>
                      </div>
                    </div>

                    {result.subjects.length ===
                    0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aucune note disponible.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="border-b">
                            <tr>
                              <th className="px-4 py-3">
                                Matière
                              </th>

                              <th className="px-4 py-3">
                                Moyenne
                              </th>

                              <th className="px-4 py-3">
                                Coefficient matière
                              </th>

                              <th className="px-4 py-3">
                                Coefficients évaluations
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {result.subjects.map(
                              (
                                subject
                              ) => (
                                <tr
                                  key={
                                    subject.subjectName
                                  }
                                  className="border-b last:border-0"
                                >
                                  <td className="px-4 py-4 font-medium">
                                    {
                                      subject.subjectName
                                    }
                                  </td>

                                  <td className="px-4 py-4">
                                    {
                                      subject.average.toFixed(
                                        2
                                      )
                                    }{" "}
                                    / {formatScore(gradingScale)}
                                  </td>

                                  <td className="px-4 py-4">
                                    {
                                      subject.subjectCoefficient
                                    }
                                  </td>

                                  <td className="px-4 py-4">
                                    {
                                      subject.assessmentCoefficientTotal
                                    }
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
                )
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}