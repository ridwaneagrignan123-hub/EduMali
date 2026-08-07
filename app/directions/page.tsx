"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import {
  CYCLES,
  CYCLE_LABELS,
  FILIERES,
  FILIERE_LABELS,
  cycleLabel,
  hasFiliere,
  toSchoolType,
} from "@/src/lib/etablissement"
import { can } from "@/src/lib/roles"

/* Directeur de direction, avec sa filière en école franco-arabe. */
type Directeur = {
  id: string
  first_name: string | null
  last_name: string | null
  direction_id: string | null
  filiere: string | null
}

type Direction = {
  id: string
  name: string
  /*
   * Le cycle auquel la direction appartient. Un MEME cycle peut avoir
   * plusieurs directions — d'ou une colonne de rattachement et non une
   * table de correspondance.
   */
  cycle: string | null
  created_at: string
}

type ClassItem = {
  id: string
  name: string
  level: string | null
  direction_id: string | null
  /*
   * Le cycle de la CLASSE, à ne pas confondre avec celui de la
   * direction. Les deux doivent finir par coïncider — la base le refuse
   * autrement — mais ils ne coïncident pas d'avance : c'est justement ce
   * que le rattachement doit résoudre, et donc montrer.
   */
  cycle: string | null
}

/*
 * Rôles autorisés à organiser l'établissement en directions.
 *
 * Le promoteur les CONSULTE ; seul le directeur général les crée et les
 * modifie — l'écran s'appuie sur `isAllowed` pour la lecture et sur la
 * permission `structure.ecole` pour les boutons d'écriture.
 */
const ALLOWED_ROLES = ["promoteur", "directeur_general"]

