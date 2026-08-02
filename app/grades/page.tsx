"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { can } from "@/src/lib/roles"
import { normalizeSearchText } from "@/src/lib/search"
import { AvertissementDirection } from "@/components/avertissement-direction"
import { GrilleNotes } from "@/components/grille-notes"
import { estPremierCycle } from "@/src/lib/premier-cycle"
import {
  ImportOutcome,
  ImportRow,
  ImportWizard,
  RawRow,
} from "@/components/import/import-wizard"
import {
  PendingGrade,
  annotateQueueErrors,
  cacheAssessment,
  createPendingId,
  describeSupabaseError,
  enqueueGrades,
  readCachedAssessment,
  readQueue,
  removeFromQueue,
} from "@/src/lib/grades-offline"

/*
 * L'évaluation étant déjà choisie, le fichier ne porte que deux
 * informations utiles : à qui appartient la note, et sa valeur.
 */
const GRADE_IMPORT_FIELDS = [
  {
    key: "student_name",
    label: "Nom de l'élève",
    required: true,
    hint: "Nom et prénom, dans un ordre quelconque.",
    aliases: ["eleve", "nom", "nom eleve", "nom et prenom", "prenom et nom"],
  },
  {
    key: "score",
    label: "Note",
    required: true,
    aliases: ["points", "note obtenue", "resultat", "moyenne"],
  },
]

// Message d'erreur repris tel quel lors de la résolution manuelle.
const NO_STUDENT_ERROR = "Aucun élève de la classe ne correspond à ce nom."

const AMBIGUOUS_WARNING =
  "Plusieurs élèves peuvent correspondre : choisissez lequel."

/*
 * Accepte la virgule décimale, courante dans les tableurs francophones.
 * Renvoie null si la valeur n'est pas un nombre.
 */
function parseScore(value: string) {
  const trimmed = value.trim().replace(",", ".")

  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? parsed : null
}

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

