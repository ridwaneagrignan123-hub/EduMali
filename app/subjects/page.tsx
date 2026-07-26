"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type Subject = {
  id: string
  name: string
  code: string | null
  description: string | null
}

export default function SubjectsPage() {
  const router = useRouter()

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [schoolId, setSchoolId] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")

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

    const { data: subjectsData, error: subjectsError } =
      await supabase
        .from("subjects")
        .select("id, name, code, description")
        .eq("school_id", profile.school_id)
        .order("name", { ascending: true })

    if (subjectsError) {
      console.error(
        "Erreur lors du chargement des matières :",
        subjectsError
      )
      setLoadError("Impossible de charger la liste des matières.")
    }

    setSubjects(subjectsData ?? [])
    setLoading(false)
  }

  async function createSubject(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!name.trim()) {
      alert("Le nom de la matière est obligatoire.")
      return
    }

    setCreating(true)

    const { error } = await supabase
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
      })

    if (error) {
      console.error(
        "Erreur lors de la création de la matière :",
        error
      )

      alert(error.message)
      setCreating(false)
      return
    }

    setName("")
    setCode("")
    setDescription("")

    await loadData()

    setCreating(false)
  }

  async function deleteSubject(id: string) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer cette matière ?"
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", id)

    if (error) {
      console.error(
        "Erreur lors de la suppression de la matière :",
        error
      )

      alert(error.message)
      return
    }

    await loadData()
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              Ridwane
            </h1>

            <p className="text-sm text-muted-foreground">
              Gestion des matières
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
            Matières
          </h2>

          <p className="mt-2 text-muted-foreground">
            Ajoutez et gérez les matières enseignées dans votre établissement.
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
              Ajouter une matière
            </h3>

            <form
              onSubmit={createSubject}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="name">
                  Nom de la matière *
                </label>

                <input
                  id="name"
                  type="text"
                  placeholder="Ex : Mathématiques"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="code">
                  Code
                </label>

                <input
                  id="code"
                  type="text"
                  placeholder="Ex : MATH"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="description">
                  Description
                </label>

                <textarea
                  id="description"
                  placeholder="Description facultative"
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Ajouter la matière"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Liste des matières
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {subjects.length} matière(s)
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des matières...
              </p>
            ) : subjects.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune matière enregistrée pour le moment.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">
                        Matière
                      </th>

                      <th className="px-4 py-3">
                        Code
                      </th>

                      <th className="px-4 py-3">
                        Description
                      </th>

                      <th className="px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {subjects.map((subject) => (
                      <tr
                        key={subject.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-4 font-medium">
                          {subject.name}
                        </td>

                        <td className="px-4 py-4">
                          {subject.code || "—"}
                        </td>

                        <td className="px-4 py-4">
                          {subject.description || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <button
                            onClick={() =>
                              deleteSubject(subject.id)
                            }
                            className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Supprimer
                          </button>
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