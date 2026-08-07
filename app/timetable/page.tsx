"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { can } from "@/src/lib/roles"
import {
  estModeTitulaire,
  hasFiliere,
  toSchoolType,
} from "@/src/lib/etablissement"

type ClassItem = {
  id: string
  name: string
  level: string | null
  cycle: string | null
}

type Subject = {
  id: string
  name: string
  code: string | null
  /* Programme dont relève la matière. Nul hors école franco-arabe. */
  filiere: string | null
}

/* Titulaire d'une classe, par filière. Voir class_head_teachers. */
type HeadTeacher = {
  class_id: string
  teacher_id: string
  filiere: string | null
}

type Teacher = {
  id: string
  first_name: string
  last_name: string
}

/*
 * Une matière affectée à une classe, avec l'enseignant qui la tient.
 * C'est ce que l'emploi du temps place dans la semaine — il ne forme
 * plus le couple, il l'horodate.
 */
type Affectation = {
  class_id: string
  subject_id: string
  teacher_id: string | null
  subjects: { name: string; filiere: string | null } | null
  teachers: { first_name: string; last_name: string } | null
}

type TimetableSlot = {
  id: string
  class_id: string
  subject_id: string
  teacher_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  subjects: { name: string } | null
  teachers: { first_name: string; last_name: string } | null
}

const days = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
]

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + (minutes || 0)
}

function formatTime(time: string) {
  return time.slice(0, 5)
}

