"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { normalizeSearchText } from "@/src/lib/search"
import { parseSpreadsheetDate } from "@/src/lib/excel"
import { EditDialog } from "@/components/edit-dialog"
import { AccessLinkNotice } from "@/components/access-link-notice"
import {
  ImportOutcome,
  ImportRow,
  ImportWizard,
  RawRow,
} from "@/components/import/import-wizard"

const TEACHER_IMPORT_FIELDS = [
  {
    key: "last_name",
    label: "Nom",
    required: true,
    aliases: ["nom enseignant", "nom du professeur"],
  },
  {
    key: "first_name",
    label: "Prénom",
    required: true,
    aliases: ["prenom", "prenom enseignant"],
  },
  {
    key: "email",
    label: "Email",
    required: true,
    hint: "L'invitation est envoyée à cette adresse.",
    aliases: ["adresse email", "courriel", "mail", "e-mail"],
  },
  { key: "phone", label: "Téléphone", aliases: ["tel", "contact", "numero"] },
  {
    key: "specialty",
    label: "Spécialité",
    aliases: ["matiere", "discipline", "specialite"],
  },
  {
    key: "hire_date",
    label: "Date d'embauche",
    hint: "Format AAAA-MM-JJ ou JJ/MM/AAAA.",
    aliases: ["embauche", "date embauche", "recrutement"],
  },
]

// Contrôle volontairement permissif : le serveur reste l'autorité.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

/*
 * Champs modifiables après l'enregistrement. L'email en est exclu : il sert
 * d'identifiant de connexion et vit dans le compte Auth, pas dans la fiche.
 */
type TeacherEditForm = {
  firstName: string
  lastName: string
  phone: string
  specialty: string
  hireDate: string
}

function toEditForm(teacher: Teacher): TeacherEditForm {
  return {
    firstName: teacher.first_name,
    lastName: teacher.last_name,
    phone: teacher.phone ?? "",
    specialty: teacher.specialty ?? "",
    hireDate: teacher.hire_date ?? "",
  }
}

