"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AvertissementDirection } from "@/components/avertissement-direction"
import { DevoirsMaison } from "@/components/devoirs-maison"
import { EmploiDuTemps } from "@/components/emploi-du-temps"
import {
  CYCLES,
  CYCLE_HINTS,
  CYCLE_LABELS,
  cycleLabel,
} from "@/src/lib/etablissement"
import { can } from "@/src/lib/roles"

type ClassItem = {
  id: string
  name: string
  level: string | null
  cycle: string | null
  /*
   * « enseignant » ou « directeur ». Le reglage DEPLACE le droit de
   * saisie, il ne l'ajoute pas : si la classe dit « directeur »,
   * l'enseignant affecte ne peut plus noter. private.peut_noter_classe()
   * fait foi en base.
   */
  notes_saisies_par: string
}

export default function ClassesPage() {
  const router = useRouter()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  /*
   * Le school_id sert au chemin de la photo dans le bucket. Il est déjà
   * lu ici pour charger les classes ; on le garde plutôt que de le
   * relire depuis le composant des devoirs.
   */
  const [schoolId, setSchoolId] = useState<string | null>(null)

  // La classe dont on ouvre les devoirs — une seule à la fois.
  const [classeOuverte, setClasseOuverte] = useState<ClassItem | null>(null)

  const [name, setName] = useState("")
  const [level, setLevel] = useState("")
  const [cycle, setCycle] = useState("")

  /* Role de la personne connectee : seul le directeur regle « qui note ». */
  const [role, setRole] = useState("")

  /*
   * Le cycle que porte la direction de la personne connectée.
   *
   * Non nul : la question ne se pose plus. Un directeur nommé sur le
   * premier cycle n'a pas à redire lequel, et surtout il ne doit pas
   * pouvoir répondre autre chose — le déclencheur en base impose de
   * toute façon le cycle de la direction. L'écran cesse simplement de
   * poser une question dont la réponse est déjà écrite.
   */
  const [cycleImpose, setCycleImpose] = useState<string | null>(null)
  const [reglageEnCours, setReglageEnCours] = useState<string | null>(null)
  const peutGerer = can(role, "classes.gerer")

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
      .select("school_id, role, direction_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)
    setRole(profile.role ?? "")

    /*
     * On ne lit la direction que pour le directeur cloisonné : c'est le
     * seul dont le cycle est décidé d'avance. Le directeur général crée
     * des classes de tous les cycles et garde donc le choix.
     */
    if (profile.role === "directeur_direction" && profile.direction_id) {
      const { data: direction } = await supabase
        .from("directions")
        .select("cycle")
        .eq("id", profile.direction_id)
        .maybeSingle()

      setCycleImpose(direction?.cycle ?? null)

      // Le formulaire part directement sur la bonne valeur.
      if (direction?.cycle) {
        setCycle(direction.cycle)
      }
    } else {
      setCycleImpose(null)
    }

    const { data, error } = await supabase
      .from("classes")
      .select("id, name, level, cycle, notes_saisies_par")
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

  /*
   * « Qui note » se règle classe par classe, et non école par école :
   * une même école fait souvent les deux — saisie directe au second
   * cycle, recopie par la direction au premier, où l'enseignant rend
   * une feuille.
   */
  async function reglerQuiNote(classItem: ClassItem, valeur: string) {
    setReglageEnCours(classItem.id)

    const { error } = await supabase
      .from("classes")
      .update({ notes_saisies_par: valeur })
      .eq("id", classItem.id)

    setReglageEnCours(null)

    if (error) {
      console.error("Erreur réglage « qui note » :", error)
      alert(error.message)
      return
    }

    setClasses((liste) =>
      liste.map((item) =>
        item.id === classItem.id
          ? { ...item, notes_saisies_par: valeur }
          : item
      )
    )
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

      /*
       * Le refus RLS parle de « row-level security policy » : exact, et
       * illisible pour un directeur devant sa classe vide. Le seul cas
       * qui l'atteint encore ici est celui du directeur de direction à
       * qui aucune direction n'a été rattachée — le déclencheur
       * classes_rattachement_direction couvre tous les autres. On le
       * nomme donc, avec le geste qui le corrige.
       */
      alert(
        error.code === "42501"
          ? "La création a été refusée. Si vous êtes directeur de direction, c'est probablement qu'aucune direction ne vous est encore rattachée : demandez à un directeur général de le faire depuis Comptes utilisateurs."
          : error.message
      )

      setCreating(false)
      return
    }

    setName("")
    setLevel("")
    // Le cycle imposé reste posé : la classe suivante l'aura aussi.
    setCycle(cycleImpose ?? "")

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
          {/*
            Le comptable LIT les classes — il en a besoin pour rattacher
            un frais — mais ne les cree pas : elles appartiennent au
            directeur de leur direction.
          */}
          {peutGerer && (
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
              {cycleImpose ? (
                /*
                  Le cycle vient de la direction : on l'affiche, on ne le
                  demande pas. Laisser le menu ouvert reviendrait à
                  proposer un choix que la base refuserait de suivre — la
                  pire des interfaces, celle qui accepte puis corrige en
                  silence.
                */
                <div className="space-y-2">
                  <label>Cycle</label>

                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {CYCLE_LABELS[cycleImpose as keyof typeof CYCLE_LABELS] ??
                      cycleImpose}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Celui de votre direction. Vos classes en héritent
                    toutes —{" "}
                    {CYCLE_HINTS[cycleImpose as keyof typeof CYCLE_HINTS]}
                  </p>
                </div>
              ) : (
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
              )}

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
          )}

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
                    className="flex items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-semibold">
                        {classItem.name}
                      </p>

                      {/*
                        Le cycle disparaît de la ligne quand il est
                        imposé par la direction : il est alors le même
                        pour toutes les classes de l'écran, et déjà dit
                        une fois au-dessus. Le directeur général, lui, en
                        mélange plusieurs — il a besoin de le lire ici.
                      */}
                      <p className="text-sm text-muted-foreground">
                        {classItem.level || "Niveau non défini"}
                        {cycleImpose ? "" : ` — ${cycleLabel(classItem.cycle)}`}
                      </p>

                      {/*
                        Le réglage n'apparaît qu'au directeur, seul à
                        pouvoir le poser. Pour les autres, la phrase
                        indique simplement qui saisit — utile à
                        l'enseignant qui se demande pourquoi la page
                        Notes lui est fermée.
                      */}
                      {peutGerer ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`qui-note-${classItem.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Les notes sont saisies par
                          </label>

                          <select
                            id={`qui-note-${classItem.id}`}
                            value={classItem.notes_saisies_par}
                            onChange={(event) =>
                              reglerQuiNote(classItem, event.target.value)
                            }
                            disabled={reglageEnCours === classItem.id}
                            className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-60"
                          >
                            <option value="enseignant">l&apos;enseignant</option>
                            <option value="directeur">le directeur</option>
                          </select>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Notes saisies par{" "}
                          {classItem.notes_saisies_par === "directeur"
                            ? "le directeur"
                            : "l'enseignant"}
                        </p>
                      )}
                    </div>

                    {peutGerer && (
                    <button
                      type="button"
                      onClick={() =>
                        setClasseOuverte((ouverte) =>
                          ouverte?.id === classItem.id ? null : classItem
                        )
                      }
                      className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {classeOuverte?.id === classItem.id
                        ? "Fermer"
                        : "Emploi du temps et devoirs"}
                    </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/*
          La zone des devoirs occupe toute la largeur, sous les deux
          colonnes : le formulaire et la liste des devoirs récents n'ont
          pas de place dans la colonne étroite des classes.

          `key` sur la classe : passer d'une classe à l'autre doit
          repartir d'un formulaire vide, pas garder la page et les
          exercices de la classe précédente.
        */}
        {classeOuverte && schoolId && (
          <>
            <EmploiDuTemps
              key={`edt-${classeOuverte.id}`}
              schoolId={schoolId}
              classId={classeOuverte.id}
              className={classeOuverte.name}
              peutEcrire={peutGerer}
            />

            <DevoirsMaison
              key={classeOuverte.id}
              schoolId={schoolId}
              classId={classeOuverte.id}
              className={classeOuverte.name}
            />
          </>
        )}
      </section>
    </main>
  )
}