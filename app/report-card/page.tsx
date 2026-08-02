"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"
import { AvertissementDirection } from "@/components/avertissement-direction"
import {
  FILIERES,
  filiereLabel,
  hasFiliere,
} from "@/src/lib/etablissement"
import { NOTE_MAX, estPremierCycle } from "@/src/lib/premier-cycle"

type ClassItem = {
  id: string
  name: string
  /* Décide de la règle de moyenne : simple au premier cycle. */
  cycle: string | null
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
  student_number: string | null
  parent_name: string | null
}

type ClassSubjectInfo = {
  subjectId: string
  subjectName: string
  coefficient: number
  /* Programme dont relève la matière. Nul hors école franco-arabe. */
  filiere: string | null
}

type School = {
  name: string
  address: string | null
  phone: string | null
  logo_url: string | null
  grading_scale: number
  appreciation_excellent: number
  appreciation_very_good: number
  appreciation_good: number
  appreciation_fair: number
  school_type: string
}

// Valeurs de repli si l'école n'est pas encore chargée : mêmes défauts qu'en base.
const DEFAULT_GRADING_SCALE = 20
const DEFAULT_APPRECIATION_EXCELLENT = 18
const DEFAULT_APPRECIATION_VERY_GOOD = 16
const DEFAULT_APPRECIATION_GOOD = 14
const DEFAULT_APPRECIATION_FAIR = 10

type SubjectResult = {
  subjectId: string
  subjectName: string
  average: number | null
  coefficient: number
}

type ReportCardStudent = {
  student: Student
  /* Programme du bulletin. Nul en école classique : un seul bulletin. */
  filiere: string | null
  subjects: SubjectResult[]
  generalAverage: number | null
  rank: number | null
}