export default function DirectionsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [schoolId, setSchoolId] = useState("")
  const [role, setRole] = useState("")

  const [directions, setDirections] = useState<Direction[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [directeurs, setDirecteurs] = useState<Directeur[]>([])

  const [schoolType, setSchoolType] = useState("classique")
  const avecFiliere = hasFiliere(schoolType)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newCycle, setNewCycle] = useState("")
  const [creating, setCreating] = useState(false)

  const [pendingClassId, setPendingClassId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isAllowed = ALLOWED_ROLES.includes(role)

  /*
   * Le promoteur LIT cette page, il ne l'ecrit pas : les directions font
   * partie de la structure commune, tenue par le directeur general. Sans
   * ce garde, l'ecran lui proposerait des boutons que le RLS refuse.
   */
  const peutEcrire = can(role, "structure.ecole")

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

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)
    setRole(profile.role ?? "")

    if (!ALLOWED_ROLES.includes(profile.role ?? "")) {
      setLoading(false)
      return
    }

    await loadDirectionsAndClasses(profile.school_id)
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
      await loadData()
    }

    lancer()
  }, [])

  async function loadDirectionsAndClasses(currentSchoolId: string) {
    const [directionsResult, classesResult, schoolResult, directeursResult] =
      await Promise.all([
      supabase
        .from("directions")
        .select("id, name, cycle, created_at")
        .eq("school_id", currentSchoolId)
        .order("name"),

      supabase
        .from("classes")
        .select("id, name, level, direction_id, cycle")
        .eq("school_id", currentSchoolId)
        .order("name"),

      supabase
        .from("schools")
        .select("school_type")
        .eq("id", currentSchoolId)
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("id, first_name, last_name, direction_id, filiere")
        .eq("school_id", currentSchoolId)
        .eq("role", "directeur_direction"),
    ])

    setSchoolType(toSchoolType(schoolResult.data?.school_type))

    if (directeursResult.error) {
      console.error("Erreur directeurs :", directeursResult.error)
    } else {
      setDirecteurs((directeursResult.data as Directeur[]) ?? [])
    }

    if (directionsResult.error) {
      console.error("Erreur directions :", directionsResult.error)
      setLoadError("Impossible de charger la liste des directions.")
    } else {
      setDirections((directionsResult.data as Direction[]) ?? [])
    }

    if (classesResult.error) {
      console.error("Erreur classes :", classesResult.error)
      setLoadError("Impossible de charger la liste des classes.")
    } else {
      setClasses((classesResult.data as ClassItem[]) ?? [])
    }
  }

  async function createDirection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setActionError(null)
    setActionMessage(null)

    if (!newName.trim()) {
      setActionError("Donnez un nom à la direction.")
      return
    }

    setCreating(true)

    const { error } = await supabase.from("directions").insert({
      school_id: schoolId,
      name: newName.trim(),
      cycle: newCycle || null,
    })

    if (error) {
      console.error("Erreur création direction :", error)

      setActionError(
        error.code === "23505"
          ? `Une direction nommée « ${newName.trim()} » existe déjà.`
          : "Impossible de créer cette direction. Vérifiez vos droits."
      )

      setCreating(false)
      return
    }

    setNewName("")
    setNewCycle("")
    await loadDirectionsAndClasses(schoolId)

    setActionMessage("Direction créée.")
    setCreating(false)
  }

  async function deleteDirection(direction: Direction) {
    const attached = classes.filter(
      (item) => item.direction_id === direction.id
    )

    const confirmed = window.confirm(
      attached.length > 0
        ? `Supprimer « ${direction.name} » ? Les ${attached.length} classe(s) rattachée(s) ne seront pas supprimées, mais redeviendront non rattachées — et donc invisibles pour un directeur de direction.`
        : `Supprimer la direction « ${direction.name} » ?`
    )

    if (!confirmed) {
      return
    }

    setActionError(null)
    setActionMessage(null)
    setDeletingId(direction.id)

    const { error } = await supabase
      .from("directions")
      .delete()
      .eq("id", direction.id)
      .eq("school_id", schoolId)

    if (error) {
      console.error("Erreur suppression direction :", error)
      setActionError(
        "Impossible de supprimer cette direction. Vérifiez vos droits."
      )
      setDeletingId(null)
      return
    }

    await loadDirectionsAndClasses(schoolId)

    setActionMessage(`Direction « ${direction.name} » supprimée.`)
    setDeletingId(null)
  }

  async function assignClass(classItem: ClassItem, directionId: string) {
    setActionError(null)
    setActionMessage(null)

    const direction = directions.find((item) => item.id === directionId)
    const cycleDirection = direction?.cycle ?? null

    /*
     * LE CAS QUI PASSAIT AUTREFOIS SANS RIEN DIRE.
     *
     * Rattacher une classe de lycée à une direction du premier cycle
     * était accepté en silence. Le cycle décide pourtant du mode de
     * saisie des présences — à la journée d'un côté, leçon par leçon de
     * l'autre : la classe se serait mise à marcher de travers des
     * semaines plus tard, sans que rien ne rappelle ce clic.
     *
     * La base refuse désormais la contradiction. On propose donc
     * l'alignement AVANT d'écrire, en disant ce qu'il coûte, et on
     * n'envoie le nouveau cycle qu'après un oui franc.
     */
    let cycleAAligner: string | null = null

    if (
      cycleDirection &&
      classItem.cycle &&
      classItem.cycle !== cycleDirection
    ) {
      const accepte = window.confirm(
        `« ${classItem.name} » est en ${cycleLabel(classItem.cycle)}, mais « ${direction?.name}` +
          ` » est une direction de ${cycleLabel(cycleDirection)}.\n\n` +
          `La rattacher fera passer la classe en ${cycleLabel(cycleDirection)}.` +
          ` Cela change la façon dont ses présences se saisissent, et les relevés` +
          ` déjà pris sous l'ancien cycle ne seront plus lus de la même manière.\n\n` +
          `Continuer ?`
      )

      if (!accepte) {
        return
      }

      cycleAAligner = cycleDirection
    }

    setPendingClassId(classItem.id)

    const { error } = await supabase
      .from("classes")
      .update({
        direction_id: directionId || null,
        /*
         * Le cycle ne part QUE s'il a été confirmé. Un rattachement
         * ordinaire ne doit pas réécrire une colonne qu'on n'a pas
         * touchée.
         */
        ...(cycleAAligner ? { cycle: cycleAAligner } : {}),
      })
      .eq("id", classItem.id)
      .eq("school_id", schoolId)

    if (error) {
      console.error("Erreur rattachement de classe :", error)

      /*
       * P0001 est le code d'un RAISE de notre propre déclencheur : son
       * message est écrit pour être lu par un directeur, pas par un
       * développeur. Le remplacer par « vérifiez vos droits » serait le
       * jeter au moment où il sert.
       */
      setActionError(
        error.code === "P0001"
          ? error.message
          : "Impossible de rattacher cette classe. Vérifiez vos droits."
      )

      setPendingClassId(null)
      return
    }

    await loadDirectionsAndClasses(schoolId)

    const directionName = directions.find(
      (item) => item.id === directionId
    )?.name

    setActionMessage(
      directionId
        ? `${classItem.name} rattachée à « ${directionName ?? "la direction"} ».`
        : `${classItem.name} n'est plus rattachée à aucune direction.`
    )

    setPendingClassId(null)
  }

  const unassignedClasses = useMemo(
    () => classes.filter((item) => item.direction_id === null),
    [classes]
  )

  /*
   * `cycleDuBloc` est le cycle de la direction sous laquelle la ligne est
   * rendue, et vaut null dans la liste des classes non rattachées.
   *
   * Il sert à NE PAS répéter : sous « Direction arabe A — Premier
   * cycle », réécrire « Premier cycle » sur chacune de ses classes
   * n'apprend rien. Le cycle ne s'affiche donc que là où il apporte
   * quelque chose — dans la liste des non rattachées, où il décide de ce
   * qui sera possible, et sur la classe qui contredit sa direction, où
   * il est exactement l'information à voir.
   */
  function renderClassRow(classItem: ClassItem, cycleDuBloc: string | null) {
    return (
      <div
        key={classItem.id}
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
      >
        <div>
          <p className="font-medium">{classItem.name}</p>

          <p className="text-xs text-muted-foreground">
            {[
              classItem.level,
              classItem.cycle && classItem.cycle !== cycleDuBloc
                ? cycleLabel(classItem.cycle)
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Niveau non défini"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`direction-${classItem.id}`} className="sr-only">
            Direction de {classItem.name}
          </label>

          <select
            id={`direction-${classItem.id}`}
            value={classItem.direction_id ?? ""}
            onChange={(event) => assignClass(classItem, event.target.value)}
            disabled={!peutEcrire || pendingClassId === classItem.id}
            className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">Non rattachée</option>

            {directions.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement des directions...</p>
      </main>
    )
  }

  if (!isAllowed) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-background p-6 text-center">
          <h1 className="font-heading text-xl font-bold">Accès réservé</h1>

          <p className="mt-3 text-muted-foreground">
            Seuls le promoteur et la direction générale peuvent organiser
            l'établissement en directions.
          </p>

          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">Directions</p>
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
          <h2 className="text-3xl font-bold">Directions</h2>

          <p className="mt-2 text-muted-foreground">
            Organisez votre établissement en directions (primaire, secondaire,
            etc.) et rattachez chaque classe à la sienne.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {actionMessage && (
          <div
            className="rounded-lg border p-4 text-sm"
            style={{
              background: "oklch(0.55 0.13 155 / 0.1)",
              borderColor: "oklch(0.55 0.13 155 / 0.4)",
            }}
          >
            {actionMessage}
          </div>
        )}

        {peutEcrire && (
        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Créer une direction
          </h3>

          <form
            onSubmit={createDirection}
            className="mt-6 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 space-y-2" style={{ minWidth: "16rem" }}>
              <label htmlFor="direction-name">Nom de la direction *</label>

              <input
                id="direction-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Primaire A, Secondaire..."
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>

            <div className="space-y-2" style={{ minWidth: "14rem" }}>
              <label htmlFor="direction-cycle">Cycle</label>

              <select
                id="direction-cycle"
                value={newCycle}
                onChange={(event) => setNewCycle(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                <option value="">Non défini</option>

                {CYCLES.map((value) => (
                  <option key={value} value={value}>
                    {CYCLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-6 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Création..." : "Créer"}
            </button>
          </form>
        </div>
        )}

        {unassignedClasses.length > 0 && (
          <div
            className="rounded-xl border p-6"
            style={{
              background: "oklch(0.80 0.14 78 / 0.1)",
              borderColor: "oklch(0.57 0.14 78 / 0.4)",
            }}
          >
            <h3 className="font-heading text-xl font-bold">
              Classes non rattachées
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {unassignedClasses.length}
              </span>
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Ces classes restent visibles pour vous, mais un directeur de
              direction ne les verra pas tant qu'elles ne lui sont pas
              rattachées.
            </p>

            <div className="mt-6 space-y-3">
              {/*
                Aucune direction au-dessus : le cycle de chaque classe
                s'affiche, c'est lui qui dira où elle peut aller.
              */}
              {unassignedClasses.map((item) => renderClassRow(item, null))}
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Directions de l'établissement
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              {directions.length}
            </span>
          </h3>

          {directions.length === 0 ? (
            <p className="mt-6 text-muted-foreground">
              Aucune direction pour le moment. Créez-en une ci-dessus pour
              commencer à organiser vos classes.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {directions.map((direction) => {
                const attached = classes.filter(
                  (item) => item.direction_id === direction.id
                )

                return (
                  <div key={direction.id} className="rounded-lg border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                      <div>
                        <p className="font-heading text-lg font-bold">
                          {direction.name}
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {cycleLabel(direction.cycle)}
                          {" — "}
                          {attached.length} classe(s) rattachée(s)
                        </p>

                        {/*
                          ÉCOLE FRANCO-ARABE : la direction est tenue par
                          deux directeurs, un par filière. On montre ce
                          qui manque autant que ce qui est pourvu — une
                          filière sans directeur ne se voit nulle part
                          ailleurs.
                        */}
                        {avecFiliere && (
                          <div className="mt-2 space-y-1">
                            {FILIERES.map((valeur) => {
                              const titulaire = directeurs.find(
                                (compte) =>
                                  compte.direction_id === direction.id &&
                                  compte.filiere === valeur
                              )

                              return (
                                <p
                                  key={valeur}
                                  className="text-xs text-muted-foreground"
                                >
                                  Directeur {FILIERE_LABELS[valeur].toLowerCase()} :{" "}
                                  {titulaire
                                    ? `${titulaire.last_name ?? ""} ${titulaire.first_name ?? ""}`.trim() ||
                                      "nom non renseigné"
                                    : "non nommé"}
                                </p>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {peutEcrire && (
                      <button
                        onClick={() => deleteDirection(direction)}
                        disabled={deletingId === direction.id}
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ color: "oklch(0.577 0.245 27.325)" }}
                      >
                        {deletingId === direction.id
                          ? "Suppression..."
                          : "Supprimer"}
                      </button>
                      )}
                    </div>

                    {attached.length === 0 ? (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Aucune classe rattachée. Un directeur affecté à cette
                        direction ne verrait aucune donnée.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {attached.map((item) =>
                          renderClassRow(item, direction.cycle)
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
