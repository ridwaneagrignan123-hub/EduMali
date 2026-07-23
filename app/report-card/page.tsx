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
  matricule: string | null
  parent_name: string | null
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
  logo_url: string | null
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

  // Barème officiel malien / francophone : notes sur 20
  const gradingScale = 20

  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  const [initialLoadError, setInitialLoadError] = useState<string | null>(null)
  const [reportLoadError, setReportLoadError] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")
  const [school, setSchool] = useState<School | null>(null)

  const [academicYear, setAcademicYear] =
    useState<AcademicYear | null>(null)

  const [classes, setClasses] =
    useState<ClassItem[]>([])

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

  // "all" = imprimer tous les bulletins, un id = un seul bulletin, null = pas d'impression en cours
  const [printTarget, setPrintTarget] =
    useState<string | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (printTarget === null) {
      return
    }

    const timer = setTimeout(() => {
      window.print()
    }, 100)

    return () => clearTimeout(timer)
  }, [printTarget])

  useEffect(() => {
    function handleAfterPrint() {
      setPrintTarget(null)
    }

    window.addEventListener("afterprint", handleAfterPrint)

    return () =>
      window.removeEventListener("afterprint", handleAfterPrint)
  }, [])

  async function loadInitialData() {
    setLoading(true)
    setInitialLoadError(null)

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

      setInitialLoadError(
        "Impossible de charger votre profil. Réessayez ou contactez le support."
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
        "name, address, phone, logo_url"
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

      setInitialLoadError(
        "Impossible de charger les informations de l'établissement."
      )
    } else {
      setSchool(
        schoolData as School
      )
    }

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
      .order("name")

    if (classesError) {
      console.error(
        "Erreur classes :",
        classesError
      )

      setInitialLoadError(
        "Impossible de charger la liste des classes."
      )
    } else {
      setClasses(
        (classesData as ClassItem[]) ?? []
      )
    }

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

      setInitialLoadError(
        "Impossible de charger les périodes scolaires."
      )
    } else {
      const loadedPeriods =
        (periodsData as AcademicPeriod[]) ?? []

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
      .order("name")

    if (subjectsError) {
      console.error(
        "Erreur matières :",
        subjectsError
      )

      setInitialLoadError(
        "Impossible de charger la liste des matières."
      )
    } else {
      setSubjects(
        (subjectsData as Subject[]) ?? []
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
    setReportLoadError(null)

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
          last_name,
          matricule,
          parent_name
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

      setReportLoadError(
        "Impossible de charger la liste des élèves de cette classe. Réessayez."
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
      setReportLoadError(
        "Aucun élève trouvé dans cette classe pour cette période."
      )
      setReportCards([])
      setLoadingReport(false)
      return
    }

    const studentIds =
      students.map(
        (student) =>
          student.id
      )

    const {
      data: gradesData,
      error: gradesError,
    } = await supabase
      .from("grades")
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

      setReportLoadError(
        "Impossible de charger les notes des élèves. Réessayez."
      )
      setReportCards([])
      setLoadingReport(false)
      return
    }

    const calculatedResults:
      ReportCardStudent[] =
      students.map(
        (student) => {
          const studentGrades =
            (gradesData ?? []).filter(
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
                  (grade: any) => {
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
            number | null = null

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

    const rankedResults:
      ReportCardStudent[] =
      []

    let currentRank =
      0

    let previousAverage:
      number | null = null

    for (
      let index = 0;
      index <
      sortedResults.length;
      index++
    ) {
      const result =
        sortedResults[index]

      if (
        result.generalAverage ===
        null
      ) {
        rankedResults.push({
          ...result,
          rank: null,
        })

        continue
      }

      const currentAverage =
        Number(
          result.generalAverage.toFixed(
            2
          )
        )

      if (
        previousAverage ===
          null ||
        currentAverage !==
          previousAverage
      ) {
        currentRank =
          index + 1
      }

      rankedResults.push({
        ...result,
        rank: currentRank,
      })

      previousAverage =
        currentAverage
    }

    setReportCards(
      rankedResults
    )

    setLoadingReport(false)
  }

  function formatRank(
    rank: number | null
  ) {
    if (!rank) {
      return "—"
    }

    if (rank === 1) {
      return "1er"
    }

    return `${rank}e`
  }

  function getSelectedClassName() {
    return (
      classes.find(
        (classItem) =>
          classItem.id ===
          selectedClassId
      )?.name ?? ""
    )
  }

  function getSelectedPeriodName() {
    return (
      periods.find(
        (period) =>
          period.id ===
          selectedPeriodId
      )?.name ?? ""
    )
  }

  function formatToday() {
    return new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  // Seuils sur barème /20 (standard francophone)
  function getAppreciation(
    average: number | null
  ) {
    if (average === null) {
      return "Non évalué"
    }

    if (average >= 18) {
      return "Excellent"
    }

    if (average >= 16) {
      return "Très bien"
    }

    if (average >= 14) {
      return "Bien"
    }

    if (average >= 10) {
      return "Passable"
    }

    return "Insuffisant"
  }

  // Renommé de "Décision" à "Résultat" : un bulletin périodique ne prononce pas
  // de décision de passage en classe supérieure (réservée au conseil de fin d'année).
  function getPeriodResult(
    average: number | null
  ) {
    if (average === null) {
      return "Non évalué"
    }

    if (average >= 10) {
      return "Satisfaisant"
    }

    return "Insuffisant"
  }

  function getAutomaticObservation(
    average: number | null
  ) {
    if (average === null) {
      return "Élève non évalué pour cette période."
    }

    if (average >= 18) {
      return "Excellent travail. Les résultats sont remarquables. Félicitations pour les efforts et la régularité."
    }

    if (average >= 16) {
      return "Très bons résultats. Le travail est sérieux et les efforts doivent être poursuivis."
    }

    if (average >= 14) {
      return "Bon travail dans l'ensemble. Les résultats sont satisfaisants. Il faut continuer les efforts."
    }

    if (average >= 10) {
      return "Résultats passables. Des efforts supplémentaires et un travail plus régulier permettront de progresser."
    }

    return "Résultats insuffisants. Un travail régulier et un accompagnement renforcé sont nécessaires."
  }

  function getTotalCoefficients(
    report: ReportCardStudent
  ) {
    return report.subjects
      .filter(
        (subject) =>
          subject.average !==
          null
      )
      .reduce(
        (
          total,
          subject
        ) =>
          total +
          subject.coefficient,
        0
      )
  }

  function getTotalPoints(
    report: ReportCardStudent
  ) {
    return report.subjects
      .filter(
        (subject) =>
          subject.average !==
          null
      )
      .reduce(
        (
          total,
          subject
        ) =>
          total +
          (
            subject.average ??
            0
          ) *
            subject.coefficient,
        0
      )
  }

  function printReportCard(
    studentId: string
  ) {
    setPrintTarget(studentId)
  }

  function printAllReportCards() {
    if (
      reportCards.length === 0
    ) {
      return
    }

    setPrintTarget("all")
  }

  if (loading) {
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

      <style>{`
        @media print {
          .print-hidden {
            display: none !important;
          }
          .print-exclude {
            display: none !important;
          }
          .report-card-print {
            page-break-after: always;
            break-after: page;
          }
          .report-card-print:last-of-type {
            page-break-after: auto;
            break-after: auto;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      <header className="border-b bg-background print-hidden">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">

          <div>
            <h1 className="text-xl font-bold">
              EduMali
            </h1>

            <p className="text-sm text-muted-foreground">
              Gestion des bulletins scolaires
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

        {initialLoadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive print-hidden">
            {initialLoadError}
          </div>
        )}

        <div className="print-hidden">
          <h2 className="text-3xl font-bold">
            Bulletins scolaires
          </h2>

          <p className="mt-2 text-muted-foreground">
            Consultez et préparez les bulletins scolaires.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border bg-background p-6 md:grid-cols-2 print-hidden">

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
              onChange={(event) =>
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
              onChange={(event) =>
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
                (period) => (
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
              {
                loadingReport
                  ? "Chargement..."
                  : "Afficher les bulletins"
              }
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

          {reportLoadError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive md:col-span-2">
              {reportLoadError}
            </div>
          )}

        </div>

        <div className="space-y-8">

          {reportCards.length ===
          0 ? (

            <div className="rounded-xl border border-dashed bg-background p-10 text-center print-hidden">
              <p className="text-muted-foreground">
                Sélectionnez une classe et une période pour afficher les bulletins.
              </p>
            </div>

          ) : (

            reportCards.map(
              (report) => (

                <article
                  id={`report-card-${report.student.id}`}
                  key={
                    report.student.id
                  }
                  className={`overflow-hidden rounded-xl border bg-background shadow-sm report-card-print ${
                    printTarget !== null &&
                    printTarget !== "all" &&
                    printTarget !== report.student.id
                      ? "print-exclude"
                      : ""
                  }`}
                >

 <div className="border-b-4 bg-muted/10 p-8 text-center">

  {school?.logo_url && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={school.logo_url}
      alt={`Logo ${school?.name ?? "établissement"}`}
      className="mx-auto mb-4 h-20 w-20 object-contain"
    />
  )}

  <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
    Établissement scolaire
  </p>

  <h2 className="mt-3 text-3xl font-black uppercase tracking-wide">
    {
      school?.name ||
      "Établissement scolaire"
    }
  </h2>

  <div className="mt-3 space-y-1 text-sm text-muted-foreground">

    {school?.address && (
      <p>
        {school.address}
      </p>
    )}

    {school?.phone && (
      <p>
        Tél :{" "}
        {school.phone}
      </p>
    )}

  </div>

  <div className="mx-auto mt-8 max-w-2xl rounded-2xl border-2 bg-background p-6 shadow-sm">

    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
      Année scolaire
    </p>

    <p className="mt-2 text-xl font-bold">
      {
        academicYear?.name ||
        "—"
      }
    </p>

    <div className="mx-auto my-5 h-px max-w-xs bg-border" />

    <h3 className="text-3xl font-black uppercase tracking-wide">
      Bulletin scolaire
    </h3>

    <p className="mt-3 text-sm font-medium text-muted-foreground">
      Période :{" "}
      {
        getSelectedPeriodName()
      }
    </p>

    <p className="mt-1 text-xs text-muted-foreground">
      Édité le {formatToday()}
    </p>

  </div>

</div>

<div className="grid gap-4 border-b bg-muted/20 p-6 md:grid-cols-4">

  <div className="rounded-lg border bg-background p-4 md:col-span-2">

    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Élève
    </p>

    <p className="mt-2 text-xl font-bold uppercase">
      {
        report.student.last_name
      }{" "}
      {
        report.student.first_name
      }
    </p>

    {report.student.matricule && (
      <p className="mt-1 text-xs text-muted-foreground">
        Matricule : {report.student.matricule}
      </p>
    )}

    {report.student.parent_name && (
      <p className="mt-1 text-xs text-muted-foreground">
        Parent / Tuteur : {report.student.parent_name}
      </p>
    )}

  </div>

  <div className="rounded-lg border bg-background p-4">

    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Classe
    </p>

    <p className="mt-2 text-lg font-bold">
      {
        getSelectedClassName()
      }
    </p>

  </div>

  <div className="rounded-lg border bg-background p-4">

    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Rang
    </p>

    <p className="mt-2 text-lg font-bold">
      {
        formatRank(
          report.rank
        )
      }
    </p>

  </div>

  <div className="rounded-lg border bg-background p-4 md:col-span-4">

    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Période scolaire
    </p>

    <p className="mt-2 font-medium">
      {
        getSelectedPeriodName()
      }
    </p>

  </div>

</div>

<div className="p-6">

                    <div className="overflow-x-auto">

                      <table className="w-full border-collapse text-left">

                        <thead>
                          <tr className="border-b-2">

                            <th className="px-4 py-4">
                              Matière
                            </th>

                            <th className="px-4 py-4">
                              Moyenne / 20
                            </th>

                            <th className="px-4 py-4">
                              Coefficient
                            </th>

                            <th className="px-4 py-4">
                              Points
                            </th>

                          </tr>
                        </thead>

                        <tbody>

                          {report.subjects.map(
                            (subject) => (

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
                                        )} / 20`
                                      : "—"
                                  }

                                </td>

                                <td className="px-4 py-4">
                                  {
                                    subject.coefficient
                                  }
                                </td>

                                <td className="px-4 py-4 font-medium">
                                  {
                                    subject.average !==
                                    null
                                      ? (
                                          subject.average *
                                          subject.coefficient
                                        ).toFixed(
                                          2
                                        )
                                      : "—"
                                  }
                                </td>

                              </tr>

                            )
                          )}

                        </tbody>

                      </table>

                    </div>

                    <div className="mt-8 grid gap-4 md:grid-cols-4">

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Total points
                        </p>

                        <p className="mt-2 text-2xl font-bold">
                          {
                            getTotalPoints(
                              report
                            ).toFixed(
                              2
                            )
                          }
                        </p>

                      </div>

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Total coefficients
                        </p>

                        <p className="mt-2 text-2xl font-bold">
                          {
                            getTotalCoefficients(
                              report
                            )
                          }
                        </p>

                      </div>

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Moyenne générale
                        </p>

                        <p className="mt-2 text-2xl font-bold">
                          {
                            report.generalAverage !==
                            null
                              ? report.generalAverage.toFixed(
                                  2
                                )
                              : "—"
                          }{" "}
                          <span className="text-base font-normal">
                            / 20
                          </span>
                        </p>

                      </div>

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Rang
                        </p>

                        <p className="mt-2 text-2xl font-bold">
                          {
                            formatRank(
                              report.rank
                            )
                          }
                        </p>

                      </div>

                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Appréciation générale
                        </p>

                        <p className="mt-2 text-xl font-bold">
                          {
                            getAppreciation(
                              report.generalAverage
                            )
                          }
                        </p>

                      </div>

                      <div className="rounded-lg border p-5">

                        <p className="text-sm text-muted-foreground">
                          Résultat
                        </p>

                        <p className="mt-2 text-xl font-bold">
                          {
                            getPeriodResult(
                              report.generalAverage
                            )
                          }
                        </p>

                      </div>

                    </div>

<div className="mt-8 rounded-lg border p-5">

  <div className="flex items-center justify-between gap-4">

    <p className="font-semibold">
      Observation du conseil de classe
    </p>

    <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">
      Automatique
    </span>

  </div>

  <p className="mt-4 leading-7 text-muted-foreground">
    {getAutomaticObservation(
      report.generalAverage
    )}
  </p>

</div>

                  </div>

                  <div className="border-t p-6 text-right print-hidden">

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

                  <div className="grid gap-12 border-t p-10 text-center md:grid-cols-2">

                    <div>

                      <p className="font-semibold">
                        Signature de l'enseignant
                      </p>

                      <div className="mt-20 border-t" />

                    </div>

                    <div>

                      <p className="font-semibold">
                        Signature et cachet du directeur
                      </p>

                      <div className="mt-20 border-t" />

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