export default function ReportCardPage() {
  const router = useRouter()

  const [school, setSchool] = useState<School | null>(null)

  /*
   * Barème et seuils d'appréciation configurés dans les paramètres
   * de l'établissement (table schools). Le standard malien reste 20,
   * mais chaque école peut l'adapter.
   */
  const gradingScale = Number(
    school?.grading_scale ?? DEFAULT_GRADING_SCALE
  )

  /*
   * L'axe filière n'existe qu'en école franco-arabe. Ailleurs, un seul
   * bulletin porte toutes les matières — comportement inchangé.
   */
  const avecFiliere = hasFiliere(school?.school_type)

  const appreciationExcellent = Number(
    school?.appreciation_excellent ?? DEFAULT_APPRECIATION_EXCELLENT
  )

  const appreciationVeryGood = Number(
    school?.appreciation_very_good ?? DEFAULT_APPRECIATION_VERY_GOOD
  )

  const appreciationGood = Number(
    school?.appreciation_good ?? DEFAULT_APPRECIATION_GOOD
  )

  const appreciationFair = Number(
    school?.appreciation_fair ?? DEFAULT_APPRECIATION_FAIR
  )

  function formatScore(value: number) {
    return value.toLocaleString("fr-FR", {
      maximumFractionDigits: 2,
    })
  }

  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  const [initialLoadError, setInitialLoadError] = useState<string | null>(null)
  const [reportLoadError, setReportLoadError] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")

  const [academicYear, setAcademicYear] =
    useState<AcademicYear | null>(null)

  const [classes, setClasses] =
    useState<ClassItem[]>([])

  const [periods, setPeriods] =
    useState<AcademicPeriod[]>([])

  const [selectedClassId, setSelectedClassId] =
    useState("")

  const [selectedPeriodId, setSelectedPeriodId] =
    useState("")

  const [reportCards, setReportCards] =
    useState<ReportCardStudent[]>([])

  const [searchTerm, setSearchTerm] =
    useState("")

  // "all" = imprimer tous les bulletins, un id = un seul bulletin, null = pas d'impression en cours
  const [printTarget, setPrintTarget] =
    useState<string | null>(null)

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
        "name, address, phone, logo_url, grading_scale, appreciation_excellent, appreciation_very_good, appreciation_good, appreciation_fair, school_type"
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
        "id, name, cycle"
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

    setLoading(false)
  }

  /*
   * L'effet est place APRES la fonction qu'il appelle, et non avant.
   *
   * Une fonction du corps du composant est recreee a chaque rendu :
   * l'appeler depuis un effet declare plus haut, c'est capturer une
   * version qui ne suivra pas les rendus suivants. Le lint le signale
   * comme un acces avant declaration ; c'est un vrai piege, pas une
   * question de style.
   */
  useEffect(() => {
    /*
     * Le chargement passe par une fonction interne : appeler le
     * chargeur directement dans le corps de l'effet y declenche des
     * mises a jour d'etat synchrones, et enchaine les rendus.
     */
    async function lancer() {
      await loadInitialData()
    }

    lancer()
  }, [])

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

    // Nouvelle classe / période affichée : on repart d'une recherche vierge.
    setSearchTerm("")

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
          student_number,
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
      data: classSubjectsData,
      error: classSubjectsError,
    } = await supabase
      .from("class_subjects")
      .select(`
        subject_id,
        coefficient,
        subjects (
          name,
          filiere
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

    if (classSubjectsError) {
      console.error(
        "Erreur matières de la classe :",
        classSubjectsError
      )

      setReportLoadError(
        "Impossible de charger les matières affectées à cette classe."
      )
      setReportCards([])
      setLoadingReport(false)
      return
    }

    const classSubjects: ClassSubjectInfo[] =
      (classSubjectsData ?? []).map(
        (item: any) => ({
          subjectId: item.subject_id,
          subjectName: item.subjects?.name ?? "—",
          coefficient: Number(item.coefficient) || 1,
          filiere: item.subjects?.filiere ?? null,
        })
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

    /*
     * ---------------------------------------------------------------
     * UN BULLETIN PAR PROGRAMME
     *
     * En école franco-arabe, la classe porte deux programmes et chacun
     * a son propre bulletin : ses matières, sa moyenne générale, son
     * rang — le rang étant calculé parmi les camarades de la MÊME
     * classe sur ce SEUL programme. Un élève reçoit donc deux bulletins
     * qui ne partagent aucune matière.
     *
     * En école classique, `filieres` vaut [null] : la boucle tourne une
     * fois, sur toutes les matières, et le comportement est exactement
     * celui d'avant.
     * ---------------------------------------------------------------
     */
    const premierCycle = estPremierCycle(
      classes.find((item) => item.id === selectedClassId)?.cycle
    )

    const filieres: (string | null)[] = avecFiliere
      ? [...FILIERES]
      : [null]

    const tousLesBulletins: ReportCardStudent[] = []

    for (const filiere of filieres) {
      const matieresDuProgramme =
        filiere === null
          ? classSubjects
          : classSubjects.filter(
              (subject) => subject.filiere === filiere
            )

      // Un programme sans aucune matière ne produit pas de bulletin vide.
      if (avecFiliere && matieresDuProgramme.length === 0) {
        continue
      }

      const calculatedResults: ReportCardStudent[] =
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
            matieresDuProgramme.map(
              (subject) => {
                const subjectGrades =
                  studentGrades.filter(
                    (grade: any) =>
                      grade.assessments
                        ?.subject_id ===
                      subject.subjectId
                  )

                if (
                  subjectGrades.length ===
                  0
                ) {
                  return {
                    subjectId:
                      subject.subjectId,
                    subjectName:
                      subject.subjectName,
                    average:
                      null,
                    coefficient:
                      subject.coefficient,
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

                    /*
                     * PREMIER CYCLE : la note est déjà sur 10 et le
                     * bulletin l'affiche sur 10. La remettre au barème
                     * de l'établissement — 20 par défaut — ferait
                     * afficher 16 là où la grille montre 8, et les deux
                     * écrans se contrediraient.
                     */
                    const normalizedScore = premierCycle
                      ? score
                      : (
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
                    subject.subjectId,
                  subjectName:
                    subject.subjectName,
                  average,
                  coefficient:
                    subject.coefficient,
                }
              }
            )

          /*
           * PREMIER CYCLE : la moyenne est SIMPLE et une matière non
           * notée compte 0 — c'est la règle du cahier, et c'est celle
           * qu'appliquent déjà la grille et la page Moyennes. Ailleurs,
           * on garde la moyenne pondérée sur les seules matières notées.
           */
          const evaluatedSubjects = premierCycle
            ? subjectResults
            : subjectResults.filter(
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
                    (premierCycle ? 1 : subject.coefficient),
                0
              )

            const totalCoefficients =
              evaluatedSubjects.reduce(
                (
                  sum,
                  subject
                ) =>
                  sum +
                  (premierCycle ? 1 : subject.coefficient),
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
            filiere,
            subjects:
              subjectResults,
            generalAverage,
            rank: null,
          }
        }
      )

    // Le classement se fait DANS le programme : un élève est classé
    // parmi ses camarades sur cette seule filière.
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

      tousLesBulletins.push(...rankedResults)
    }

    setReportCards(
      tousLesBulletins
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

  // Seuils configurés dans les paramètres de l'établissement.
  function getAppreciation(
    average: number | null
  ) {
    if (average === null) {
      return "Non évalué"
    }

    if (average >= appreciationExcellent * facteurSeuils) {
      return "Excellent"
    }

    if (average >= appreciationVeryGood * facteurSeuils) {
      return "Très bien"
    }

    if (average >= appreciationGood * facteurSeuils) {
      return "Bien"
    }

    if (average >= appreciationFair * facteurSeuils) {
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

    // Le résultat suit le seuil « Passable » configuré par l'établissement.
    if (average >= appreciationFair * facteurSeuils) {
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

    if (average >= appreciationExcellent * facteurSeuils) {
      return "Excellent travail. Les résultats sont remarquables. Félicitations pour les efforts et la régularité."
    }

    if (average >= appreciationVeryGood * facteurSeuils) {
      return "Très bons résultats. Le travail est sérieux et les efforts doivent être poursuivis."
    }

    if (average >= appreciationGood * facteurSeuils) {
      return "Bon travail dans l'ensemble. Les résultats sont satisfaisants. Il faut continuer les efforts."
    }

    if (average >= appreciationFair * facteurSeuils) {
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

  /*
   * Filtrage côté client des bulletins déjà affichés.
   * Le rang reste calculé sur la classe entière : la recherche
   * ne change que ce qui est visible (et donc imprimé).
   */
  /*
   * Le bulletin d'une classe de premier cycle s'affiche SUR 10, comme la
   * grille qui l'alimente. Les seuils d'appréciation, réglés sur le
   * barème de l'établissement (20 par défaut), sont ramenés à la même
   * échelle : sans cela « Excellent » demanderait 18 sur une note
   * plafonnée à 10, et personne ne l'obtiendrait jamais.
   */
  const premierCycleAffiche = estPremierCycle(
    classes.find((item) => item.id === selectedClassId)?.cycle
  )

  const baremeAffiche = premierCycleAffiche ? NOTE_MAX : gradingScale

  const facteurSeuils =
    premierCycleAffiche && gradingScale > 0 ? NOTE_MAX / gradingScale : 1

  const filteredReportCards = useMemo(
    () =>
      reportCards.filter(
        (report) =>
          matchesSearch(
            searchTerm,
            report.student.first_name,
            report.student.last_name,
            report.student.student_number
          )
      ),
    [reportCards, searchTerm]
  )

  function printReportCard(
    studentId: string
  ) {
    setPrintTarget(studentId)
  }

  function printAllReportCards() {
    if (
      filteredReportCards.length === 0
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
              Ridwane
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
        <AvertissementDirection compact />

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

          {reportCards.length > 0 && (
            <div className="md:col-span-2">

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
                placeholder="Nom, prénom ou matricule"
                className="w-full rounded-md border bg-background px-3 py-3"
              />

              <p className="mt-2 text-sm text-muted-foreground">
                {searchTerm.trim()
                  ? `${filteredReportCards.length} bulletin(s) sur ${reportCards.length} — seuls les bulletins affichés seront imprimés.`
                  : `${reportCards.length} bulletin(s) affiché(s).`}
              </p>

            </div>
          )}

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

            {filteredReportCards.length >
              0 && (
                <button
                  onClick={
                    printAllReportCards
                  }
                  className="rounded-md border bg-background px-6 py-3 font-medium hover:bg-muted"
                >
                  {searchTerm.trim()
                    ? `🖨️ Imprimer les ${filteredReportCards.length} bulletin(s) affiché(s)`
                    : "🖨️ Imprimer tous les bulletins"}
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

          ) : filteredReportCards.length ===
            0 ? (

            <div className="rounded-xl border border-dashed bg-background p-10 text-center print-hidden">
              <p className="text-muted-foreground">
                Aucun bulletin ne correspond à «{" "}
                {searchTerm.trim()} ».
              </p>
            </div>

          ) : (

            filteredReportCards.map(
              (report) => (

                <article
                  id={`report-card-${report.student.id}${
                    report.filiere ? `-${report.filiere}` : ""
                  }`}
                  /*
                    La clé porte le programme : en franco-arabe, le même
                    élève a deux bulletins, et son seul identifiant les
                    ferait entrer en collision.
                  */
                  key={`${report.student.id}-${report.filiere ?? "unique"}`}
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

    {report.student.student_number && (
      <p className="mt-1 text-xs text-muted-foreground">
        Matricule : {report.student.student_number}
      </p>
    )}

    {report.student.parent_name && (
      <p className="mt-1 text-xs text-muted-foreground">
        Parent / Tuteur : {report.student.parent_name}
      </p>
    )}

    {/*
      L'en-tête identifie le programme : sans cela, les deux bulletins
      d'un même élève seraient indiscernables une fois imprimés.
    */}
    {report.filiere && (
      <p className="mt-3 inline-block rounded-full border px-4 py-1 text-sm font-semibold uppercase tracking-wide">
        Programme {filiereLabel(report.filiere).toLowerCase()}
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
                              Moyenne / {formatScore(baremeAffiche)}
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
                                        )} / ${formatScore(baremeAffiche)}`
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
                            / {formatScore(baremeAffiche)}
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