export default function TeachersPage() {
  const router = useRouter()

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [schoolId, setSchoolId] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  /* Lien d'accès du dernier enseignant créé, à transmettre à la main. */
  const [accessNotice, setAccessNotice] = useState<{
    email: string
    emailAttempted: boolean
    accessLink: string | null
  } | null>(null)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [hireDate, setHireDate] = useState("")

  // Enseignant en cours de modification, null quand la boîte est fermée.
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [editForm, setEditForm] = useState<TeacherEditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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
      setLoadError("Impossible de charger la liste des enseignants.")
    }

    setTeachers(teachersData ?? [])
    setLoading(false)
  }

 async function createTeacher(
  event: FormEvent<HTMLFormElement>
) {
  event.preventDefault()

  if (
    !firstName.trim() ||
    !lastName.trim() ||
    !email.trim()
  ) {
    alert(
      "Le prénom, le nom et l'email sont obligatoires."
    )

    return
  }

  setCreating(true)

  try {
    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession()

    if (
      !session?.access_token
    ) {
      alert(
        "Votre session a expiré. Veuillez vous reconnecter."
      )

      router.push("/login")

      return
    }

    const response =
      await fetch(
        "/api/teachers/invite",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${session.access_token}`,
          },

          body: JSON.stringify({
            firstName:
              firstName.trim(),

            lastName:
              lastName.trim(),

            email:
              email.trim(),

            phone:
              phone.trim(),

            specialty:
              specialty.trim(),

            hireDate:
              hireDate ||
              null,
          }),
        }
      )

    const result =
      await response.json()

    if (
      !response.ok
    ) {
      alert(
        result.error ||
          "Impossible d'envoyer l'invitation."
      )

      return
    }

    /*
     * Pas d'alert « Invitation envoyée » : la messagerie intégrée de
     * Supabase ne dessert que les membres de l'organisation, si bien que
     * l'enseignant ne recevait rien pendant que l'écran annonçait un
     * succès. On montre le lien, qui lui fonctionne toujours.
     */
    setAccessNotice({
      email: result.email ?? email.trim().toLowerCase(),
      emailAttempted: result.emailAttempted !== false,
      accessLink: result.accessLink ?? null,
    })

    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setSpecialty("")
    setHireDate("")

    await loadData()
  } catch (error) {
    console.error(
      "Erreur invitation enseignant :",
      error
    )

    alert(
      "Une erreur est survenue lors de l'envoi de l'invitation."
    )
  } finally {
    setCreating(false)
  }
}

  function startEditTeacher(teacher: Teacher) {
    setEditError(null)
    setEditingTeacher(teacher)
    setEditForm(toEditForm(teacher))
  }

  function closeEditTeacher() {
    setEditingTeacher(null)
    setEditForm(null)
    setEditError(null)
  }

  /*
   * L'enregistrement passe par une route serveur : la fiche enseignant et le
   * profil du compte associé portent les mêmes nom, prénom et téléphone, et
   * seule la clé service role peut mettre à jour le profil d'un autre compte.
   */
  async function saveTeacherEdit() {
    if (!editingTeacher || !editForm) {
      return
    }

    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError("Le prénom et le nom sont obligatoires.")
      return
    }

    setSavingEdit(true)
    setEditError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setEditError("Votre session a expiré. Veuillez vous reconnecter.")
        setSavingEdit(false)
        return
      }

      const response = await fetch(`/api/teachers/${editingTeacher.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          phone: editForm.phone.trim(),
          specialty: editForm.specialty.trim(),
          hireDate: editForm.hireDate || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setEditError(result.error ?? "L'enregistrement a échoué.")
        setSavingEdit(false)
        return
      }

      const updated = result.teacher as Teacher

      setTeachers((current) =>
        current.map((teacher) =>
          teacher.id === updated.id ? updated : teacher
        )
      )

      closeEditTeacher()
    } catch (error) {
      console.error("Erreur modification enseignant :", error)

      setEditError(
        "Le serveur n'a pas répondu. Vérifiez la fiche avant de réessayer."
      )
    } finally {
      setSavingEdit(false)
    }
  }

  function validateTeacherRows(rawRows: RawRow[]): ImportRow[] {
    // Email normalisé -> première ligne du fichier où il apparaît.
    const seenEmails = new Map<string, number>()

    return rawRows.map((raw) => {
      const errors: string[] = []
      const warnings: string[] = []

      const lastName = raw.values.last_name?.trim() ?? ""
      const firstName = raw.values.first_name?.trim() ?? ""
      const email = raw.values.email?.trim().toLowerCase() ?? ""

      if (!lastName) {
        errors.push("Le nom est obligatoire.")
      }

      if (!firstName) {
        errors.push("Le prénom est obligatoire.")
      }

      if (!email) {
        errors.push("L'email est obligatoire : il sert à envoyer l'invitation.")
      } else if (!EMAIL_PATTERN.test(email)) {
        errors.push(`L'email « ${email} » n'est pas une adresse valide.`)
      } else {
        const firstSeen = seenEmails.get(email)

        if (firstSeen !== undefined) {
          errors.push(
            `Email déjà utilisé à la ligne ${firstSeen} du fichier : un compte ne peut être créé qu'une fois.`
          )
        } else {
          seenEmails.set(email, raw.lineNumber)
        }

        /*
         * Un email déjà rattaché à un enseignant de l'école échouerait
         * côté serveur : autant le dire tout de suite plutôt que de
         * consommer un appel d'invitation pour rien.
         */
        const existing = teachers.find(
          (teacher) =>
            teacher.email &&
            normalizeSearchText(teacher.email) === normalizeSearchText(email)
        )

        if (existing) {
          errors.push(
            `Un enseignant utilise déjà cet email (${existing.last_name} ${existing.first_name}).`
          )
        }
      }

      const hireDate = parseSpreadsheetDate(raw.values.hire_date ?? "")

      if (hireDate === undefined) {
        errors.push(
          `Date d'embauche « ${raw.values.hire_date} » non reconnue (AAAA-MM-JJ ou JJ/MM/AAAA).`
        )
      }

      // Homonyme sans email identique : probablement une autre personne.
      const sameName = teachers.some(
        (teacher) =>
          normalizeSearchText(`${teacher.last_name} ${teacher.first_name}`) ===
          normalizeSearchText(`${lastName} ${firstName}`)
      )

      if (sameName && lastName && firstName) {
        warnings.push(
          "Un enseignant du même nom existe déjà dans l'établissement."
        )
      }

      return {
        lineNumber: raw.lineNumber,
        values: raw.values,
        errors,
        warnings,
        ignored: false,
        confirmed: false,
        payload: {
          firstName,
          lastName,
          email,
          phone: raw.values.phone?.trim() ?? "",
          specialty: raw.values.specialty?.trim() ?? "",
          hireDate: hireDate || null,
        },
      }
    })
  }

  /*
   * Import strictement séquentiel.
   *
   * Chaque ligne passe par /api/teachers/invite, la même route que la
   * création manuelle : création du compte Auth, du profil et de la fiche
   * enseignant, puis envoi de l'invitation. On n'appelle jamais deux
   * invitations en parallèle — cela surchargerait l'API d'authentification
   * et rendrait impossible d'imputer un échec à une ligne précise.
   */
  async function importTeacherRows(
    rows: ImportRow[],
    onProgress: (done: number) => void
  ): Promise<ImportOutcome> {
    let imported = 0
    const failures: ImportOutcome["failures"] = []

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      return {
        imported: 0,
        failures: rows.map((row) => ({
          lineNumber: row.lineNumber,
          message: "Session expirée : reconnectez-vous et relancez l'import.",
        })),
      }
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const payload = row.payload as Record<string, unknown>

      try {
        const response = await fetch("/api/teachers/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        })

        const result = await response.json()

        if (!response.ok) {
          failures.push({
            lineNumber: row.lineNumber,
            message: result.error ?? "L'invitation a échoué.",
          })
        } else {
          imported++
        }
      } catch (error) {
        console.error("Erreur import enseignant :", error)

        failures.push({
          lineNumber: row.lineNumber,
          message:
            "Le serveur n'a pas répondu. Cet enseignant n'a probablement pas été créé — vérifiez avant de relancer.",
        })
      }

      onProgress(index + 1)
    }

    return { imported, failures }
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

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div>
          <button
            onClick={() => setShowImport((current) => !current)}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            {showImport ? "Masquer l'import Excel" : "Importer depuis Excel"}
          </button>
        </div>

        {showImport && (
          <ImportWizard
            title="Importer des enseignants"
            description="Chaque ligne crée un compte, une fiche enseignant et envoie une invitation par email. Les lignes sont traitées une par une."
            fields={TEACHER_IMPORT_FIELDS}
            validateRows={validateTeacherRows}
            importRows={importTeacherRows}
            onClose={() => setShowImport(false)}
            onImported={loadData}
          />
        )}

        {accessNotice && (
          <div className="mb-8">
            <AccessLinkNotice
              email={accessNotice.email}
              emailAttempted={accessNotice.emailAttempted}
              accessLink={accessNotice.accessLink}
              onClose={() => setAccessNotice(null)}
            />
          </div>
        )}

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

                      <th className="px-4 py-3 text-right">
                        Actions
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

                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => startEditTeacher(teacher)}
                            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                          >
                            Modifier
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

      {editingTeacher && editForm && (
        <EditDialog
          title="Modifier l'enseignant"
          description={`${editingTeacher.first_name} ${editingTeacher.last_name}`}
          error={editError}
          saving={savingEdit}
          onSubmit={saveTeacherEdit}
          onClose={closeEditTeacher}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="edit-firstName">Prénom *</label>

              <input
                id="edit-firstName"
                type="text"
                value={editForm.firstName}
                onChange={(event) =>
                  setEditForm({ ...editForm, firstName: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-lastName">Nom *</label>

              <input
                id="edit-lastName"
                type="text"
                value={editForm.lastName}
                onChange={(event) =>
                  setEditForm({ ...editForm, lastName: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-email">Email</label>

            <input
              id="edit-email"
              type="email"
              value={editingTeacher.email ?? ""}
              readOnly
              disabled
              className="w-full rounded-md border bg-muted px-3 py-2 text-muted-foreground"
            />

            <p className="text-xs text-muted-foreground">
              L'email est l'identifiant de connexion du compte : il ne se
              change pas depuis cette fiche.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-phone">Téléphone</label>

            <input
              id="edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={(event) =>
                setEditForm({ ...editForm, phone: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-specialty">Spécialité</label>

            <input
              id="edit-specialty"
              type="text"
              placeholder="Ex : Mathématiques"
              value={editForm.specialty}
              onChange={(event) =>
                setEditForm({ ...editForm, specialty: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-hireDate">Date d'embauche</label>

            <input
              id="edit-hireDate"
              type="date"
              value={editForm.hireDate}
              onChange={(event) =>
                setEditForm({ ...editForm, hireDate: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>
        </EditDialog>
      )}
    </main>
  )
}