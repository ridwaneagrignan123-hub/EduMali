"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AvertissementDirection } from "@/components/avertissement-direction"
import { estPremierCycle } from "@/src/lib/premier-cycle"
import { createPendingId, describeSupabaseError } from "@/src/lib/stockage-local"
import {
  AttendanceStatus,
  PendingAttendance,
  annotateAttendanceErrors,
  cacheRollCall,
  chargeUtile,
  enqueueAttendance,
  feuilleKey,
  readAttendanceQueue,
  readCachedRollCall,
  removeFromAttendanceQueue,
} from "@/src/lib/attendance-offline"

type ClassItem = {
  id: string
  name: string
  /*
   * Décide du MODE de saisie. Au premier cycle un seul enseignant tient
   * la classe : la présence se marque à la journée. Au second cycle et
   * au lycée, chaque enseignant ne répond que de sa leçon.
   */
  cycle: string | null
}

/* Une leçon du jour : le créneau porte l'enseignant, la matière, l'heure. */
type Lecon = {
  id: string
  subject_id: string
  start_time: string
  end_time: string
  subjects: { name: string } | null
}

type SchoolHoliday = {
  id: string
  name: string
  start_date: string
  end_date: string
}

type Student = {
  id: string
  first_name: string
  last_name: string
}

/*
 * Le type vient de la couche hors ligne, et n'est pas redéclaré ici :
 * deux unions identiques dans deux fichiers finissent toujours par
 * diverger le jour où l'on ajoute un statut, et le compilateur ne dirait
 * rien tant que les deux restent structurellement compatibles.
 */
type AttendanceEntry = {
  attendanceId: string | null
  status: AttendanceStatus
}

const statusOptions: {
  value: AttendanceStatus
  label: string
  color: string
  background: string
}[] = [
  {
    value: "present",
    label: "Présent",
    color: "oklch(0.55 0.13 155)",
    background: "oklch(0.55 0.13 155 / 0.12)",
  },
  {
    value: "late",
    label: "Retard",
    color: "oklch(0.57 0.14 78)",
    background: "oklch(0.57 0.14 78 / 0.18)",
  },
  {
    value: "excused",
    label: "Excusé",
    color: "oklch(0.45 0.02 60)",
    background: "oklch(0.45 0.02 60 / 0.12)",
  },
  {
    value: "absent",
    label: "Absent",
    color: "oklch(0.577 0.245 27.325)",
    background: "oklch(0.577 0.245 27.325 / 0.12)",
  },
]

function todayIsoDate() {
  return new Date().toISOString().split("T")[0]
}