export default function TimetablePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /* Role de la personne connectee, pour masquer ce qu\'elle ne peut pas faire. */
  const [monRole, setMonRole] = useState("")

  const [schoolId, setSchoolId] = useState("")
  const [academicYearId, setAcademicYearId] = useState("")

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [headTeachers, setHeadTeachers] = useState<HeadTeacher[]>([])
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [schoolType, setSchoolType] = useState("classique")

  const [selectedClassId, setSelectedClassId] = useState("")
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [subjectId, setSubjectId] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [dayOfWeek, setDayOfWeek] = useState("1")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")

  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    subjectId?: string
    dayOfWeek?: string
    startTime?: string
    endTime?: string
  }>({})

  const classeChoisie = classes.find((item) => item.id === selectedClassId)
  const matiereChoisie = subjects.find((item) => item.id === subjectId)

  /*
   * L'EMPLOI DU TEMPS NE POSE QUE DES HORAIRES.
   *
   * La matière et son enseignant se décident une seule fois, sur Classes
   * / Matières, où se règle aussi le coefficient. Ici on ne choisit plus
   * qu'un couple DÉJÀ FORMÉ — d'où une liste fermée.
   *
   * Ce n'est pas qu'une commodité : proposer ici une matière non affectée
   * créait un créneau pour une matière qui ne compte dans aucun bulletin,
   * et un enseignant choisi au créneau pouvait différer de celui de
   * l'affectation. Deux vérités pour la même chose.
   */
  const couplesDeLaClasse = affectations.filter(
    (item) => item.class_id === selectedClassId
  )

  const coupleChoisi = couplesDeLaClasse.find(
    (item) => item.subject_id === subjectId
  )

  /*
   * L'enseignant est imposé quand — et seulement quand — l'école est
   * franco-arabe ET la classe de premier cycle. Partout ailleurs le
   * choix libre par créneau reste celui d'avant.
   */
  const modeTitulaire =
    hasFiliere(schoolType) && estModeTitulaire(classeChoisie?.cycle)

  const titulaireDuCreneau = modeTitulaire
    ? teachers.find(
        (teacher) =>
          teacher.id ===
          headTeachers.find(
            (head) =>
              head.class_id === selectedClassId &&
              head.filiere === (matiereChoisie?.filiere ?? null)
          )?.teacher_id
      )
    : undefined

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    // Fonction interne : voir la note sur les rendus en cascade.
    async function appliquer() {
      if (selectedClassId) {
        await loadSlots(selectedClassId)
      } else {
        setSlots([])
      }
    }

    appliquer()
  }, [selectedClassId])

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

    const loadErrors: string[] = []

    const [
      yearResult,
      classesResult,
      subjectsResult,
      teachersResult,
      headsResult,
      schoolResult,
      affectationsResult,
    ] = await Promise.all([
        supabase
          .from("academic_years")
          .select("id")
          .eq("school_id", profile.school_id)
          .eq("is_active", true)
          .maybeSingle(),

        supabase
          .from("classes")
          .select("id, name, level, cycle")
          .eq("school_id", profile.school_id)
          .order("name"),

        supabase
          .from("subjects")
          .select("id, name, code, filiere")
          .eq("school_id", profile.school_id)
          .order("name"),

        supabase
          .from("teachers")
          .select("id, first_name, last_name")
          .eq("school_id", profile.school_id)
          .order("last_name"),

        supabase
          .from("class_head_teachers")
          .select("class_id, teacher_id, filiere")
          .eq("school_id", profile.school_id),

        supabase
          .from("schools")
          .select("school_type")
          .eq("id", profile.school_id)
          .maybeSingle(),

        supabase
          .from("class_subjects")
          .select(
            "class_id, subject_id, teacher_id, subjects ( name, filiere ), teachers ( first_name, last_name )"
          )
          .eq("school_id", profile.school_id),
      ])

    if (yearResult.error) {
      console.error("Erreur année scolaire :", yearResult.error)
      loadErrors.push("l'année scolaire active")
    }

    setAcademicYearId(yearResult.data?.id ?? "")

    if (classesResult.error) {
      console.error("Erreur classes :", classesResult.error)
      loadErrors.push("les classes")
    }

    setClasses(classesResult.data ?? [])

    if (subjectsResult.error) {
      console.error("Erreur matières :", subjectsResult.error)
      loadErrors.push("les matières")
    }

    setSubjects(subjectsResult.data ?? [])

    if (teachersResult.error) {
      console.error("Erreur enseignants :", teachersResult.error)
      loadErrors.push("les enseignants")
    }

    setTeachers(teachersResult.data ?? [])

    if (headsResult.error) {
      console.error("Erreur titulaires :", headsResult.error)
      loadErrors.push("les titulaires de classe")
    }

    setHeadTeachers((headsResult.data as HeadTeacher[]) ?? [])
    setSchoolType(toSchoolType(schoolResult.data?.school_type))

    if (affectationsResult.error) {
      console.error("Erreur affectations :", affectationsResult.error)
      loadErrors.push("les matières affectées aux classes")
    }

    setAffectations(
      (affectationsResult.data as unknown as Affectation[]) ?? []
    )

    if (loadErrors.length > 0) {
      setLoadError(
        `Certaines données n'ont pas pu être chargées (${loadErrors.join(", ")}).`
      )
    }

    setLoading(false)
  }

  async function loadSlots(classId: string) {
    setLoadingSlots(true)
    setSlotsError(null)

    const { data, error } = await supabase
      .from("timetable_slots")
      .select(`
        id,
        class_id,
        subject_id,
        teacher_id,
        day_of_week,
        start_time,
        end_time,
        subjects ( name ),
        teachers ( first_name, last_name )
      `)
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) {
      console.error("Erreur créneaux :", error)
      setSlotsError("Impossible de charger l'emploi du temps de cette classe.")
      setSlots([])
      setLoadingSlots(false)
      return
    }

    setSlots((data as unknown as TimetableSlot[]) ?? [])
    setLoadingSlots(false)
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const errors: typeof fieldErrors = {}

    if (!subjectId) {
      errors.subjectId = "Veuillez sélectionner une matière."
    }

    if (!dayOfWeek) {
      errors.dayOfWeek = "Veuillez sélectionner un jour."
    }

    if (!startTime) {
      errors.startTime = "Veuillez indiquer l'heure de début."
    }

    if (!endTime) {
      errors.endTime = "Veuillez indiquer l'heure de fin."
    }

    if (startTime && endTime && toMinutes(endTime) <= toMinutes(startTime)) {
      errors.endTime = "L'heure de fin doit être après l'heure de début."
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    if (!academicYearId) {
      setFormError(
        "Aucune année scolaire active n'est configurée pour votre établissement. Configurez-la avant d'ajouter un créneau."
      )
      return
    }

    setCreating(true)

    const dayValue = Number(dayOfWeek)

    const { data: conflictData, error: conflictError } = await supabase
      .from("timetable_slots")
      .select(`
        id,
        class_id,
        teacher_id,
        start_time,
        end_time,
        classes ( name )
      `)
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId)
      .eq("day_of_week", dayValue)

    if (conflictError) {
      console.error(
        "Erreur vérification des chevauchements :",
        conflictError
      )
      setFormError(
        "Impossible de vérifier les chevauchements d'horaire. Réessayez."
      )
      setCreating(false)
      return
    }

    type ConflictRow = {
      id: string
      class_id: string
      teacher_id: string | null
      start_time: string
      end_time: string
      classes: { name: string } | null
    }

    const conflictRows = (conflictData as unknown as ConflictRow[]) ?? []

    const newStart = toMinutes(startTime)
    const newEnd = toMinutes(endTime)

    const overlaps = (rowStart: string, rowEnd: string) =>
      toMinutes(rowStart) < newEnd && newStart < toMinutes(rowEnd)

    const classConflict = conflictRows.find(
      (row) =>
        row.class_id === selectedClassId && overlaps(row.start_time, row.end_time)
    )

    if (classConflict) {
      setFormError(
        `Cette classe a déjà un créneau qui chevauche cet horaire (${formatTime(
          classConflict.start_time
        )} - ${formatTime(classConflict.end_time)}).`
      )
      setCreating(false)
      return
    }

    /*
     * En mode titulaire, l'enseignant effectif n'est pas celui du
     * formulaire : sans cette substitution, le contrôle de chevauchement
     * ne porterait sur personne et un titulaire pourrait se retrouver
     * dans deux classes à la même heure.
     */
    const enseignantEffectif = modeTitulaire
      ? titulaireDuCreneau?.id ?? ""
      : teacherId

    if (enseignantEffectif) {
      const teacherConflict = conflictRows.find(
        (row) =>
          row.teacher_id === enseignantEffectif &&
          overlaps(row.start_time, row.end_time)
      )

      if (teacherConflict) {
        setFormError(
          `Cet enseignant a déjà un créneau qui chevauche cet horaire en ${
            teacherConflict.classes?.name ?? "une autre classe"
          } (${formatTime(teacherConflict.start_time)} - ${formatTime(
            teacherConflict.end_time
          )}).`
        )
        setCreating(false)
        return
      }
    }

    const { error } = await supabase.from("timetable_slots").insert({
      school_id: schoolId,
      class_id: selectedClassId,
      subject_id: subjectId,
      /*
       * En mode titulaire, le déclencheur en base écrase de toute façon
       * cette valeur : on envoie le titulaire pour que l'écran et la
       * base disent la même chose, plutôt que de laisser un écart.
       */
      teacher_id: modeTitulaire
        ? titulaireDuCreneau?.id ?? null
        : coupleChoisi?.teacher_id ?? null,
      academic_year_id: academicYearId,
      day_of_week: dayValue,
      start_time: startTime,
      end_time: endTime,
    })

    if (error) {
      console.error("Erreur création créneau :", error)
      setFormError(error.message)
      setCreating(false)
      return
    }

    setSubjectId("")
    setTeacherId("")
    setStartTime("")
    setEndTime("")

    await loadSlots(selectedClassId)

    setCreating(false)
  }

  async function deleteSlot(slotId: string) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer ce créneau ?"
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("timetable_slots")
      .delete()
      .eq("id", slotId)

    if (error) {
      console.error("Erreur suppression créneau :", error)
      setSlotsError("Impossible de supprimer ce créneau.")
      return
    }

    await loadSlots(selectedClassId)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">
          Chargement de l'emploi du temps...
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
              Emploi du temps
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

      <section className="mx-auto max-w-7xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">Emploi du temps</h2>
          <p className="mt-2 text-muted-foreground">
            Consultez et gérez les créneaux horaires par classe.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border bg-background p-6">
          <label htmlFor="class-select" className="mb-2 block font-medium">
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
              id="class-select"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-3 sm:max-w-md"
            >
              <option value="">Sélectionner une classe</option>

              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.level ? ` — ${item.level}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedClassId && (
          <div className="grid gap-8 xl:grid-cols-[380px_1fr]">
            {/*
              L'emploi du temps se compose depuis l'encadrement : le RLS
              refuse l'écriture à l'enseignant, qui n'a ici qu'à lire le
              sien.
            */}
            {can(monRole, "classes.gerer") ? (
            <div className="rounded-xl border bg-background p-6">
              <h3 className="text-xl font-semibold">
                Ajouter un créneau
              </h3>

              <form onSubmit={createSlot} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="subject">Matière *</label>

                  <select
                    id="subject"
                    value={subjectId}
                    onChange={(event) => {
                      setSubjectId(event.target.value)
                      setFieldErrors((current) => ({
                        ...current,
                        subjectId: undefined,
                      }))
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Sélectionner une matière</option>

                    {couplesDeLaClasse.map((item) => (
                      <option key={item.subject_id} value={item.subject_id}>
                        {item.subjects?.name ?? "Matière"}
                        {item.teachers
                          ? ` — ${item.teachers.last_name} ${item.teachers.first_name}`
                          : ""}
                      </option>
                    ))}
                  </select>

                  {fieldErrors.subjectId && (
                    <p className="text-sm text-destructive">
                      {fieldErrors.subjectId}
                    </p>
                  )}

                  {/*
                    La liste est celle des matières AFFECTÉES à cette
                    classe. Vide, ce n'est pas qu'il manque des matières
                    dans l'école : c'est qu'aucune n'a encore été
                    rattachée à cette classe-là. On envoie donc à l'écran
                    qui le fait, pas à celui qui crée les matières.
                  */}
                  {selectedClassId && couplesDeLaClasse.length === 0 && (
                    <p className="text-sm text-destructive">
                      Aucune matière n&apos;est affectée à cette classe.{" "}
                      <button
                        type="button"
                        onClick={() => router.push("/class_subjects")}
                        className="font-medium underline"
                      >
                        Affectez-en une
                      </button>{" "}
                      — c&apos;est là que se choisissent la matière, son
                      enseignant et son coefficient.
                    </p>
                  )}
                </div>

                {/*
                  PREMIER CYCLE EN ÉCOLE FRANCO-ARABE : l'enseignant ne se
                  choisit pas. Le créneau revient au titulaire de la
                  filière de sa matière, sans quoi une même classe pourrait
                  se retrouver avec deux enseignants sur un même programme.
                  Le déclencheur imposer_titulaire_premier_cycle() l'impose
                  en base ; ce bloc ne fait que ne pas proposer un choix
                  qui serait de toute façon écrasé.

                  Ailleurs — école classique, second cycle, lycée — le
                  choix libre par créneau est conservé tel quel.
                */}
                {modeTitulaire ? (
                  <div className="space-y-2">
                    <p>Enseignant</p>

                    <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                      {titulaireDuCreneau
                        ? `${titulaireDuCreneau.last_name} ${titulaireDuCreneau.first_name}`
                        : "Titulaire non nommé pour ce programme"}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {titulaireDuCreneau
                        ? "Classe de premier cycle : le titulaire de ce programme assure tous ses créneaux."
                        : "Nommez le titulaire de ce programme depuis Classes / Matières avant de composer l'emploi du temps."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p>Enseignant</p>

                    {/*
                      Plus de choix ici : l'enseignant vient de
                      l'affectation, décidée une fois pour toutes sur
                      Classes / Matières. Le proposer de nouveau
                      permettait de poser un créneau tenu par quelqu'un
                      d'autre que l'enseignant de la matière — deux
                      vérités pour la même chose, et un bulletin qui ne
                      sait plus laquelle croire.
                    */}
                    <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                      {coupleChoisi?.teachers
                        ? `${coupleChoisi.teachers.last_name} ${coupleChoisi.teachers.first_name}`
                        : subjectId
                          ? "Aucun enseignant sur cette affectation"
                          : "Choisissez d'abord la matière"}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Celui de l&apos;affectation. Pour en changer, passez
                      par Classes / Matières.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="day">Jour *</label>

                  <select
                    id="day"
                    value={dayOfWeek}
                    onChange={(event) => {
                      setDayOfWeek(event.target.value)
                      setFieldErrors((current) => ({
                        ...current,
                        dayOfWeek: undefined,
                      }))
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    {days.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>

                  {fieldErrors.dayOfWeek && (
                    <p className="text-sm text-destructive">
                      {fieldErrors.dayOfWeek}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="start-time">Heure de début *</label>

                    <input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(event) => {
                        setStartTime(event.target.value)
                        setFieldErrors((current) => ({
                          ...current,
                          startTime: undefined,
                          endTime: undefined,
                        }))
                      }}
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />

                    {fieldErrors.startTime && (
                      <p className="text-sm text-destructive">
                        {fieldErrors.startTime}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="end-time">Heure de fin *</label>

                    <input
                      id="end-time"
                      type="time"
                      value={endTime}
                      onChange={(event) => {
                        setEndTime(event.target.value)
                        setFieldErrors((current) => ({
                          ...current,
                          endTime: undefined,
                        }))
                      }}
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />

                    {fieldErrors.endTime && (
                      <p className="text-sm text-destructive">
                        {fieldErrors.endTime}
                      </p>
                    )}
                  </div>
                </div>

                {formError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating || subjects.length === 0}
                  className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? "Ajout..." : "Ajouter le créneau"}
                </button>
              </form>
            </div>
            ) : (
              <div className="rounded-xl border bg-background p-6">
                <h3 className="text-xl font-semibold">Consultation</h3>

                <p className="mt-3 text-sm text-muted-foreground">
                  Vous consultez l&apos;emploi du temps de cette classe.
                  Sa composition revient à la direction.
                </p>
              </div>
            )}

            <div className="rounded-xl border bg-background p-6">
              <h3 className="text-xl font-semibold">
                Grille de la semaine
              </h3>

              {slotsError && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {slotsError}
                </div>
              )}

              {loadingSlots ? (
                <p className="mt-6 text-muted-foreground">
                  Chargement des créneaux...
                </p>
              ) : slots.length === 0 ? (
                <p className="mt-6 text-muted-foreground">
                  Aucun créneau pour cette classe. Ajoutez-en un depuis le formulaire.
                </p>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {days.map((day) => {
                    const daySlots = slots
                      .filter((slot) => slot.day_of_week === day.value)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))

                    return (
                      <div key={day.value} className="rounded-lg border p-4">
                        <p className="font-semibold">{day.label}</p>

                        {daySlots.length === 0 ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            Aucun cours
                          </p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {daySlots.map((slot) => (
                              <div
                                key={slot.id}
                                className="rounded-md border bg-muted/30 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium">
                                      {formatTime(slot.start_time)} –{" "}
                                      {formatTime(slot.end_time)}
                                    </p>

                                    <p className="text-sm">
                                      {slot.subjects?.name ?? "—"}
                                    </p>

                                    {slot.teachers && (
                                      <p className="text-xs text-muted-foreground">
                                        {slot.teachers.last_name}{" "}
                                        {slot.teachers.first_name}
                                      </p>
                                    )}
                                  </div>

                                  {can(monRole, "classes.gerer") && (
                                    <button
                                      onClick={() => deleteSlot(slot.id)}
                                      className="text-xs font-medium text-destructive hover:underline"
                                    >
                                      Supprimer
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
