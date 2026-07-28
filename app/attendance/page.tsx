"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type ClassItem = {
  id: string
  name: string
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

type AttendanceStatus = "present" | "absent" | "late" | "excused"

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

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name")
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

  async function loadStudentsAndAttendance() {
    setStudentsError(null)
    setSaveMessage(null)

    if (!selectedClassId || !selectedDate) {
      return
    }

    setLoadingStudents(true)
    setHasLoadedList(true)

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

    const { data: existingAttendance, error: attendanceError } = await supabase
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

  async function saveAttendance() {
    if (!selectedClassId || !selectedDate || students.length === 0) {
      return
    }

    setSaving(true)
    setSaveMessage(null)

    const updates = students.map((student) => {
      const entry = attendance[student.id]
      const status: AttendanceStatus = entry?.status ?? "present"

      if (entry?.attendanceId) {
        return supabase
          .from("attendance")
          .update({ status })
          .eq("id", entry.attendanceId)
      }

      return supabase.from("attendance").insert({
        school_id: schoolId,
        class_id: selectedClassId,
        student_id: student.id,
        attendance_date: selectedDate,
        status,
      })
    })

    const results = await Promise.all(updates)
    const failed = results.filter((result) => result.error)

    if (failed.length > 0) {
      console.error("Erreurs lors de l'enregistrement :", failed)
      setSaveMessage(
        `${failed.length} présence(s) n'ont pas pu être enregistrées. Réessayez.`
      )
    } else {
      setSaveMessage("Présences enregistrées avec succès.")
    }

    await loadStudentsAndAttendance()
    setSaving(false)
  }

  const selectedClass = classes.find((item) => item.id === selectedClassId)

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

          <div className="md:col-span-2">
            <button
              onClick={loadStudentsAndAttendance}
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
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">Élève</th>
                      <th className="px-4 py-3">Statut</th>
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
                        </tr>
                      )
                    })}
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