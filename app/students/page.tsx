"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"

type ClassItem = {
  id: string
  name: string
  level: string | null
}

type Enrollment = {
  student_id: string
  academic_year_id: string
  classes: {
    id: string
    name: string
  } | null
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

// Libellé du groupe pour les élèves sans inscription en classe.
const UNASSIGNED_CLASS_LABEL = "Sans classe"

export default function StudentsPage() {
  const router = useRouter()

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")
  const [activeAcademicYearId, setActiveAcademicYearId] = useState("")
  const [selectedClassId, setSelectedClassId] = useState("")

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

    const { data: academicYearData, error: academicYearError } =
      await supabase
        .from("academic_years")
        .select("id")
        .eq("school_id", profile.school_id)
        .eq("is_active", true)
        .maybeSingle()

    if (academicYearError) {
      console.error(
        "Erreur lors du chargement de l'année scolaire active :",
        academicYearError
      )
      setLoadError(
        "Impossible de vérifier l'année scolaire active."
      )
    }

    setActiveAcademicYearId(academicYearData?.id ?? "")

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("school_id", profile.school_id)
      .order("name", { ascending: true })

    if (classesError) {
      console.error("Erreur lors du chargement des classes :", classesError)
      setLoadError("Impossible de charger la liste des classes.")
    }

    setClasses(classesData ?? [])

    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, date_of_birth, gender, student_number, address, parent_name, parent_phone"
      )
      .eq("school_id", profile.school_id)
      .order("last_name", { ascending: true })

    if (studentsError) {
      console.error(
        "Erreur lors du chargement des élèves :",
        studentsError
      )
      setLoadError("Impossible de charger la liste des élèves.")
    }

    setStudents(studentsData ?? [])

    // Sert uniquement à regrouper la liste des élèves par classe.
    const { data: enrollmentsData, error: enrollmentsError } = await supabase
      .from("student_class_enrollments")
      .select(`
        student_id,
        academic_year_id,
        classes ( id, name )
      `)
      .eq("school_id", profile.school_id)

    if (enrollmentsError) {
      console.error(
        "Erreur lors du chargement des inscriptions :",
        enrollmentsError
      )
      setLoadError("Impossible de charger les classes des élèves.")
    }

    setEnrollments((enrollmentsData as unknown as Enrollment[]) ?? [])

    setLoading(false)
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!firstName.trim() || !lastName.trim()) {
      alert("Le prénom et le nom sont obligatoires.")
      return
    }

    if (!selectedClassId) {
      alert("Veuillez sélectionner une classe.")
      return
    }

    if (!activeAcademicYearId) {
      alert(
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

      alert(
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

      alert(
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

    await loadData()

    setCreating(false)
  }

  /*
   * Classe de chaque élève pour l'année scolaire active.
   * Si aucune année active n'est configurée, on retombe sur
   * l'ensemble des inscriptions pour ne pas masquer les classes.
   */
  const classNameByStudentId = useMemo(() => {
    const map = new Map<string, string>()

    enrollments
      .filter(
        (enrollment) =>
          !activeAcademicYearId ||
          enrollment.academic_year_id === activeAcademicYearId
      )
      .forEach((enrollment) => {
        if (enrollment.classes?.name) {
          map.set(enrollment.student_id, enrollment.classes.name)
        }
      })

    return map
  }, [enrollments, activeAcademicYearId])

  /*
   * Élèves regroupés par classe et filtrés par la recherche.
   * Le filtrage est fait côté client sur les données déjà chargées.
   */
  const studentGroups = useMemo(() => {
    const groups = new Map<string, Student[]>()

    students
      .filter((student) =>
        matchesSearch(
          searchTerm,
          student.first_name,
          student.last_name,
          student.student_number
        )
      )
      .forEach((student) => {
        const className =
          classNameByStudentId.get(student.id) ?? UNASSIGNED_CLASS_LABEL

        const group = groups.get(className)

        if (group) {
          group.push(student)
        } else {
          groups.set(className, [student])
        }
      })

    return Array.from(groups.entries())
      .map(([className, groupStudents]) => ({
        className,
        students: [...groupStudents].sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`,
            "fr"
          )
        ),
      }))
      .sort((a, b) => {
        // « Sans classe » reste toujours en dernier.
        if (a.className === UNASSIGNED_CLASS_LABEL) return 1
        if (b.className === UNASSIGNED_CLASS_LABEL) return -1

        return a.className.localeCompare(b.className, "fr")
      })
  }, [students, classNameByStudentId, searchTerm])

  const matchedStudentCount = studentGroups.reduce(
    (total, group) => total + group.students.length,
    0
  )

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold">
              Ridwane
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
                    onChange={(event) =>
                      setFirstName(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName">
                    Nom *
                  </label>

                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) =>
                      setLastName(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="class">
                  Classe *
                </label>

                <select
                  id="class"
                  value={selectedClassId}
                  onChange={(event) =>
                    setSelectedClassId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
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

                {classes.length === 0 && (
                  <p className="text-sm text-destructive">
                    Vous devez d'abord créer une classe.
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  Liste des élèves
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? `${matchedStudentCount} élève(s) sur ${students.length}`
                    : `${students.length} élève(s)`}
                </p>
              </div>

              <div className="w-full sm:w-72">
                <label htmlFor="student-search" className="sr-only">
                  Rechercher un élève
                </label>

                <input
                  id="student-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Rechercher un élève..."
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
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
            ) : studentGroups.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun élève ne correspond à « {searchTerm.trim()} ».
              </p>
            ) : (
              <div className="mt-6 space-y-8">
                {studentGroups.map((group) => (
                  <div key={group.className}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                      <h4 className="font-heading text-lg font-bold">
                        {group.className}
                      </h4>

                      <p className="text-sm text-muted-foreground">
                        {group.students.length} élève(s)
                      </p>
                    </div>

                    <div className="overflow-x-auto">
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
                          {group.students.map((student) => (
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}