"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type Teacher = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  specialty: string | null
  hire_date: string | null
  status: string
}

export default function TeachersPage() {
  const router = useRouter()

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [schoolId, setSchoolId] = useState("")

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [hireDate, setHireDate] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const { data: teachersData, error: teachersError } =
      await supabase
        .from("teachers")
        .select(
          "id, first_name, last_name, email, phone, specialty, hire_date, status"
        )
        .eq("school_id", profile.school_id)
        .order("last_name", { ascending: true })

    if (teachersError) {
      console.error(
        "Erreur lors du chargement des enseignants :",
        teachersError
      )
    }

    setTeachers(teachersData ?? [])
    setLoading(false)
  }

  async function createTeacher(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!firstName.trim() || !lastName.trim()) {
      alert("Le prénom et le nom sont obligatoires.")
      return
    }

    setCreating(true)

    const { error } = await supabase
      .from("teachers")
      .insert({
        school_id: schoolId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        specialty: specialty.trim() || null,
        hire_date: hireDate || null,
        status: "active",
      })

    if (error) {
      console.error(
        "Erreur lors de la création de l'enseignant :",
        error
      )

      alert(error.message)
      setCreating(false)
      return
    }

    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setSpecialty("")
    setHireDate("")

    await loadData()

    setCreating(false)
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              EduMali
            </h1>

            <p className="text-sm text-muted-foreground">
              Gestion des enseignants
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
            Enseignants
          </h2>

          <p className="mt-2 text-muted-foreground">
            Ajoutez et gérez les enseignants de votre établissement.
          </p>
        </div>

        <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Ajouter un enseignant
            </h3>

            <form
              onSubmit={createTeacher}
              className="mt-6 space-y-4"
            >
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

              <div className="space-y-2">
                <label htmlFor="email">
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="phone">
                  Téléphone
                </label>

                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  autoComplete="tel"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="specialty">
                  Spécialité
                </label>

                <input
                  id="specialty"
                  type="text"
                  placeholder="Ex : Mathématiques"
                  value={specialty}
                  onChange={(event) =>
                    setSpecialty(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="hireDate">
                  Date d'embauche
                </label>

                <input
                  id="hireDate"
                  type="date"
                  value={hireDate}
                  onChange={(event) =>
                    setHireDate(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Ajouter l'enseignant"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Liste des enseignants
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {teachers.length} enseignant(s)
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des enseignants...
              </p>
            ) : teachers.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun enseignant enregistré pour le moment.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">
                        Enseignant
                      </th>

                      <th className="px-4 py-3">
                        Email
                      </th>

                      <th className="px-4 py-3">
                        Téléphone
                      </th>

                      <th className="px-4 py-3">
                        Spécialité
                      </th>

                      <th className="px-4 py-3">
                        Statut
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {teachers.map((teacher) => (
                      <tr
                        key={teacher.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-4 font-medium">
                          {teacher.first_name}{" "}
                          {teacher.last_name}
                        </td>

                        <td className="px-4 py-4">
                          {teacher.email || "—"}
                        </td>

                        <td className="px-4 py-4">
                          {teacher.phone || "—"}
                        </td>

                        <td className="px-4 py-4">
                          {teacher.specialty || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                            {teacher.status === "active"
                              ? "Actif"
                              : "Inactif"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}