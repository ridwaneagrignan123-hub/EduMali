"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type ClassItem = {
  id: string
  name: string
  level: string | null
}

type Student = {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  student_number: string | null
  address: string | null
  parent_name: string | null
  parent_phone: string | null
}

export default function StudentsPage() {
  const router = useRouter()

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string
    lastName?: string
    selectedClassId?: string
  }>({})

  const [schoolId, setSchoolId] = useState("")
  const [activeAcademicYearId, setActiveAcademicYearId] = useState("")
  const [selectedClassId, setSelectedClassId] = useState("")

  const PAGE_SIZE = 30
  const [page, setPage] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [gender, setGender] = useState("")
  const [studentNumber, setStudentNumber] = useState("")
  const [address, setAddress] = useState("")
  const [parentName, setParentName] = useState("")
  const [parentPhone, setParentPhone] = useState("")

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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const loadErrors: string[] = []

    const [academicYearResult, classesResult, studentsResult] =
      await Promise.all([
        supabase
          .from("academic_years")
          .select("id")
          .eq("school_id", profile.school_id)
          .eq("is_active", true)
          .maybeSingle(),

        supabase
          .from("classes")
          .select("id, name, level")
          .eq("school_id", profile.school_id)
          .order("name", { ascending: true }),

        supabase
          .from("students")
          .select(
            "id, first_name, last_name, date_of_birth, gender, student_number, address, parent_name, parent_phone",
            { count: "exact" }
          )
          .eq("school_id", profile.school_id)
          .order("last_name", { ascending: true })
          .range(0, PAGE_SIZE - 1),
      ])

    if (academicYearResult.error) {
      console.error(
        "Erreur lors du chargement de l'année scolaire active :",
        academicYearResult.error
      )
      loadErrors.push("l'année scolaire active")
    }

    setActiveAcademicYearId(academicYearResult.data?.id ?? "")

    if (classesResult.error) {
      console.error(
        "Erreur lors du chargement des classes :",
        classesResult.error
      )
      loadErrors.push("les classes")
    }

    setClasses(classesResult.data ?? [])

    if (studentsResult.error) {
      console.error(
        "Erreur lors du chargement des élèves :",
        studentsResult.error
      )
      loadErrors.push("les élèves")
    }

    setStudents(studentsResult.data ?? [])
    setTotalStudents(studentsResult.count ?? 0)
    setPage(0)

    if (loadErrors.length > 0) {
      setLoadError(
        `Impossible de charger ${loadErrors.join(", ")}. Réessayez.`
      )
    }

    setLoading(false)
  }

  async function loadStudentsPage(pageIndex: number) {
    setLoading(true)

    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, date_of_birth, gender, student_number, address, parent_name, parent_phone",
        { count: "exact" }
      )
      .eq("school_id", schoolId)
      .order("last_name", { ascending: true })
      .range(from, to)

    if (error) {
      console.error("Erreur lors du chargement des élèves :", error)
      setLoadError("Impossible de charger la liste des élèves.")
      setLoading(false)
      return
    }

    setStudents(data ?? [])
    setTotalStudents(count ?? 0)
    setPage(pageIndex)
    setLoading(false)
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const errors: typeof fieldErrors = {}

    if (!firstName.trim()) {
      errors.firstName = "Le prénom est obligatoire."
    }

    if (!lastName.trim()) {
      errors.lastName = "Le nom est obligatoire."
    }

    if (!selectedClassId) {
      errors.selectedClassId = "Veuillez sélectionner une classe."
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    if (!activeAcademicYearId) {
      setFormError(
        "Aucune année scolaire active n'est configurée pour votre établissement. Configurez-la avant d'ajouter un élève."
      )
      return
    }

    setCreating(true)

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        school_id: schoolId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        student_number: studentNumber.trim() || null,
        address: address.trim() || null,
        parent_name: parentName.trim() || null,
        parent_phone: parentPhone.trim() || null,
      })
      .select()
      .single()

    if (studentError || !student) {
      console.error(
        "Erreur lors de la création de l'élève :",
        studentError
      )

      setFormError(
        studentError?.message ||
          "Impossible de créer l'élève."
      )

      setCreating(false)
      return
    }

    const { error: enrollmentError } = await supabase
      .from("student_class_enrollments")
      .insert({
        student_id: student.id,
        class_id: selectedClassId,
        school_id: schoolId,
        academic_year_id: activeAcademicYearId,
      })

    if (enrollmentError) {
      console.error(
        "Erreur lors de l'inscription de l'élève :",
        enrollmentError
      )

      setFormError(
        "L'élève a été créé, mais son inscription dans la classe a échoué : " +
          enrollmentError.message
      )

      setCreating(false)
      return
    }

    setFirstName("")
    setLastName("")
    setDateOfBirth("")
    setGender("")
    setStudentNumber("")
    setAddress("")
    setParentName("")
    setParentPhone("")
    setSelectedClassId("")

    await loadStudentsPage(0)

    setCreating(false)
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
              Gestion des élèves
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
          <h2 className="text-3xl font-bold">
            Élèves
          </h2>

          <p className="mt-2 text-muted-foreground">
            Ajoutez et gérez les élèves de votre établissement.
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
              Ajouter un élève
            </h3>

            <form
              onSubmit={createStudent}
              className="mt-6 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <label htmlFor="firstName">
                    Prénom *
                  </label>

                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value)
                      setFieldErrors((current) => ({
                        ...current,
                        firstName: undefined,
                      }))
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />

                  {fieldErrors.firstName && (
                    <p className="text-sm text-destructive">
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName">
                    Nom *
                  </label>

                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value)
                      setFieldErrors((current) => ({
                        ...current,
                        lastName: undefined,
                      }))
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />

                  {fieldErrors.lastName && (
                    <p className="text-sm text-destructive">
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="class">
                  Classe *
                </label>

                <select
                  id="class"
                  value={selectedClassId}
                  onChange={(event) => {
                    setSelectedClassId(event.target.value)
                    setFieldErrors((current) => ({
                      ...current,
                      selectedClassId: undefined,
                    }))
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">
                    Sélectionner une classe
                  </option>

                  {classes.map((classItem) => (
                    <option
                      key={classItem.id}
                      value={classItem.id}
                    >
                      {classItem.name}
                      {classItem.level
                        ? ` — ${classItem.level}`
                        : ""}
                    </option>
                  ))}
                </select>

                {fieldErrors.selectedClassId && (
                  <p className="text-sm text-destructive">
                    {fieldErrors.selectedClassId}
                  </p>
                )}

                {!loading && classes.length === 0 && (
                  <p className="text-sm text-destructive">
                    Vous devez d'abord{" "}
                    <button
                      type="button"
                      onClick={() => router.push("/classes")}
                      className="font-medium underline"
                    >
                      créer une classe
                    </button>
                    .
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="dateOfBirth">
                  Date de naissance
                </label>

                <input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) =>
                    setDateOfBirth(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="gender">
                  Sexe
                </label>

                <select
                  id="gender"
                  value={gender}
                  onChange={(event) =>
                    setGender(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">
                    Sélectionner
                  </option>

                  <option value="M">
                    Masculin
                  </option>

                  <option value="F">
                    Féminin
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="studentNumber">
                  Numéro d'inscription
                </label>

                <input
                  id="studentNumber"
                  type="text"
                  value={studentNumber}
                  onChange={(event) =>
                    setStudentNumber(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="address">
                  Adresse
                </label>

                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(event) =>
                    setAddress(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="parentName">
                  Nom du parent/tuteur
                </label>

                <input
                  id="parentName"
                  type="text"
                  value={parentName}
                  onChange={(event) =>
                    setParentName(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="parentPhone">
                  Téléphone du parent/tuteur
                </label>

                <input
                  id="parentPhone"
                  type="tel"
                  value={parentPhone}
                  onChange={(event) =>
                    setParentPhone(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={creating || classes.length === 0}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Ajouter l'élève"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Liste des élèves
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {totalStudents} élève(s)
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des élèves...
              </p>
            ) : students.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun élève enregistré pour le moment.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">
                        Élève
                      </th>

                      <th className="px-4 py-3">
                        Sexe
                      </th>

                      <th className="px-4 py-3">
                        Date de naissance
                      </th>

                      <th className="px-4 py-3">
                        Parent/Tuteur
                      </th>

                      <th className="px-4 py-3">
                        Téléphone
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => (
                      <tr
                        key={student.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-4">
                          <p className="font-medium">
                            {student.first_name}{" "}
                            {student.last_name}
                          </p>

                          {student.student_number && (
                            <p className="text-xs text-muted-foreground">
                              N°{" "}
                              {student.student_number}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {student.gender === "M"
                            ? "Masculin"
                            : student.gender === "F"
                              ? "Féminin"
                              : "—"}
                        </td>

                        <td className="px-4 py-4">
                          {student.date_of_birth || "—"}
                        </td>

                        <td className="px-4 py-4">
                          {student.parent_name || "—"}
                        </td>

                        <td className="px-4 py-4">
                          {student.parent_phone || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalStudents > PAGE_SIZE && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Page {page + 1} sur {Math.ceil(totalStudents / PAGE_SIZE)}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadStudentsPage(page - 1)}
                        disabled={page === 0 || loading}
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Précédent
                      </button>

                      <button
                        type="button"
                        onClick={() => loadStudentsPage(page + 1)}
                        disabled={
                          (page + 1) * PAGE_SIZE >= totalStudents || loading
                        }
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}