/* Classe éligible à la grille : seul son cycle nous intéresse ici. */
type ClassePourGrille = {
  id: string
  name: string
  cycle: string | null
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

  /* Role de la personne connectee, pour masquer ce qu\'elle ne peut pas faire. */
  const [monRole, setMonRole] = useState("")
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("")

  /*
   * Les classes de PREMIER CYCLE ne passent plus par le choix d'une
   * évaluation : elles se tiennent d'un seul tenant, dans une grille.
   * Le second cycle et le lycée gardent le modèle par évaluation.
   */
  const [classes, setClasses] = useState<ClassePourGrille[]>([])
  const [classeGrilleId, setClasseGrilleId] = useState("")

  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({})
  const [showImport, setShowImport] = useState(false)

  /*
   * On part du principe que la connexion est là au premier rendu :
   * navigator n'existe pas côté serveur, et supposer le contraire
   * ferait clignoter le bandeau hors ligne à chaque chargement.
   */
  const [isOnline, setIsOnline] = useState(true)
  const [pending, setPending] = useState<PendingGrade[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [usingCache, setUsingCache] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    /*
     * La lecture initiale passe par une fonction interne : mettre l'etat
     * a jour directement dans le corps de l'effet enchaine les rendus.
     *
     * Elle ne peut pas se faire a l'initialisation de l'etat : `navigator`
     * n'existe pas au rendu serveur, et lire la file au premier rendu
     * client produirait un ecart d'hydratation.
     */
    function lireLEtatDuReseau() {
      setIsOnline(navigator.onLine)
      setPending(readQueue())
    }

    lireLEtatDuReseau()

    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  /*
   * Synchronisation automatique au retour du réseau.
   *
   * On passe par un effet plutôt que par l'écouteur "online" directement :
   * l'écouteur capturerait l'état au moment de son enregistrement et
   * synchroniserait une file d'attente périmée.
   */
  // Une entrée déjà en échec n'est jamais rejouée automatiquement.
  const syncableCount = pending.filter((entry) => !entry.lastError).length

  useEffect(() => {
    if (isOnline && syncableCount > 0 && !syncing) {
      syncPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, syncableCount])

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
      .select("school_id, role")
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

    setMonRole(profile?.role ?? "")

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

    /*
     * Les classes visibles par l'appelant. Le RLS fait le tri : un
     * enseignant n'y voit que les siennes, titularisées comprises.
     */
    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name, cycle")
      .eq("school_id", profile.school_id)
      .order("name")

    if (classesError) {
      console.error("Erreur classes :", classesError)
    } else {
      setClasses((classesData as ClassePourGrille[]) ?? [])
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
    setUsingCache(false)

    /*
     * Hors ligne : on repart de la copie locale si elle existe, au lieu
     * de laisser une requête échouer et d'afficher une classe vide.
     */
    if (!navigator.onLine) {
      const cached = readCachedAssessment(assessmentId)

      if (cached) {
        setStudents(cached.students)
        setGrades(cached.grades)
        setUsingCache(true)
        setLoadingStudents(false)
        return
      }

      setStudentsError(
        "Vous êtes hors ligne et cette évaluation n'a pas encore été ouverte sur cet appareil : ses élèves ne sont pas disponibles."
      )
      setStudents([])
      setGrades({})
      setLoadingStudents(false)
      return
    }

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

    /*
     * Copie locale : c'est ce qui permet de rouvrir cette évaluation et
     * de saisir les notes même si la connexion tombe entre-temps.
     */
    cacheAssessment({
      assessmentId,
      savedAt: new Date().toISOString(),
      title: assessment.title,
      className: assessment.classes?.name ?? "",
      maxScore: Number(assessment.max_score),
      students: loadedStudents,
      grades: gradesMap,
    })

    setLoadingStudents(false)
  }

  /*
   * Envoie une note en attente.
   *
   * L'identifiant de note mémorisé hors ligne peut être périmé : la note
   * a pu être supprimée, ou au contraire créée entre-temps par quelqu'un
   * d'autre. On retombe donc sur l'autre opération plutôt que d'abandonner.
   */
  async function pushPendingGrade(
    entry: PendingGrade
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (entry.gradeId) {
      const { error } = await supabase
        .from("grades")
        .update({ score: entry.score })
        .eq("id", entry.gradeId)

      if (!error) {
        return { ok: true }
      }
    }

    const { error: insertError } = await supabase.from("grades").insert({
      school_id: entry.schoolId,
      assessment_id: entry.assessmentId,
      student_id: entry.studentId,
      score: entry.score,
    })

    if (!insertError) {
      return { ok: true }
    }

    // 23505 : la contrainte unique (assessment_id, student_id) a parlé,
    // la note existe déjà côté serveur — on la met à jour.
    if (insertError.code === "23505") {
      const { error: updateError } = await supabase
        .from("grades")
        .update({ score: entry.score })
        .eq("assessment_id", entry.assessmentId)
        .eq("student_id", entry.studentId)

      if (!updateError) {
        return { ok: true }
      }

      return { ok: false, message: describeSupabaseError(updateError) }
    }

    /*
     * On journalise les champs un par un : PostgrestError hérite d'Error,
     * dont `message` n'est pas énumérable, donc passer l'objet entier
     * n'afficherait que « {} ».
     */
    const message = describeSupabaseError(insertError)

    /*
     * warn et non error : l'échec est déjà remonté à l'utilisateur dans
     * l'interface, et l'entrée passe en « bloquée » — elle ne sera plus
     * retentée toute seule. Inutile de faire remonter une erreur à
     * chaque tentative.
     */
    console.warn("Note non synchronisée :", message)

    return { ok: false, message }
  }

  /*
   * Vide la file d'attente, une note à la fois.
   *
   * Seules les notes confirmées en base sont retirées : une note dont
   * l'envoi échoue reste en attente et sera retentée. On ne supprime
   * jamais une saisie qui n'a pas été acquittée par le serveur.
   */
  /*
   * Abandon volontaire d'une note bloquée.
   *
   * Seule façon de retirer de la file une note non confirmée en base :
   * l'utilisateur doit la voir, avec sa valeur, et confirmer. Rien n'est
   * jamais supprimé automatiquement.
   */
  function discardPending(entry: PendingGrade) {
    const confirmed = window.confirm(
      `Abandonner définitivement la note ${entry.score} de ${entry.studentLabel} ?\n\nMotif de l'échec : ${entry.lastError ?? "inconnu"}\n\nElle ne sera pas enregistrée. Notez-la ailleurs si vous en avez besoin.`
    )

    if (!confirmed) {
      return
    }

    removeFromQueue([entry.id])
    setPending(readQueue())
    setSyncMessage(`Note de ${entry.studentLabel} abandonnée.`)
  }

  /*
   * force = true : l'utilisateur a explicitement demandé une nouvelle
   * tentative, on rejoue aussi les entrées bloquées.
   */
  async function syncPending(force = false) {
    const all = readQueue()

    const queue = force ? all : all.filter((entry) => !entry.lastError)

    if (queue.length === 0) {
      return
    }

    setSyncing(true)
    setSyncProgress(0)
    setSyncMessage(null)

    const synchronised: string[] = []
    const errors: Record<string, string> = {}
    let interrupted = false

    for (let index = 0; index < queue.length; index++) {
      /*
       * La connexion peut retomber en cours de route. On s'arrête au
       * lieu de faire échouer toutes les notes restantes et de les
       * marquer d'une erreur trompeuse.
       */
      if (!navigator.onLine) {
        interrupted = true
        break
      }

      const result = await pushPendingGrade(queue[index])

      if (result.ok) {
        synchronised.push(queue[index].id)
      } else {
        errors[queue[index].id] = result.message
      }

      setSyncProgress(index + 1)
    }

    removeFromQueue(synchronised)
    annotateQueueErrors(errors)

    setPending(readQueue())
    setSyncing(false)

    const failedCount = Object.keys(errors).length

    if (interrupted) {
      setSyncMessage(
        `Connexion perdue pendant l'envoi. ${synchronised.length} note(s) synchronisée(s), le reste est conservé et repartira à la reconnexion.`
      )
    } else if (failedCount === 0) {
      setSyncMessage(`${synchronised.length} note(s) synchronisée(s).`)
    } else {
      setSyncMessage(
        `${synchronised.length} note(s) synchronisée(s), ${failedCount} en échec et conservée(s) en attente — voir le détail ci-dessus.`
      )
    }

    if (selectedAssessmentId && navigator.onLine) {
      await loadStudentsAndGrades(selectedAssessmentId)
    }
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

  const classesPremierCycle = classes.filter((classe) =>
    estPremierCycle(classe.cycle)
  )

  const classeChoisiePourGrille = classesPremierCycle.find(
    (classe) => classe.id === classeGrilleId
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

    /*
     * Hors ligne : on met en file d'attente au lieu de laisser la
     * requête échouer. La saisie de l'enseignant est conservée.
     */
    if (!navigator.onLine) {
      const entries: PendingGrade[] = students
        .filter((student) => {
          const entry = grades[student.id]
          return entry && entry.score.trim() !== ""
        })
        .map((student) => ({
          id: createPendingId(),
          assessmentId: selectedAssessmentId,
          schoolId,
          studentId: student.id,
          studentLabel: `${student.last_name} ${student.first_name}`,
          gradeId: grades[student.id].gradeId,
          score: Number(grades[student.id].score),
          queuedAt: new Date().toISOString(),
        }))

      if (entries.length === 0) {
        setSaveMessage("Aucune note à enregistrer.")
        return
      }

      const stored = enqueueGrades(entries)

      if (!stored) {
        // Le stockage local a refusé : surtout ne pas laisser croire
        // que la saisie est sauvegardée.
        alert(
          "Vos notes n'ont pas pu être mises en attente sur cet appareil (stockage indisponible). Ne fermez pas cette page avant le retour de la connexion."
        )
        return
      }

      setPending(readQueue())

      setSaveMessage(
        `${entries.length} note(s) enregistrée(s) sur cet appareil. Elles partiront au retour de la connexion.`
      )

      return
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

  /*
   * Recherche des élèves de la classe correspondant au nom du fichier.
   *
   * Deux passes : d'abord une égalité stricte (nom prénom ou prénom nom),
   * puis une correspondance partielle plus permissive. La seconde peut
   * ramener plusieurs élèves — fréquent avec des patronymes très répandus —
   * et c'est justement pour ça qu'on rend la main à l'utilisateur.
   */
  function findStudentMatches(name: string) {
    const target = normalizeSearchText(name)

    if (!target) {
      return []
    }

    const exact = students.filter((student) => {
      const direct = normalizeSearchText(
        `${student.last_name} ${student.first_name}`
      )

      const reversed = normalizeSearchText(
        `${student.first_name} ${student.last_name}`
      )

      return direct === target || reversed === target
    })

    if (exact.length > 0) {
      return exact
    }

    return students.filter((student) => {
      const direct = normalizeSearchText(
        `${student.last_name} ${student.first_name}`
      )

      const reversed = normalizeSearchText(
        `${student.first_name} ${student.last_name}`
      )

      return (
        direct.includes(target) ||
        reversed.includes(target) ||
        target.includes(normalizeSearchText(student.last_name))
      )
    })
  }

  function validateGradeRows(rawRows: RawRow[]): ImportRow[] {
    const maxScore = Number(selectedAssessment?.max_score ?? 0)

    // Élève déjà visé par une ligne précédente -> numéro de cette ligne.
    const targetedStudents = new Map<string, number>()

    return rawRows.map((raw) => {
      const errors: string[] = []
      const warnings: string[] = []

      const rawName = raw.values.student_name?.trim() ?? ""
      const score = parseScore(raw.values.score ?? "")

      if (!rawName) {
        errors.push("Le nom de l'élève est obligatoire.")
      }

      if (score === null) {
        errors.push(
          `Note « ${raw.values.score} » illisible : indiquez un nombre.`
        )
      } else if (score < 0 || score > maxScore) {
        errors.push(
          `La note ${score} doit être comprise entre 0 et ${maxScore}.`
        )
      }

      const matches = rawName ? findStudentMatches(rawName) : []

      let studentId: string | null = null

      if (rawName) {
        if (matches.length === 0) {
          errors.push(NO_STUDENT_ERROR)
        } else if (matches.length > 1) {
          warnings.push(AMBIGUOUS_WARNING)
        } else {
          studentId = matches[0].id

          const alreadyTargeted = targetedStudents.get(studentId)

          if (alreadyTargeted !== undefined) {
            warnings.push(
              `La ligne ${alreadyTargeted} vise déjà cet élève : la dernière note enregistrée écraserait la précédente.`
            )
          } else {
            targetedStudents.set(studentId, raw.lineNumber)
          }
        }
      }

      return {
        lineNumber: raw.lineNumber,
        values: raw.values,
        errors,
        warnings,
        ignored: false,
        confirmed: false,
        payload: { studentId, score },
      }
    })
  }

  /*
   * Sélection manuelle de l'élève, depuis l'aperçu.
   *
   * Choisir un élève lève l'erreur « aucun élève ne correspond » et
   * l'avertissement d'ambiguïté : c'est l'utilisateur qui tranche, on ne
   * devine jamais à sa place.
   */
  function renderGradeRowResolver(
    row: ImportRow,
    update: (patch: Partial<ImportRow>) => void
  ) {
    const payload = row.payload as {
      studentId: string | null
      score: number | null
    }

    const needsChoice =
      row.errors.includes(NO_STUDENT_ERROR) ||
      row.warnings.includes(AMBIGUOUS_WARNING) ||
      payload.studentId === null

    if (!needsChoice) {
      const student = students.find((item) => item.id === payload.studentId)

      return (
        <span className="text-xs text-muted-foreground">
          → {student ? `${student.last_name} ${student.first_name}` : "—"}
        </span>
      )
    }

    return (
      <select
        value={payload.studentId ?? ""}
        onChange={(event) => {
          const studentId = event.target.value || null

          update({
            payload: { ...payload, studentId },
            errors: studentId
              ? row.errors.filter((error) => error !== NO_STUDENT_ERROR)
              : row.errors.includes(NO_STUDENT_ERROR)
                ? row.errors
                : [...row.errors, NO_STUDENT_ERROR],
            warnings: studentId
              ? row.warnings.filter((warning) => warning !== AMBIGUOUS_WARNING)
              : row.warnings,
          })
        }}
        className="rounded-md border bg-background px-3 py-1.5 text-xs"
      >
        <option value="">Choisir l'élève...</option>

        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.last_name} {student.first_name}
          </option>
        ))}
      </select>
    )
  }

  /*
   * Import séquentiel des notes.
   *
   * Une note existante est mise à jour, sinon elle est créée — même
   * logique que la saisie manuelle. Deux lignes visant le même élève sont
   * refusées ici plutôt que de laisser la seconde écraser la première
   * sans que personne ne le voie.
   */
  async function importGradeRows(
    rows: ImportRow[],
    onProgress: (done: number) => void
  ): Promise<ImportOutcome> {
    let imported = 0
    const failures: ImportOutcome["failures"] = []
    const processed = new Map<string, number>()

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]

      const payload = row.payload as {
        studentId: string | null
        score: number | null
      }

      if (!payload.studentId || payload.score === null) {
        failures.push({
          lineNumber: row.lineNumber,
          message: "Élève ou note manquant : ligne non traitée.",
        })

        onProgress(index + 1)
        continue
      }

      const duplicateOf = processed.get(payload.studentId)

      if (duplicateOf !== undefined) {
        failures.push({
          lineNumber: row.lineNumber,
          message: `Même élève que la ligne ${duplicateOf} : note non enregistrée pour éviter d'écraser la précédente.`,
        })

        onProgress(index + 1)
        continue
      }

      const existingGradeId = grades[payload.studentId]?.gradeId ?? null

      const { error } = existingGradeId
        ? await supabase
            .from("grades")
            .update({ score: payload.score })
            .eq("id", existingGradeId)
        : await supabase.from("grades").insert({
            school_id: schoolId,
            assessment_id: selectedAssessmentId,
            student_id: payload.studentId,
            score: payload.score,
          })

      if (error) {
        failures.push({
          lineNumber: row.lineNumber,
          message: error.message,
        })

        onProgress(index + 1)
        continue
      }

      processed.set(payload.studentId, row.lineNumber)
      imported++
      onProgress(index + 1)
    }

    return { imported, failures }
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
        <AvertissementDirection compact />
        <div>
          <h2 className="text-3xl font-bold">Notes</h2>
          <p className="mt-2 text-muted-foreground">
            Sélectionnez une évaluation pour saisir les notes des
            élèves.
          </p>
        </div>

        {!isOnline && (
          <div
            className="rounded-lg border p-4"
            style={{
              background: "oklch(0.80 0.14 78 / 0.14)",
              borderColor: "oklch(0.57 0.14 78 / 0.5)",
            }}
          >
            <p className="font-medium">
              Hors ligne — vos notes seront envoyées à la reconnexion.
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Vous pouvez continuer à saisir : tout est conservé sur cet
              appareil.
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <div
            className="rounded-lg border p-4"
            style={{
              background: "oklch(0.585 0.16 38 / 0.08)",
              borderColor: "oklch(0.585 0.16 38 / 0.4)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {pending.length} note(s) en attente de synchronisation
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {syncing
                    ? `Envoi en cours : ${syncProgress} / ${pending.length}`
                    : syncableCount === 0
                      ? "Aucun envoi automatique : les notes ci-dessous ont échoué et attendent votre décision."
                      : isOnline
                        ? "L'envoi démarre automatiquement."
                        : "L'envoi partira dès le retour de la connexion."}
                </p>
              </div>

              <button
                onClick={() => syncPending(true)}
                disabled={syncing || !isOnline}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? "Synchronisation..." : "Réessayer maintenant"}
              </button>
            </div>

            <ul className="mt-3 space-y-2 text-xs">
              {pending.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <span className="text-muted-foreground">
                    {entry.studentLabel} — {entry.score}
                  </span>

                  {entry.lastError && (
                    <>
                      <span
                        className="ml-2"
                        style={{ color: "oklch(0.577 0.245 27.325)" }}
                      >
                        échec : {entry.lastError}
                      </span>

                      <button
                        onClick={() => discardPending(entry)}
                        className="ml-2 underline"
                        style={{ color: "oklch(0.45 0.02 60)" }}
                      >
                        abandonner cette note
                      </button>
                    </>
                  )}
                </li>
              ))}

              {pending.length > 5 && (
                <li className="text-muted-foreground">
                  et {pending.length - 5} autre(s)...
                </li>
              )}
            </ul>

            {pending.some((entry) => entry.lastError) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Ces notes restent conservées sur cet appareil. Si l'échec
                persiste, notez les valeurs avant de vider le cache de votre
                navigateur.
              </p>
            )}
          </div>
        )}

        {syncMessage && (
          <p className="text-sm text-muted-foreground">{syncMessage}</p>
        )}

        {usingCache && (
          <p className="text-sm text-muted-foreground">
            Données affichées depuis la copie locale de cet appareil.
          </p>
        )}

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/*
          PREMIER CYCLE : on choisit une classe, pas une évaluation. La
          grille remplace entièrement la saisie matière par matière — et
          c'est elle qui définit les matières de la classe.
        */}
        {classesPremierCycle.length > 0 && (
          <div className="rounded-xl border bg-background p-6">
            <label
              htmlFor="classe-grille"
              className="mb-2 block font-medium"
            >
              Classe de premier cycle
            </label>

            <select
              id="classe-grille"
              value={classeGrilleId}
              onChange={(event) => setClasseGrilleId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-3"
            >
              <option value="">
                Sélectionner une classe — saisie en grille
              </option>

              {classesPremierCycle.map((classe) => (
                <option key={classe.id} value={classe.id}>
                  {classe.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {classeChoisiePourGrille ? (
          <GrilleNotes
            schoolId={schoolId}
            classId={classeChoisiePourGrille.id}
            className={classeChoisiePourGrille.name}
            peutModifier={can(monRole, "notes.saisir")}
          />
        ) : (
        <>
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

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowImport((current) => !current)}
                  disabled={loadingStudents || students.length === 0}
                  className="rounded-md border px-4 py-3 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showImport
                    ? "Masquer l'import Excel"
                    : "Importer les notes depuis Excel"}
                </button>

                {/*
                  La note appartient à l'enseignant qui l'a donnée : le
                  RLS n'accepte que lui et l'admin. Un directeur ouvrant
                  cette page la consulte et l'imprime, il ne l'écrit pas
                  — inutile de lui montrer un bouton qui échouerait.
                */}
                {can(monRole, "notes.saisir") && (
                  <button
                    onClick={saveGrades}
                    disabled={saving || loadingStudents || students.length === 0}
                    className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer les notes"}
                  </button>
                )}
              </div>

              {!can(monRole, "notes.saisir") && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Vous consultez ces notes. Leur saisie revient à
                  l&apos;enseignant de la classe.
                </p>
              )}
            </div>

            {showImport && (
              <div className="mt-6">
                <ImportWizard
                  title={`Importer les notes — ${selectedAssessment.title}`}
                  description={`Les notes seront rattachées aux élèves de ${
                    selectedAssessment.classes?.name ?? "la classe"
                  }, sur ${selectedAssessment.max_score}. Chaque ligne doit être associée à un élève avant d'être importée.`}
                  fields={GRADE_IMPORT_FIELDS}
                  validateRows={validateGradeRows}
                  importRows={importGradeRows}
                  renderRowResolver={renderGradeRowResolver}
                  onClose={() => setShowImport(false)}
                  onImported={() =>
                    loadStudentsAndGrades(selectedAssessmentId)
                  }
                />
              </div>
            )}

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
        </>
        )}
      </section>
    </main>
  )
}