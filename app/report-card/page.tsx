"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type ClassItem = {
  id: string
  name: string
}

type AcademicPeriod = {
  id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

type AcademicYear = {
  id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

type Student = {
  id: string
  first_name: string
  last_name: string
}

type Subject = {
  id: string
  name: string
  coefficient: number
}

type School = {
  name: string
  address: string | null
  phone: string | null
}

type SubjectResult = {
  subjectId: string
  subjectName: string
  average: number | null
  coefficient: number
}

type ReportCardStudent = {
  student: Student
  subjects: SubjectResult[]
  generalAverage: number | null
  rank: number | null
}

export default function ReportCardPage() {
  const router = useRouter()

  const gradingScale = 10

  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  const [schoolId, setSchoolId] = useState("")
  const [school, setSchool] = useState<School | null>(null)

  const [academicYear, setAcademicYear] =
    useState<AcademicYear | null>(null)

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [periods, setPeriods] =
    useState<AcademicPeriod[]>([])
  const [subjects, setSubjects] =
    useState<Subject[]>([])

  const [selectedClassId, setSelectedClassId] =
    useState("")

  const [selectedPeriodId, setSelectedPeriodId] =
    useState("")

  const [reportCards, setReportCards] =
    useState<ReportCardStudent[]>([])

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)

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

    // =========================
    // ÉCOLE
    // =========================

    const {
      data: schoolData,
      error: schoolError,
    } = await supabase
      .from("schools")
      .select(
        "name, address, phone"
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

    // =========================
    // ANNÉE SCOLAIRE ACTIVE
    // =========================

    const {
      data: academicYearData,
      error: academicYearError,
    } = await supabase
      .from("academic_years")
      .select(
        "id, name, start_date, end_date, is_active"
      )
      .eq(
        "school_id",
        currentSchoolId
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle()

    if (academicYearError) {
      console.error(
        "Erreur année scolaire :",
        academicYearError
      )
    } else {
      setAcademicYear(
        academicYearData as AcademicYear
      )
    }

    // =========================
    // CLASSES
    // =========================

    const {
      data: classesData,
      error: classesError,
    } = await supabase
      .from("classes")
      .select(
        "id, name"
      )
      .eq(
        "school_id",
        currentSchoolId
      )
      .order(
        "name"
      )

    if (classesError) {
      console.error(
        "Erreur classes :",
        classesError
      )
    } else {
      setClasses(
        (classesData as ClassItem[]) ??
          []
      )
    }

    // =========================
    // PÉRIODES
    // =========================

    const {
      data: periodsData,
      error: periodsError,
    } = await supabase
      .from("academic_periods")
      .select(
        "id, name, start_date, end_date, is_active"
      )
      .eq(
        "school_id",
        currentSchoolId
      )
      .order(
        "start_date",
        {
          ascending: false,
        }
      )

    if (periodsError) {
      console.error(
        "Erreur périodes :",
        periodsError
      )
    } else {
      const loadedPeriods =
        (periodsData as AcademicPeriod[]) ??
        []

      setPeriods(
        loadedPeriods
      )

      const activePeriod =
        loadedPeriods.find(
          (period) =>
            period.is_active
        )

      if (activePeriod) {
        setSelectedPeriodId(
          activePeriod.id
        )
      } else if (
        loadedPeriods.length > 0
      ) {
        setSelectedPeriodId(
          loadedPeriods[0].id
        )
      }
    }

    // =========================
    // MATIÈRES
    // =========================

    const {
      data: subjectsData,
      error: subjectsError,
    } = await supabase
      .from("subjects")
      .select(
        "id, name, coefficient"
      )
      .eq(
        "school_id",
        currentSchoolId
      )
      .order(
        "name"
      )

    if (subjectsError) {
      console.error(
        "Erreur matières :",
        subjectsError
      )
    } else {
      setSubjects(
        (subjectsData as Subject[]) ??
          []
      )
    }

    setLoading(false)
  }

  async function loadReportCards() {
    if (
      !selectedClassId ||
      !selectedPeriodId ||
      !schoolId
    ) {
      return
    }

    setLoadingReport(true)

    // =========================
    // ÉLÈVES DE LA CLASSE
    // =========================

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
        schoolId
      )
      .eq(
        "class_id",
        selectedClassId
      )

    if (enrollmentError) {
      console.error(
        "Erreur inscriptions :",
        enrollmentError
      )

      setReportCards([])
      setLoadingReport(false)
      return
    }

    const students: Student[] =
      (enrollments ?? [])
        .map(
          (enrollment: any) =>
            enrollment.students
        )
        .filter(Boolean)

    if (
      students.length === 0
    ) {
      setReportCards([])
      setLoadingReport(false)
      return
    }

    const studentIds =
      students.map(
        (student) =>
          student.id
      )

    // =========================
    // NOTES
    // =========================

    const {
      data: gradesData,
      error: gradesError,
    } = await supabase
      .from(
        "grades"
      )
      .select(`
        student_id,
        score,
        assessments (
          class_id,
          academic_period_id,
          max_score,
          coefficient,
          subject_id
        )
      `)
      .eq(
        "school_id",
        schoolId
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

      setReportCards([])
      setLoadingReport(false)
      return
    }

    // =========================
    // CALCUL DES RÉSULTATS
    // =========================

    const calculatedResults:
      ReportCardStudent[] =
      students.map(
        (student) => {
          const studentGrades =
            (gradesData ?? [])
              .filter(
                (grade: any) => {
                  const assessment =
                    grade.assessments

                  return (
                    grade.student_id ===
                      student.id &&
                    assessment?.class_id ===
                      selectedClassId &&
                    assessment?.academic_period_id ===
                      selectedPeriodId
                  )
                }
              )

          const subjectResults:
            SubjectResult[] =
            subjects.map(
              (subject) => {
                const subjectGrades =
                  studentGrades.filter(
                    (grade: any) =>
                      grade.assessments
                        ?.subject_id ===
                      subject.id
                  )

                if (
                  subjectGrades.length ===
                  0
                ) {
                  return {
                    subjectId:
                      subject.id,

                    subjectName:
                      subject.name,

                    average:
                      null,

                    coefficient:
                      Number(
                        subject.coefficient
                      ) || 1,
                  }
                }

                let weightedTotal =
                  0

                let totalCoefficients =
                  0

                subjectGrades.forEach(
                  (
                    grade: any
                  ) => {
                    const assessment =
                      grade.assessments

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

                    if (
                      Number.isNaN(
                        score
                      ) ||
                      !maxScore ||
                      maxScore <= 0
                    ) {
                      return
                    }

                    const normalizedScore =
                      (
                        score /
                        maxScore
                      ) *
                      gradingScale

                    weightedTotal +=
                      normalizedScore *
                      assessmentCoefficient

                    totalCoefficients +=
                      assessmentCoefficient
                  }
                )

                const average =
                  totalCoefficients >
                  0
                    ? weightedTotal /
                      totalCoefficients
                    : null

                return {
                  subjectId:
                    subject.id,

                  subjectName:
                    subject.name,

                  average,

                  coefficient:
                    Number(
                      subject.coefficient
                    ) || 1,
                }
              }
            )

          const evaluatedSubjects =
            subjectResults.filter(
              (subject) =>
                subject.average !==
                null
            )

          let generalAverage:
            number | null =
            null

          if (
            evaluatedSubjects.length >
            0
          ) {
            const weightedTotal =
              evaluatedSubjects.reduce(
                (
                  sum,
                  subject
                ) =>
                  sum +
                  (
                    subject.average ??
                    0
                  ) *
                    subject.coefficient,

                0
              )

            const totalCoefficients =
              evaluatedSubjects.reduce(
                (
                  sum,
                  subject
                ) =>
                  sum +
                  subject.coefficient,

                0
              )

            if (
              totalCoefficients >
              0
            ) {
              generalAverage =
                weightedTotal /
                totalCoefficients
            }
          }

          return {
            student,
            subjects:
              subjectResults,
            generalAverage,
            rank: null,
          }
        }
      )

    // =========================
    // CLASSEMENT
    // =========================

    const sortedResults =
      [
        ...calculatedResults,
      ].sort(
        (a, b) =>
          (
            b.generalAverage ??
            -1
          ) -
          (
            a.generalAverage ??
            -1
          )
      )

   const rankedResults: ReportCardStudent[] = []

let currentRank = 0

let previousAverage: number | null = null

for (
  let index = 0;
  index < sortedResults.length;
  index++
) {
  const result = sortedResults[index]

  if (result.generalAverage === null) {
    rankedResults.push({
      ...result,
      rank: null,
    })

    continue
  }

  const currentAverage = Number(
    result.generalAverage.toFixed(2)
  )

  if (
    previousAverage === null ||
    currentAverage !== previousAverage
  ) {
    currentRank = index + 1
  }

  rankedResults.push({
    ...result,
    rank: currentRank,
  })

  previousAverage = currentAverage
}

    setReportCards(
      rankedResults
    )

    setLoadingReport(false)
  }

  // =========================
  // IMPRESSION D'UN BULLETIN
  // =========================

  function printReportCard(
    studentId: string
  ) {
    const element =
      document.getElementById(
        `report-card-${studentId}`
      )

    if (!element) {
      return
    }

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=900,height=1200"
      )

    if (!printWindow) {
      return
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Bulletin scolaire</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
              background: white;
              color: black;
            }

            .print-container {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }

            th,
            td {
              border: 1px solid #000;
              padding: 10px;
              text-align: left;
            }

            th {
              font-weight: bold;
            }

            @page {
              size: A4;
              margin: 15mm;
            }
          </style>
        </head>

        <body>
          <div class="print-container">
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()

    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  // =========================
  // IMPRESSION DE TOUS LES BULLETINS
  // =========================

  function printAllReportCards() {
    if (
      reportCards.length ===
      0
    ) {
      return
    }

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=900,height=1200"
      )

    if (!printWindow) {
      return
    }

    const allReportCards =
      reportCards
        .map(
          (
            report
          ) => {
            const element =
              document.getElementById(
                `report-card-${report.student.id}`
              )

            if (!element) {
              return ""
            }

            return `
              <div class="report-card">
                ${element.innerHTML}
              </div>
            `
          }
        )
        .join("")

    printWindow.document.write(`
      <html>
        <head>
          <title>
            Bulletins scolaires
          </title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              background: white;
              color: black;
            }

            .report-card {
              width: 100%;
              min-height: 250mm;
              padding: 10mm;
              page-break-after: always;
              break-after: page;
            }

            .report-card:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }

            th,
            td {
              border: 1px solid #000;
              padding: 10px;
              text-align: left;
            }

            th {
              font-weight: bold;
            }

            @page {
              size: A4;
              margin: 10mm;
            }
          </style>
        </head>

        <body>
          ${allReportCards}
        </body>
      </html>
    `)

    printWindow.document.close()

    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 700)
  }

  function getSelectedClassName() {
    return (
      classes.find(
        (
          classItem
        ) =>
          classItem.id ===
          selectedClassId
      )?.name ?? ""
    )
  }

  function getSelectedPeriodName() {
    return (
      periods.find(
        (
          period
        ) =>
          period.id ===
          selectedPeriodId
      )?.name ?? ""
    )
  }

  function getAppreciation(
    average: number | null
  ) {
    if (
      average ===
      null
    ) {
      return "Non évalué"
    }

    if (
      average >=
      9
    ) {
      return "Excellent"
    }

    if (
      average >=
      8
    ) {
      return "Très bien"
    }

    if (
      average >=
      7
    ) {
      return "Bien"
    }

    if (
      average >=
      5
    ) {
      return "Passable"
    }

    return "Insuffisant"
  }

  if (
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Chargement des bulletins...
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
              EduMali
            </h1>

            <p className="text-sm text-muted-foreground">
              Bulletins scolaires
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
        <div>
          <h2 className="text-3xl font-bold">
            Bulletins scolaires
          </h2>

          <p className="mt-2 text-muted-foreground">
            Consultez et préparez les bulletins scolaires.
          </p>
        </div>

        {/* =========================
            FILTRES
        ========================= */}

        <div className="grid gap-4 rounded-xl border bg-background p-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="class"
              className="mb-2 block font-medium"
            >
              Classe
            </label>

            <select
              id="class"
              value={
                selectedClassId
              }
              onChange={(
                event
              ) =>
                setSelectedClassId(
                  event.target.value
                )
              }
              className="w-full rounded-md border bg-background px-3 py-3"
            >
              <option value="">
                Sélectionner une classe
              </option>

              {classes.map(
                (
                  classItem
                ) => (
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
          </div>

          <div>
            <label
              htmlFor="period"
              className="mb-2 block font-medium"
            >
              Période scolaire
            </label>

            <select
              id="period"
              value={
                selectedPeriodId
              }
              onChange={(
                event
              ) =>
                setSelectedPeriodId(
                  event.target.value
                )
              }
              className="w-full rounded-md border bg-background px-3 py-3"
            >
              <option value="">
                Sélectionner une période
              </option>

              {periods.map(
                (
                  period
                ) => (
                  <option
                    key={
                      period.id
                    }
                    value={
                      period.id
                    }
                  >
                    {
                      period.name
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              onClick={
                loadReportCards
              }
              disabled={
                !selectedClassId ||
                !selectedPeriodId ||
                loadingReport
              }
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingReport
                ? "Chargement..."
                : "Afficher les bulletins"}
            </button>

            {reportCards.length >
              0 && (
              <button
                onClick={
                  printAllReportCards
                }
                className="rounded-md border bg-background px-6 py-3 font-medium hover:bg-muted"
              >
                🖨️ Imprimer tous les bulletins
              </button>
            )}
          </div>
        </div>

        {/* =========================
            BULLETINS
        ========================= */}

        <div className="space-y-8">
          {reportCards.length ===
          0 ? (
            <div className="rounded-xl border border-dashed bg-background p-10 text-center">
              <p className="text-muted-foreground">
                Sélectionnez une classe et une période pour afficher les bulletins.
              </p>
            </div>
          ) : (
            reportCards.map(
              (
                report
              ) => (
                <article
                  id={`report-card-${report.student.id}`}
                  key={
                    report.student.id
                  }
                  className="overflow-hidden rounded-xl border bg-background shadow-sm"
                >
                  {/* =========================
                      EN-TÊTE
                  ========================= */}

                  <div className="border-b p-8 text-center">
                    <h2 className="text-2xl font-bold uppercase">
                      {
                        school?.name ||
                        "Établissement scolaire"
                      }
                    </h2>

                    {school?.address && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {
                          school.address
                        }
                      </p>
                    )}

                    {school?.phone && (
                      <p className="text-sm text-muted-foreground">
                        Tél :{" "}
                        {
                          school.phone
                        }
                      </p>
                    )}

                    <div className="mt-6">
                      <h3 className="text-xl font-bold uppercase">
                        Bulletin scolaire
                      </h3>

                      <p className="mt-2 text-muted-foreground">
                        Année scolaire :{" "}
                        {
                          academicYear?.name ||
                          "—"
                        }
                      </p>

                      <p className="text-sm text-muted-foreground">
                        Période :{" "}
                        {
                          getSelectedPeriodName()
                        }
                      </p>
                    </div>
                  </div>

                  {/* =========================
                      INFORMATIONS ÉLÈVE
                  ========================= */}

                  <div className="grid gap-4 border-b p-6 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Élève
                      </p>

                      <p className="text-lg font-bold uppercase">
                        {
                          report.student.last_name
                        }{" "}
                        {
                          report.student.first_name
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Classe
                      </p>

                      <p className="text-lg font-bold">
                        {
                          getSelectedClassName()
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Période
                      </p>

                      <p className="font-medium">
                        {
                          getSelectedPeriodName()
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">
                        Rang
                      </p>

                      <p className="font-bold">
                        {
                          report.rank
                            ? `${report.rank}e`
                            : "—"
                        }
                      </p>
                    </div>
                  </div>

                  {/* =========================
                      TABLEAU DES MATIÈRES
                  ========================= */}

                  <div className="p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b-2">
                            <th className="px-4 py-4">
                              Matière
                            </th>

                            <th className="px-4 py-4">
                              Moyenne / 10
                            </th>

                            <th className="px-4 py-4">
                              Coefficient
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {
                            report.subjects.map(
                              (
                                subject
                              ) => (
                                <tr
                                  key={
                                    subject.subjectId
                                  }
                                  className="border-b"
                                >
                                  <td className="px-4 py-4 font-medium">
                                    {
                                      subject.subjectName
                                    }
                                  </td>

                                  <td className="px-4 py-4">
                                    {
                                      subject.average !==
                                      null
                                        ? `${subject.average.toFixed(
                                            2
                                          )} / 10`
                                        : "—"
                                    }
                                  </td>

                                  <td className="px-4 py-4">
                                    {
                                      subject.coefficient
                                    }
                                  </td>
                                </tr>
                              )
                            )
                          }
                        </tbody>
                      </table>
                    </div>

                    {/* =========================
                        RÉSUMÉ
                    ========================= */}

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">
                          Moyenne générale
                        </p>

                        <p className="mt-1 text-2xl font-bold">
                          {
                            report.generalAverage !==
                            null
                              ? report.generalAverage.toFixed(
                                  2
                                )
                              : "—"
                          }{" "}
                          / 10
                        </p>
                      </div>

                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">
                          Appréciation
                        </p>

                        <p className="mt-1 text-xl font-semibold">
                          {
                            getAppreciation(
                              report.generalAverage
                            )
                          }
                        </p>
                      </div>

                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">
                          Rang
                        </p>

                        <p className="mt-1 text-2xl font-bold">
                          {
                            report.rank
                              ? `${report.rank}e`
                              : "—"
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* =========================
                      IMPRESSION D'UN BULLETIN
                  ========================= */}

                  <div className="border-t p-6 text-right print:hidden">
                    <button
                      onClick={() =>
                        printReportCard(
                          report.student.id
                        )
                      }
                      className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
                    >
                      🖨️ Imprimer le bulletin
                    </button>
                  </div>

                  {/* =========================
                      SIGNATURES
                  ========================= */}

                  <div className="grid gap-8 border-t p-8 text-center md:grid-cols-2">
                    <div>
                      <p className="font-semibold">
                        Signature de l'enseignant
                      </p>

                      <div className="mt-16 border-t" />
                    </div>

                    <div>
                      <p className="font-semibold">
                        Signature du directeur
                      </p>

                      <div className="mt-16 border-t" />
                    </div>
                  </div>
                </article>
              )
            )
          )}
        </div>
      </section>
    </main>
  )
}