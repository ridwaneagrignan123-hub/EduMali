"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AvertissementDirection } from "@/components/avertissement-direction"
import {
  FILIERES,
  FILIERE_LABELS,
  Filiere,
  cycleLabel,
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

/*
 * Titulaire d'une classe. Au premier cycle, un enseignant tient TOUTE la
 * classe : le rattacher matière par matière dirait la même chose N fois
 * et laisserait la classe sans titulaire dès qu'une matière manque.
 *
 * `filiere` ne sert qu'en école franco-arabe, où la classe a deux
 * titulaires — un français, un arabe. Ailleurs elle reste nulle.
 */
type HeadTeacher = {
  id: string
  class_id: string
  teacher_id: string
  filiere: string | null
}

type Subject = {
  id: string
  name: string
  code: string | null
  /* Programme dont relève la matière. Nul hors école franco-arabe. */
  filiere: string | null
}

type Teacher = {
  id: string
  first_name: string
  last_name: string
}

type ClassSubject = {
  id: string
  class_id: string
  subject_id: string
  teacher_id: string | null
  coefficient: number
  classes: {
    name: string
  } | null
  subjects: {
    name: string
    code: string | null
    filiere: string | null
  } | null
  teachers: {
    first_name: string
    last_name: string
  } | null
}

export default function ClassSubjectsPage() {
  const router = useRouter()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<ClassSubject[]>([])

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [schoolId, setSchoolId] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [coefficient, setCoefficient] = useState("1")

  const [headTeachers, setHeadTeachers] = useState<HeadTeacher[]>([])
  const [schoolType, setSchoolType] = useState("classique")
  const [savingHead, setSavingHead] = useState(false)
  const [headMessage, setHeadMessage] = useState<string | null>(null)
  const [headError, setHeadError] = useState<string | null>(null)

  const classeChoisie = classes.find((item) => item.id === classId) ?? null

  /*
   * Le cycle décide du mode. Un cycle non défini retombe sur le mode par
   * matière : c'est le fonctionnement actuel, et le seul qui ne
   * présuppose rien des classes créées avant la colonne.
   */
  const modeTitulaire = estModeTitulaire(classeChoisie?.cycle)
  const avecFiliere = hasFiliere(schoolType)

  /* Les filières à pourvoir : deux en franco-arabe, une seule sinon. */
  const filieresAPourvoir: (Filiere | null)[] = avecFiliere
    ? [...FILIERES]
    : [null]

  function titulairePour(filiere: Filiere | null) {
    return headTeachers.find(
      (head) => head.class_id === classId && head.filiere === filiere
    )
  }

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

    const [
      classesResult,
      subjectsResult,
      teachersResult,
      assignmentsResult,
      headsResult,
      schoolResult,
    ] = await Promise.all([
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
        .from("class_subjects")
        .select(`
          id,
          class_id,
          subject_id,
          teacher_id,
          coefficient,
          classes (
            name
          ),
          subjects (
            name,
            code,
            filiere
          ),
          teachers (
            first_name,
            last_name
          )
        `)
        .eq("school_id", profile.school_id)
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("class_head_teachers")
        .select("id, class_id, teacher_id, filiere")
        .eq("school_id", profile.school_id),

      supabase
        .from("schools")
        .select("school_type")
        .eq("id", profile.school_id)
        .maybeSingle(),
    ])

    const loadErrors: string[] = []

    if (classesResult.error) {
      console.error(
        "Erreur classes :",
        classesResult.error
      )
      loadErrors.push("les classes")
    }

    if (subjectsResult.error) {
      console.error(
        "Erreur matières :",
        subjectsResult.error
      )
      loadErrors.push("les matières")
    }

    if (teachersResult.error) {
      console.error(
        "Erreur enseignants :",
        teachersResult.error
      )
      loadErrors.push("les enseignants")
    }

    if (assignmentsResult.error) {
      console.error(
        "Erreur affectations :",
        assignmentsResult.error
      )
      loadErrors.push("les affectations")
    }

    if (loadErrors.length > 0) {
      setLoadError(
        `Impossible de charger ${loadErrors.join(", ")}. Réessayez.`
      )
    }

    if (headsResult.error) {
      console.error("Erreur titulaires :", headsResult.error)
      loadErrors.push("les titulaires")
    }

    setClasses(classesResult.data ?? [])
    setSubjects(subjectsResult.data ?? [])
    setTeachers(teachersResult.data ?? [])
    setHeadTeachers((headsResult.data as HeadTeacher[]) ?? [])
    setSchoolType(toSchoolType(schoolResult.data?.school_type))
    setAssignments(
      (assignmentsResult.data as unknown as ClassSubject[]) ?? []
    )

    setLoading(false)
  }

  async function createAssignment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!classId) {
      alert("Veuillez sélectionner une classe.")
      return
    }

    if (!subjectId) {
      alert("Veuillez sélectionner une matière.")
      return
    }

    const coefficientNumber = Number(coefficient)

    if (
      !coefficient ||
      Number.isNaN(coefficientNumber) ||
      coefficientNumber <= 0
    ) {
      alert("Le coefficient doit être supérieur à 0.")
      return
    }

    setCreating(true)

    const { error } = await supabase
      .from("class_subjects")
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
        teacher_id: teacherId || null,
        coefficient: coefficientNumber,
      })

    if (error) {
      console.error(
        "Erreur lors de l'affectation :",
        error
      )

      if (error.code === "23505") {
        alert(
          "Cette matière est déjà affectée à cette classe."
        )
      } else {
        alert(error.message)
      }

      setCreating(false)
      return
    }

    setClassId("")
    setSubjectId("")
    setTeacherId("")
    setCoefficient("1")

    await loadData()

    setCreating(false)
  }

  /*
   * Nomme — ou remplace — le titulaire d'une classe pour une filière.
   * Les deux index uniques partiels de class_head_teachers garantissent
   * un seul titulaire sans filière, et un seul par filière : on supprime
   * donc l'éventuel titulaire en place avant d'insérer, plutôt que de
   * laisser la contrainte refuser l'écriture.
   */
  async function nommerTitulaire(filiere: Filiere | null, valeur: string) {
    setSavingHead(true)
    setHeadError(null)
    setHeadMessage(null)

    const existant = titulairePour(filiere)

    if (existant) {
      const { error } = await supabase
        .from("class_head_teachers")
        .delete()
        .eq("id", existant.id)

      if (error) {
        console.error("Erreur retrait du titulaire :", error)
        setHeadError(error.message)
        setSavingHead(false)
        return
      }
    }

    // Chaîne vide : on retire le titulaire sans en nommer d'autre.
    if (valeur) {
      const { error } = await supabase.from("class_head_teachers").insert({
        school_id: schoolId,
        class_id: classId,
        teacher_id: valeur,
        filiere,
      })

      if (error) {
        console.error("Erreur nomination du titulaire :", error)
        setHeadError(error.message)
        setSavingHead(false)
        return
      }
    }

    await loadData()
    setSavingHead(false)
  }

  /*
   * Étend le titulaire à toutes les matières déjà déclarées pour la
   * classe — c'est le « sans ressaisie » : au premier cycle il les
   * enseigne toutes, les saisir une par une n'apprendrait rien.
   *
   * En franco-arabe, chaque titulaire ne prend que les matières de SA
   * filière : appliquer le titulaire arabe aux matières françaises
   * inverserait les programmes.
   */
  async function etendreATouteLaClasse(filiere: Filiere | null) {
    const titulaire = titulairePour(filiere)

    if (!titulaire) {
      setHeadError("Nommez d'abord le titulaire.")
      return
    }

    setSavingHead(true)
    setHeadError(null)
    setHeadMessage(null)

    const concernees = assignments.filter(
      (assignment) =>
        assignment.class_id === classId &&
        (filiere === null || assignment.subjects?.filiere === filiere)
    )

    if (concernees.length === 0) {
      setHeadError(
        filiere === null
          ? "Aucune matière n'est encore déclarée pour cette classe."
          : `Aucune matière de la filière ${FILIERE_LABELS[filiere]} n'est déclarée pour cette classe.`
      )
      setSavingHead(false)
      return
    }

    const { error } = await supabase
      .from("class_subjects")
      .update({ teacher_id: titulaire.teacher_id })
      .in(
        "id",
        concernees.map((assignment) => assignment.id)
      )

    if (error) {
      console.error("Erreur extension du titulaire :", error)
      setHeadError(error.message)
      setSavingHead(false)
      return
    }

    setHeadMessage(
      `Titulaire affecté à ${concernees.length} matière(s) de la classe.`
    )

    await loadData()
    setSavingHead(false)
  }

  async function deleteAssignment(id: string) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer cette affectation ?"
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("class_subjects")
      .delete()
      .eq("id", id)

    if (error) {
      console.error(
        "Erreur lors de la suppression :",
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
              Affectation des matières aux classes
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
        <AvertissementDirection compact />
        <div>
          <h2 className="text-3xl font-bold">
            Matières par classe
          </h2>

          <p className="mt-2 text-muted-foreground">
            Affectez les matières, les enseignants et les coefficients à chaque classe.
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
              Nouvelle affectation
            </h3>

            <form
              onSubmit={createAssignment}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="class">
                  Classe *
                </label>

                <select
                  id="class"
                  value={classId}
                  onChange={(event) =>
                    setClassId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une classe
                  </option>

                  {classes.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                      {item.level
                        ? ` — ${item.level}`
                        : ""}
                      {` (${cycleLabel(item.cycle)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="subject">
                  Matière *
                </label>

                <select
                  id="subject"
                  value={subjectId}
                  onChange={(event) =>
                    setSubjectId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une matière
                  </option>

                  {subjects.map((subject) => (
                    <option
                      key={subject.id}
                      value={subject.id}
                    >
                      {subject.name}
                      {subject.code
                        ? ` (${subject.code})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/*
                Au premier cycle, l'enseignant ne se choisit pas matière
                par matière : le titulaire les tient toutes. Le champ
                disparaît donc, et le panneau « Titulaire(s) » ci-dessous
                prend le relais.
              */}
              {!modeTitulaire && (
                <div className="space-y-2">
                  <label htmlFor="teacher">
                    Enseignant
                  </label>

                  <select
                    id="teacher"
                    value={teacherId}
                    onChange={(event) =>
                      setTeacherId(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">
                      Aucun enseignant
                    </option>

                    {teachers.map((teacher) => (
                      <option
                        key={teacher.id}
                        value={teacher.id}
                      >
                        {teacher.first_name}{" "}
                        {teacher.last_name}
                      </option>
                    ))}
                  </select>

                  <p className="text-xs text-muted-foreground">
                    {classeChoisie
                      ? `${cycleLabel(classeChoisie.cycle)} : un enseignant par matière.`
                      : "Un enseignant par matière."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="coefficient">
                  Coefficient *
                </label>

                <input
                  id="coefficient"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={coefficient}
                  onChange={(event) =>
                    setCoefficient(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Affecter la matière"}
              </button>
            </form>

            {/*
              PREMIER CYCLE : le titulaire se nomme au niveau de la
              classe, pas matière par matière. En franco-arabe, la classe
              en a deux — un français, un arabe — et chacun ne s'étend
              qu'aux matières de sa propre filière.
            */}
            {modeTitulaire && classeChoisie && (
              <div className="mt-8 space-y-4 rounded-lg border p-4">
                <div>
                  <h4 className="font-semibold">
                    {avecFiliere
                      ? "Titulaires de la classe"
                      : "Titulaire de la classe"}
                  </h4>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {cycleLabel(classeChoisie.cycle)} :{" "}
                    {avecFiliere
                      ? "un titulaire par filière, chacun tenant les matières de son programme."
                      : "un seul enseignant tient toutes les matières de la classe."}
                  </p>
                </div>

                {filieresAPourvoir.map((filiere) => {
                  const titulaire = titulairePour(filiere)
                  const champId = `titulaire-${filiere ?? "unique"}`

                  return (
                    <div key={filiere ?? "unique"} className="space-y-2">
                      <label htmlFor={champId}>
                        {filiere
                          ? `Titulaire ${FILIERE_LABELS[filiere]}`
                          : "Titulaire"}
                      </label>

                      <select
                        id={champId}
                        value={titulaire?.teacher_id ?? ""}
                        disabled={savingHead}
                        onChange={(event) =>
                          nommerTitulaire(filiere, event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-50"
                      >
                        <option value="">Aucun titulaire</option>

                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.first_name} {teacher.last_name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={savingHead || !titulaire}
                        onClick={() => etendreATouteLaClasse(filiere)}
                        className="w-full rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {filiere
                          ? `Affecter à toutes les matières du programme ${FILIERE_LABELS[filiere].toLowerCase()}`
                          : "Affecter à toutes les matières de la classe"}
                      </button>
                    </div>
                  )
                })}

                {headError && (
                  <p className="text-sm text-destructive">{headError}</p>
                )}

                {headMessage && (
                  <p className="text-sm text-muted-foreground">
                    {headMessage}
                  </p>
                )}
              </div>
            )}

            {classes.length === 0 && (
              <p className="mt-4 text-sm text-amber-600">
                Vous devez d'abord créer une classe.
              </p>
            )}

            {subjects.length === 0 && (
              <p className="mt-2 text-sm text-amber-600">
                Vous devez d'abord créer une matière.
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-background p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">
                  Affectations existantes
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {assignments.length} affectation(s)
                </p>
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des affectations...
              </p>
            ) : assignments.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune matière n'est encore affectée à une classe.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">
                        Classe
                      </th>

                      <th className="px-4 py-3">
                        Matière
                      </th>

                      <th className="px-4 py-3">
                        Enseignant
                      </th>

                      <th className="px-4 py-3">
                        Coefficient
                      </th>

                      <th className="px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {assignments.map((assignment) => (
                      <tr
                        key={assignment.id}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-4 font-medium">
                          {assignment.classes?.name ||
                            "—"}
                        </td>

                        <td className="px-4 py-4">
                          {assignment.subjects?.name ||
                            "—"}
                        </td>

                        <td className="px-4 py-4">
                          {assignment.teachers
                            ? `${assignment.teachers.first_name} ${assignment.teachers.last_name}`
                            : "Non affecté"}
                        </td>

                        <td className="px-4 py-4">
                          {assignment.coefficient}
                        </td>

                        <td className="px-4 py-4">
                          <button
                            onClick={() =>
                              deleteAssignment(
                                assignment.id
                              )
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