"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AvertissementDirection } from "@/components/avertissement-direction"
import {
  CYCLES,
  CYCLE_HINTS,
  CYCLE_LABELS,
  cycleLabel,
} from "@/src/lib/etablissement"

type ClassItem = {
  id: string
  name: string
  level: string | null
  cycle: string | null
}

export default function ClassesPage() {
  const router = useRouter()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [level, setLevel] = useState("")
  const [cycle, setCycle] = useState("")

  useEffect(() => {
    loadClasses()
  }, [])

  async function loadClasses() {
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

    const { data, error } = await supabase
      .from("classes")
      .select("id, name, level, cycle")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erreur lors du chargement des classes :", error)
      setLoadError("Impossible de charger la liste des classes.")
      setLoading(false)
      return
    }

    setClasses(data ?? [])
    setLoading(false)
  }

  async function createClass(event: React.FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      alert("Veuillez saisir le nom de la classe.")
      return
    }

    setCreating(true)

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
      alert("Aucune école associée à votre compte.")
      setCreating(false)
      return
    }

    const { error } = await supabase.from("classes").insert({
      school_id: profile.school_id,
      name: name.trim(),
      level: level.trim() || null,
      cycle: cycle || null,
    })

    if (error) {
      console.error("Erreur lors de la création de la classe :", error)
      alert(error.message)
      setCreating(false)
      return
    }

    setName("")
    setLevel("")
    setCycle("")

    await loadClasses()

    setCreating(false)
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">
              Gestion des classes
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

      <section className="mx-auto max-w-6xl space-y-8 p-6">
        <AvertissementDirection compact />
        <div>
          <h2 className="text-3xl font-bold">
            Classes
          </h2>

          <p className="mt-2 text-muted-foreground">
            Créez et gérez les classes de votre établissement.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Ajouter une classe
            </h3>

            <form
              onSubmit={createClass}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="name">
                  Nom de la classe
                </label>

                <input
                  id="name"
                  type="text"
                  placeholder="Exemple : CM2 A"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="level">
                  Niveau
                </label>

                <input
                  id="level"
                  type="text"
                  placeholder="Exemple : CM2"
                  value={level}
                  onChange={(event) =>
                    setLevel(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              {/*
                Le cycle décide du mode d'affectation des enseignants :
                un titulaire pour toute la classe au premier cycle, un
                enseignant par matière au second cycle et au lycée. C'est
                pourquoi il ne se déduit pas du niveau, texte libre où
                « 6eme », « 6e » et « Sixième » coexistent.
              */}
              <div className="space-y-2">
                <label htmlFor="cycle">Cycle</label>

                <select
                  id="cycle"
                  value={cycle}
                  onChange={(event) => setCycle(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">Non défini</option>

                  {CYCLES.map((value) => (
                    <option key={value} value={value}>
                      {CYCLE_LABELS[value]}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-muted-foreground">
                  {cycle
                    ? CYCLE_HINTS[cycle as keyof typeof CYCLE_HINTS]
                    : "Sans cycle, la classe s'affecte matière par matière."}
                </p>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Création..."
                  : "Créer la classe"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Mes classes
            </h3>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des classes...
              </p>
            ) : classes.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune classe créée pour le moment.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {classes.map((classItem) => (
                  <div
                    key={classItem.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-semibold">
                        {classItem.name}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {classItem.level || "Niveau non défini"}
                        {" — "}
                        {cycleLabel(classItem.cycle)}
                      </p>
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