export default function AttendancePage() {
  const router = useRouter()

  const [schoolId, setSchoolId] = useState("")

  const [loading, setLoading] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState("")
  const [selectedDate, setSelectedDate] = useState(todayIsoDate())

  const [students, setStudents] = useState<Student[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry>>({})
  const [hasLoadedList, setHasLoadedList] = useState(false)

  const [holidays, setHolidays] = useState<SchoolHoliday[]>([])

  /* Mode leçon : les créneaux du jour et celui qu'on est en train de marquer. */
  const [lecons, setLecons] = useState<Lecon[]>([])
  const [leconId, setLeconId] = useState("")

  /* Message parent en cours d'envoi, pour désactiver le bouton concerné. */
  const [parentEnCours, setParentEnCours] = useState<string | null>(null)
  const [parentMessage, setParentMessage] = useState<string | null>(null)
  const [parentErreur, setParentErreur] = useState<string | null>(null)

  /*
   * Hors ligne. `enLigne` démarre à true : le rendu serveur n'a pas de
   * navigator, et annoncer une coupure qui n'existe pas serait pire que
   * de la découvrir une milliseconde plus tard, à l'effet de montage.
   */
  const [enLigne, setEnLigne] = useState(true)
  const [enAttente, setEnAttente] = useState<PendingAttendance[]>([])
  const [envoiFile, setEnvoiFile] = useState(false)
  /* Vrai quand la feuille affichée vient du cache et non du serveur. */
  const [depuisCache, setDepuisCache] = useState(false)

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

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name, cycle")
      .eq("school_id", profile.school_id)
      .order("name")

    if (classesError) {
      console.error("Erreur classes :", classesError)
      setLoadError("Impossible de charger la liste des classes.")
    } else {
      setClasses((classesData as ClassItem[]) ?? [])
    }

    // Sert uniquement à signaler les dates de vacances ou de jour férié.
    const { data: holidaysData, error: holidaysError } = await supabase
      .from("school_holidays")
      .select("id, name, start_date, end_date")
      .eq("school_id", profile.school_id)
      .order("start_date", { ascending: true })

    if (holidaysError) {
      console.error("Erreur calendrier scolaire :", holidaysError)
    } else {
      setHolidays((holidaysData as SchoolHoliday[]) ?? [])
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

  useEffect(() => {
    /*
     * La lecture initiale passe par une fonction interne : mettre l'état
     * à jour directement dans le corps de l'effet enchaîne les rendus.
     *
     * Elle ne peut pas se faire à l'initialisation de l'état : `navigator`
     * n'existe pas au rendu serveur, et lire la file au premier rendu
     * client produirait un écart d'hydratation.
     */
    function lireLEtatDuReseau() {
      setEnLigne(navigator.onLine)
      setEnAttente(readAttendanceQueue())
    }

    lireLEtatDuReseau()

    function auRetour() {
      setEnLigne(true)
    }

    function alaCoupure() {
      setEnLigne(false)
    }

    window.addEventListener("online", auRetour)
    window.addEventListener("offline", alaCoupure)

    return () => {
      window.removeEventListener("online", auRetour)
      window.removeEventListener("offline", alaCoupure)
    }
  }, [])

  /*
   * Vide la file dans la base.
   *
   * Les entrées sont regroupées par table : une feuille entière part en
   * un seul upsert, là où l'ancien enregistrement lançait une requête
   * par élève — soixante allers-retours pour une classe, sur un réseau
   * qui vacille.
   *
   * Rien n'est retiré de la file avant confirmation, et ce qui échoue
   * est annoté plutôt que retenté sans fin.
   */
  async function envoyerEnAttente(entries: PendingAttendance[]) {
    if (entries.length === 0) {
      return
    }

    setEnvoiFile(true)

    const parTable = new Map<string, PendingAttendance[]>()

    entries.forEach((entry) => {
      const { table } = chargeUtile(entry)
      parTable.set(table, [...(parTable.get(table) ?? []), entry])
    })

    const confirmees: string[] = []
    const echecs: Record<string, string> = {}

    for (const lot of parTable.values()) {
      const modele = chargeUtile(lot[0])

      const { error } = await supabase
        .from(modele.table)
        .upsert(
          lot.map((entry) => chargeUtile(entry).ligne),
          { onConflict: modele.onConflict }
        )

      if (error) {
        console.error("Erreur d'envoi des présences :", error)

        /*
         * Une coupure n'est pas un refus. On ne marque BLOQUÉES que les
         * entrées que la base a explicitement rejetées : un `code`
         * postgres accompagne le refus, jamais la panne réseau. Annoter
         * une coupure condamnerait la feuille à rester en file jusqu'à
         * un geste manuel, alors qu'elle serait repartie seule.
         */
        if ((error as { code?: string }).code) {
          const raison = describeSupabaseError(error)
          lot.forEach((entry) => {
            echecs[entry.id] = raison
          })
        }

        continue
      }

      lot.forEach((entry) => confirmees.push(entry.id))
    }

    if (confirmees.length > 0) {
      removeFromAttendanceQueue(confirmees)
    }

    if (Object.keys(echecs).length > 0) {
      annotateAttendanceErrors(echecs)
    }

    setEnAttente(readAttendanceQueue())
    setEnvoiFile(false)
  }

  /*
   * Synchronisation automatique au retour du réseau.
   *
   * On passe par un effet plutôt que par l'écouteur « online »
   * directement : l'écouteur capturerait la file au moment de son
   * enregistrement et rejouerait un état périmé.
   */
  /*
   * Une entrée déjà en échec n'est jamais rejouée automatiquement.
   *
   * On dépend du NOMBRE d'entrées à envoyer, jamais du tableau : la file
   * est relue après chaque tentative, donc son identité change même
   * quand son contenu est identique. Dépendre du tableau ferait
   * retourner l'effet après chaque échec réseau — et un réseau qui
   * refuse sans que la base réponde ferait tourner la boucle sans fin.
   * Le compte, lui, ne bouge que si quelque chose est réellement parti.
   */
  const aEnvoyer = enAttente.filter((entry) => !entry.lastError).length

  useEffect(() => {
    if (!enLigne || aEnvoyer === 0 || envoiFile) {
      return
    }

    async function lancer() {
      // Relue ici, et non capturée : la file fait foi au moment de partir.
      await envoyerEnAttente(
        readAttendanceQueue().filter((entry) => !entry.lastError)
      )

      /*
       * Le réseau est revenu et la file est partie : on relit la feuille
       * depuis le serveur. Sans ça l'écran continuerait d'annoncer une
       * feuille du cache, sans les identifiants de ligne dont a besoin
       * « Prévenir le parent ».
       *
       * Une seule fois : l'envoi fait tomber le compte à zéro, et c'est
       * le compte qui déclenche cet effet.
       */
      if (selectedClassId) {
        await loadStudentsAndAttendance()
      }
    }

    lancer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne, aEnvoyer])

  /*
   * Les leçons programmées ce jour-là pour cette classe. On part de
   * l'emploi du temps : on ne marque pas une leçon qui n'a pas lieu.
   */
  async function chargerLecons() {
    if (!selectedClassId || !selectedDate) {
      setLecons([])
      setLeconId("")
      return
    }

    // 1 = lundi, comme day_of_week en base.
    const jour = new Date(`${selectedDate}T00:00:00`).getDay()
    const dayOfWeek = jour === 0 ? 7 : jour

    const { data, error } = await supabase
      .from("timetable_slots")
      .select("id, subject_id, start_time, end_time, subjects ( name )")
      .eq("school_id", schoolId)
      .eq("class_id", selectedClassId)
      .eq("day_of_week", dayOfWeek)
      .order("start_time")

    if (error) {
      console.error("Erreur leçons :", error)
      setLecons([])
      setLeconId("")
      return
    }

    const liste = (data as unknown as Lecon[]) ?? []
    setLecons(liste)
    setLeconId(liste[0]?.id ?? "")
  }

  async function loadStudentsAndAttendance() {
    setStudentsError(null)
    setSaveMessage(null)

    if (!selectedClassId || !selectedDate) {
      return
    }

    setLoadingStudents(true)
    setHasLoadedList(true)

    const cle = feuilleKey(selectedClassId, selectedDate, modeLecon ? leconId : null)

    /*
     * HORS LIGNE : on sert la dernière feuille connue et on s'arrête là.
     *
     * Interroger Supabase sans réseau produirait une erreur au bout du
     * délai d'attente et viderait la liste — l'enseignant se retrouverait
     * devant un écran vide au moment précis où il tient sa classe.
     */
    if (!enLigne) {
      const cache = readCachedRollCall(cle)

      if (!cache) {
        setStudents([])
        setAttendance({})
        setDepuisCache(false)
        setStudentsError(
          "Vous êtes hors ligne et cette feuille n'a jamais été ouverte sur cet appareil. Rapprochez-vous du réseau une fois : elle sera ensuite disponible sans."
        )
        setLoadingStudents(false)
        return
      }

      const enFile = readAttendanceQueue().filter((entry) => entry.feuille === cle)

      const depuisLeCache: Record<string, AttendanceEntry> = {}

      cache.students.forEach((student) => {
        /*
         * Ce qui attend en file l'emporte sur ce qui a été mis en cache :
         * c'est la saisie la plus récente, celle que la personne vient de
         * faire et qui n'est pas encore partie.
         */
        const attend = enFile.find((entry) => entry.studentId === student.id)

        depuisLeCache[student.id] = {
          attendanceId: null,
          status: attend?.status ?? cache.statuses[student.id] ?? "present",
        }
      })

      setStudents(cache.students)
      setAttendance(depuisLeCache)
      setDepuisCache(true)
      setLoadingStudents(false)
      return
    }

    const { data: enrollments, error: enrollmentError } = await supabase
      .from("student_class_enrollments")
      .select(`
        student_id,
        students ( id, first_name, last_name )
      `)
      .eq("school_id", schoolId)
      .eq("class_id", selectedClassId)

    if (enrollmentError) {
      console.error("Erreur inscriptions :", enrollmentError)
      setStudentsError("Impossible de charger les élèves de cette classe.")
      setStudents([])
      setAttendance({})
      setLoadingStudents(false)
      return
    }

    const loadedStudents: Student[] = (enrollments ?? [])
      .map((enrollment: any) => enrollment.students)
      .filter(Boolean)
      .sort((a: Student, b: Student) => a.last_name.localeCompare(b.last_name))

    setStudents(loadedStudents)

    /*
     * Deux tables, deux modèles : `attendance` marque la journée entière
     * (premier cycle), `lesson_attendance` marque une leçon précise.
     * Le mode décide de laquelle on lit — jamais des deux.
     */
    const { data: existingAttendance, error: attendanceError } = modeLecon
      ? await supabase
          .from("lesson_attendance")
          .select("id, student_id, status")
          .eq("school_id", schoolId)
          .eq("slot_id", leconId)
          .eq("lesson_date", selectedDate)
      : await supabase
          .from("attendance")
          .select("id, student_id, status")
          .eq("school_id", schoolId)
          .eq("class_id", selectedClassId)
          .eq("attendance_date", selectedDate)

    if (attendanceError) {
      console.error("Erreur présences existantes :", attendanceError)
      setStudentsError(
        "Les élèves ont été chargés, mais les présences existantes n'ont pas pu être récupérées."
      )
    }

    const attendanceMap: Record<string, AttendanceEntry> = {}

    loadedStudents.forEach((student) => {
      const existing = (existingAttendance ?? []).find(
        (record: any) => record.student_id === student.id
      )

      attendanceMap[student.id] = {
        attendanceId: existing?.id ?? null,
        status: (existing?.status as AttendanceStatus) ?? "present",
      }
    })

    setAttendance(attendanceMap)
    setDepuisCache(false)

    /*
     * On met la feuille de côté À CHAQUE ouverture en ligne. C'est ce
     * qui rend l'appel possible sans réseau demain : l'enseignant qui a
     * ouvert sa classe une fois au bureau la retrouvera dans la cour.
     *
     * Un échec d'écriture locale ne compromet pas la consultation en
     * cours ; il est journalisé dans stockage-local et laissé passer.
     */
    const statuses: Record<string, AttendanceStatus> = {}

    loadedStudents.forEach((student) => {
      statuses[student.id] = attendanceMap[student.id].status
    })

    cacheRollCall({
      feuille: feuilleKey(
        selectedClassId,
        selectedDate,
        modeLecon ? leconId : null
      ),
      savedAt: new Date().toISOString(),
      className: selectedClass?.name ?? "",
      date: selectedDate,
      leconLabel: modeLecon
        ? `${leconChoisie?.subjects?.name ?? "Leçon"} · ${leconChoisie?.start_time ?? ""}`
        : null,
      students: loadedStudents,
      statuses,
    })

    setLoadingStudents(false)
  }

  function updateStatus(studentId: string, status: AttendanceStatus) {
    setAttendance((current) => ({
      ...current,
      [studentId]: {
        attendanceId: current[studentId]?.attendanceId ?? null,
        status,
      },
    }))
  }

  /*
   * « Prévenir le parent » — le CLIC est le déclencheur.
   *
   * Volontairement pas branché sur le changement de statut : marquer
   * vingt élèves absents enverrait vingt messages en rafale, et une
   * correction de saisie en enverrait un de plus. Ici, chaque message
   * est un geste délibéré.
   */
  async function prevenirLeParent(
    student: Student,
    type: "absence" | "retard",
    details: Record<string, unknown>,
    relatedId?: string | null
  ) {
    setParentEnCours(student.id)
    setParentErreur(null)
    setParentMessage(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setParentErreur("Votre session a expiré. Reconnectez-vous.")
        return
      }

      const response = await fetch("/api/parent-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          studentId: student.id,
          eventType: type,
          relatedId: relatedId ?? null,
          details,
        }),
      })

      const resultat = await response.json()

      if (!response.ok) {
        // Le cas le plus fréquent : aucun numéro parent sur la fiche.
        setParentErreur(resultat.error ?? "Le message n'a pas pu être créé.")
        return
      }

      setParentMessage(
        resultat.statut === "sent"
          ? `Message envoyé au parent de ${student.first_name} ${student.last_name}.`
          : `Message enregistré pour le parent de ${student.first_name} ${student.last_name}. ${resultat.raison ?? ""}`
      )
    } catch (error) {
      console.error("Erreur message parent :", error)
      setParentErreur("Le serveur n'a pas répondu.")
    } finally {
      setParentEnCours(null)
    }
  }

  async function saveAttendance() {
    if (!selectedClassId || !selectedDate || students.length === 0) {
      return
    }

    if (modeLecon && !leconId) {
      setSaveMessage("Choisissez d'abord la leçon à marquer.")
      return
    }

    /*
     * En mode leçon la matière est exigée par la policy d'écriture. Si
     * le créneau ne la porte pas, on refuse ici : mieux vaut le dire que
     * de laisser partir une feuille qui sera refusée à la reconnexion,
     * quand plus personne n'aura la classe sous les yeux.
     */
    if (modeLecon && !leconChoisie?.subject_id) {
      setSaveMessage(
        "Cette leçon n'a pas de matière rattachée. Corrigez l'emploi du temps avant de marquer les présences."
      )
      return
    }

    setSaving(true)
    setSaveMessage(null)

    const cle = feuilleKey(selectedClassId, selectedDate, modeLecon ? leconId : null)
    const horodatage = new Date().toISOString()

    const entries: PendingAttendance[] = students.map((student) => ({
      id: createPendingId(),
      feuille: cle,
      schoolId,
      classId: selectedClassId,
      studentId: student.id,
      studentLabel: `${student.first_name} ${student.last_name}`,
      date: selectedDate,
      status: attendance[student.id]?.status ?? "present",
      slotId: modeLecon ? leconId : null,
      subjectId: modeLecon ? leconChoisie?.subject_id ?? null : null,
      queuedAt: horodatage,
    }))

    /*
     * LA FILE D'ABORD, TOUJOURS.
     *
     * L'appel est écrit sur l'appareil avant toute tentative réseau. Si
     * l'envoi aboutit, la file se vide dans la foulée et personne ne
     * voit rien. S'il échoue — coupure, onglet fermé, batterie vide —
     * la feuille est déjà à l'abri. L'inverse perdrait l'appel au
     * premier incident.
     */
    const conserve = enqueueAttendance(entries)

    if (!conserve) {
      setSaveMessage(
        "Votre appareil refuse d'enregistrer localement (stockage plein ou navigation privée). Ne quittez pas cette page avant que l'appel soit envoyé."
      )
    }

    setEnAttente(readAttendanceQueue())

    if (!enLigne) {
      setSaveMessage(
        `Appel de ${entries.length} élève(s) enregistré sur cet appareil. Il partira dès le retour du réseau — vous pouvez fermer la page.`
      )
      setSaving(false)
      return
    }

    await envoyerEnAttente(entries)

    const restant = readAttendanceQueue().filter((entry) => entry.feuille === cle)

    if (restant.length > 0) {
      const bloquees = restant.filter((entry) => entry.lastError)

      setSaveMessage(
        bloquees.length > 0
          ? `${bloquees.length} présence(s) ont été refusées : ${bloquees[0].lastError} Les autres restent en attente.`
          : `${restant.length} présence(s) n'ont pas pu partir. Elles sont conservées et repartiront au retour du réseau.`
      )
    } else {
      setSaveMessage("Présences enregistrées avec succès.")
    }

    await loadStudentsAndAttendance()
    setSaving(false)
  }

  const selectedClass = classes.find((item) => item.id === selectedClassId)

  /*
   * Un cycle non défini retombe sur la présence à la journée : c'est le
   * comportement d'origine, et le seul qui ne présuppose rien.
   */
  const modeLecon = Boolean(
    selectedClass?.cycle && !estPremierCycle(selectedClass.cycle)
  )

  const leconChoisie = lecons.find((item) => item.id === leconId)

  /*
   * Périodes du calendrier scolaire couvrant la date sélectionnée.
   *
   * Les dates sont au format ISO (AAAA-MM-JJ) côté base comme côté champ :
   * la comparaison de chaînes suffit et évite tout décalage de fuseau.
   */
  const matchingHolidays = useMemo(
    () =>
      holidays.filter(
        (holiday) =>
          selectedDate >= holiday.start_date &&
          selectedDate <= holiday.end_date
      ),
    [holidays, selectedDate]
  )

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement des présences...</p>
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
              Gestion des présences
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

        {/*
          L'état du réseau se dit AVANT la feuille, pas après.
          Un enseignant qui voit « hors ligne » en haut de son appel sait
          d'emblée ce qu'il fait ; le découvrir dans un message d'échec en
          bas de page, une fois l'appel saisi, c'est trop tard.
        */}
        {!enLigne && (
          <div
            className="rounded-lg border p-4 text-sm"
            style={{
              background: "oklch(0.80 0.14 78 / 0.12)",
              borderColor: "oklch(0.57 0.14 78 / 0.5)",
            }}
          >
            <p className="font-medium">Vous êtes hors ligne.</p>
            <p className="mt-2 text-muted-foreground">
              L&apos;appel reste possible : il sera enregistré sur cet
              appareil et partira tout seul au retour du réseau. Vous
              pouvez fermer la page entre-temps.
            </p>
          </div>
        )}

        {enAttente.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {enAttente.length} présence(s) en attente d&apos;envoi
              {envoiFile ? " — envoi en cours…" : ""}
            </p>

            {enAttente.some((entry) => entry.lastError) && (
              <p className="mt-2 text-muted-foreground">
                Dont{" "}
                {enAttente.filter((entry) => entry.lastError).length} refusée(s)
                par la base :{" "}
                {enAttente.find((entry) => entry.lastError)?.lastError} Ces
                lignes ne sont plus retentées automatiquement.
              </p>
            )}
          </div>
        )}

        {depuisCache && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Cette feuille vient de la dernière consultation enregistrée sur
            l&apos;appareil. Un élève inscrit depuis n&apos;y figure pas.
          </div>
        )}

        <div>
          <h2 className="text-3xl font-bold">Présences</h2>
          <p className="mt-2 text-muted-foreground">
            Enregistrez les présences des élèves par classe et par jour.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-4 rounded-xl border bg-background p-6 md:grid-cols-2">
          <div>
            <label htmlFor="class" className="mb-2 block font-medium">
              Classe
            </label>

            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune classe n'a encore été créée.{" "}
                <button
                  onClick={() => router.push("/classes")}
                  className="font-medium text-primary underline"
                >
                  Créer une classe
                </button>
              </p>
            ) : (
              <select
                id="class"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-3"
              >
                <option value="">Sélectionner une classe</option>

                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="date" className="mb-2 block font-medium">
              Date
            </label>

            <input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-3"
            />
          </div>

          {matchingHolidays.length > 0 && (
            <div
              className="rounded-lg border p-4 text-sm md:col-span-2"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.4)",
              }}
            >
              <p className="font-medium">
                Cette date tombe pendant{" "}
                {matchingHolidays
                  .map((holiday) => `« ${holiday.name} »`)
                  .join(", ")}
                .
              </p>

              <p className="mt-1 text-muted-foreground">
                Vous pouvez tout de même saisir les présences si un cours a été
                assuré.
              </p>
            </div>
          )}

          {/*
            SECOND CYCLE ET LYCÉE : on ne marque pas la journée, on marque
            UNE leçon. La liste sort de l'emploi du temps du jour — on ne
            propose pas une leçon qui n'a pas lieu.
          */}
          {modeLecon && (
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="lecon">Leçon à marquer</label>

              {lecons.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune leçon n&apos;est programmée pour cette classe ce
                  jour-là. Vérifiez l&apos;emploi du temps.
                </p>
              ) : (
                <select
                  id="lecon"
                  value={leconId}
                  onChange={(event) => setLeconId(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-3"
                >
                  {lecons.map((lecon) => (
                    <option key={lecon.id} value={lecon.id}>
                      {lecon.start_time.slice(0, 5)} –{" "}
                      {lecon.end_time.slice(0, 5)} —{" "}
                      {lecon.subjects?.name ?? "matière inconnue"}
                    </option>
                  ))}
                </select>
              )}

              <p className="text-xs text-muted-foreground">
                Chaque enseignant marque sa propre leçon : un élève présent
                le matin et absent l&apos;après-midi porte deux statuts
                distincts le même jour.
              </p>
            </div>
          )}

          <div className="md:col-span-2">
            <button
              onClick={async () => {
                if (modeLecon) {
                  await chargerLecons()
                }

                await loadStudentsAndAttendance()
              }}
              disabled={!selectedClassId || !selectedDate || loadingStudents}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingStudents ? "Chargement..." : "Charger la liste des élèves"}
            </button>
          </div>
        </div>

        {hasLoadedList && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {selectedClass?.name ?? "—"}
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(selectedDate).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>

                {matchingHolidays.length > 0 && (
                  <p
                    className="mt-2 inline-block rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      color: "oklch(0.57 0.14 78)",
                      borderColor: "oklch(0.57 0.14 78)",
                    }}
                  >
                    {matchingHolidays
                      .map((holiday) => holiday.name)
                      .join(", ")}
                  </p>
                )}
              </div>

              <button
                onClick={saveAttendance}
                disabled={saving || loadingStudents || students.length === 0}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer les présences"}
              </button>
            </div>

            {saveMessage && (
              <p className="mt-4 text-sm text-muted-foreground">{saveMessage}</p>
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
                <table className="w-full text-start text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">Élève</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-end">Parent</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => {
                      const currentStatus =
                        attendance[student.id]?.status ?? "present"

                      return (
                        <tr key={student.id} className="border-b last:border-0">
                          <td className="px-4 py-4 font-medium">
                            {student.last_name} {student.first_name}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {statusOptions.map((option) => {
                                const isSelected = currentStatus === option.value

                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                      updateStatus(student.id, option.value)
                                    }
                                    className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                                    style={
                                      isSelected
                                        ? {
                                            background: option.background,
                                            borderColor: option.color,
                                            color: option.color,
                                          }
                                        : undefined
                                    }
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </td>

                          {/*
                            Le message part au CLIC, jamais au changement
                            de statut : marquer vingt absents enverrait
                            sinon vingt messages d'affilée.
                          */}
                          <td className="px-4 py-4 text-end">
                            {currentStatus === "absent" ||
                            currentStatus === "late" ? (
                              <button
                                type="button"
                                /*
                                 * Hors ligne, le message ne part pas :
                                 * il traverse /api/parent-messages, qui
                                 * exige le réseau. On le dit sur le
                                 * bouton plutôt que de laisser tenter
                                 * pour rendre une erreur opaque. L'appel,
                                 * lui, reste possible — c'est la
                                 * différence qui compte.
                                 */
                                disabled={
                                  parentEnCours === student.id || !enLigne
                                }
                                title={
                                  enLigne
                                    ? undefined
                                    : "Impossible hors ligne : le message aux parents part par le réseau."
                                }
                                onClick={() =>
                                  prevenirLeParent(
                                    student,
                                    currentStatus === "late"
                                      ? "retard"
                                      : "absence",
                                    {
                                      date: selectedDate,
                                      matiere: modeLecon
                                        ? leconChoisie?.subjects?.name
                                        : undefined,
                                    },
                                    attendance[student.id]?.attendanceId
                                  )
                                }
                                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                              >
                                {parentEnCours === student.id
                                  ? "..."
                                  : enLigne
                                    ? "Prévenir le parent"
                                    : "Parent : hors ligne"}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {parentErreur && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {parentErreur}
                </div>
              )}

              {parentMessage && (
                <p className="mt-4 rounded-lg border p-3 text-sm">
                  {parentMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}