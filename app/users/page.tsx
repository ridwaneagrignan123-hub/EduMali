"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"
import { EditDialog } from "@/components/edit-dialog"
import { AccessLinkNotice } from "@/components/access-link-notice"

type UserAccount = {
  id: string
  firstName: string | null
  lastName: string | null
  role: string | null
  directionId: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  email: string | null
  lastSignInAt: string | null
  hasSignedIn: boolean
  isBanned: boolean
  isSelf: boolean
}

type Direction = {
  id: string
  name: string
}

const roleLabels: Record<string, string> = {
  admin: "Administrateur",
  teacher: "Enseignant",
  promoteur: "Promoteur",
  directeur_general: "Directeur général",
  directeur_direction: "Directeur de direction",
  comptable: "Comptable",
}

// Seul rôle dont le périmètre est limité à une direction.
const DIRECTION_SCOPED_ROLE = "directeur_direction"

/*
 * Informations personnelles modifiables. L'email n'en fait pas partie :
 * il identifie le compte côté Auth et le changer imposerait de reconfirmer
 * l'adresse.
 */
type IdentityForm = {
  firstName: string
  lastName: string
  phone: string
}

function toIdentityForm(user: UserAccount): IdentityForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
  }
}

function getFullName(user: UserAccount) {
  const fullName = `${user.lastName ?? ""} ${user.firstName ?? ""}`.trim()

  return fullName || "Nom non renseigné"
}

export default function UsersPage() {
  const router = useRouter()

  const [users, setUsers] = useState<UserAccount[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /*
   * Passer un compte en directeur de direction demande deux informations
   * à la fois : on met le changement en attente le temps de choisir la
   * direction, au lieu de l'appliquer dès la sélection du rôle.
   */
  const [pendingRoleByUserId, setPendingRoleByUserId] = useState<
    Record<string, string>
  >({})

  const [pendingDirectionByUserId, setPendingDirectionByUserId] = useState<
    Record<string, string>
  >({})

  const [searchTerm, setSearchTerm] = useState("")

  // Identifiant du compte en cours de modification, pour désactiver ses boutons.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  /* Lien d'accès du dernier compte relancé, à transmettre à la main. */
  const [accessNotice, setAccessNotice] = useState<{
    email: string
    emailAttempted: boolean
    accessLink: string | null
  } | null>(null)

  // Compte en cours de modification, null quand la boîte est fermée.
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null)
  const [editForm, setEditForm] = useState<IdentityForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      router.push("/login")
      return null
    }

    return session.access_token
  }

  async function loadUsers() {
    setLoading(true)
    setLoadError(null)

    const accessToken = await getAccessToken()

    if (!accessToken) {
      return
    }

    const response = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      setLoadError(
        result.error ?? "Impossible de charger la liste des comptes."
      )
      setUsers([])
      setLoading(false)
      return
    }

    setUsers((result.users as UserAccount[]) ?? [])

    // Lisible par tout membre de l'école : pas besoin de passer par l'API.
    const { data: directionsData, error: directionsError } = await supabase
      .from("directions")
      .select("id, name")
      .order("name")

    if (directionsError) {
      console.error("Erreur directions :", directionsError)
    } else {
      setDirections((directionsData as Direction[]) ?? [])
    }

    setLoading(false)
  }

  async function updateUser(
    userId: string,
    updates: { role?: string; isActive?: boolean; directionId?: string },
    successMessage: string
  ) {
    setActionError(null)
    setActionMessage(null)
    setPendingUserId(userId)

    const accessToken = await getAccessToken()

    if (!accessToken) {
      return
    }

    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(updates),
    })

    const result = await response.json()

    if (!response.ok) {
      setActionError(result.error ?? "L'opération a échoué.")
      setPendingUserId(null)
      return
    }

    setActionMessage(successMessage)
    setPendingUserId(null)

    setPendingRoleByUserId((current) => {
      const next = { ...current }
      delete next[userId]
      return next
    })

    setPendingDirectionByUserId((current) => {
      const next = { ...current }
      delete next[userId]
      return next
    })

    await loadUsers()
  }

  async function toggleActive(user: UserAccount) {
    const nextActive = !user.isActive

    const confirmed = window.confirm(
      nextActive
        ? `Réactiver le compte de ${getFullName(user)} ? La personne pourra de nouveau se connecter.`
        : `Désactiver le compte de ${getFullName(user)} ? Sa session sera révoquée et elle ne pourra plus se connecter.`
    )

    if (!confirmed) {
      return
    }

    await updateUser(
      user.id,
      { isActive: nextActive },
      nextActive
        ? `Le compte de ${getFullName(user)} a été réactivé.`
        : `Le compte de ${getFullName(user)} a été désactivé.`
    )
  }

  function selectRole(user: UserAccount, role: string) {
    setPendingRoleByUserId((current) => ({ ...current, [user.id]: role }))

    /*
     * Directeur de direction : on attend le choix de la direction.
     * Tout autre rôle s'applique immédiatement, comme avant.
     */
    if (role !== DIRECTION_SCOPED_ROLE) {
      applyRole(user, role, null)
    }
  }

  async function applyRole(
    user: UserAccount,
    role: string,
    directionId: string | null
  ) {
    if (role === user.role && directionId === user.directionId) {
      return
    }

    const directionName = directions.find(
      (item) => item.id === directionId
    )?.name

    const confirmed = window.confirm(
      directionId
        ? `Faire de ${getFullName(user)} le directeur de « ${directionName ?? "cette direction"} » ? Il ne verra plus que les classes de cette direction.`
        : `Changer le rôle de ${getFullName(user)} en « ${roleLabels[role] ?? role} » ?`
    )

    if (!confirmed) {
      setPendingRoleByUserId((current) => {
        const next = { ...current }
        delete next[user.id]
        return next
      })
      return
    }

    await updateUser(
      user.id,
      directionId ? { role, directionId } : { role },
      `Le rôle de ${getFullName(user)} a été mis à jour.`
    )
  }

  function startEditUser(user: UserAccount) {
    setEditError(null)
    setEditingUser(user)
    setEditForm(toIdentityForm(user))
  }

  function closeEditUser() {
    setEditingUser(null)
    setEditForm(null)
    setEditError(null)
  }

  /*
   * Enregistre l'identité d'un compte.
   *
   * Deux chemins, parce que la route serveur refuse volontairement d'agir sur
   * le compte de l'appelant : pour les autres, elle applique la modification
   * en service role ; pour soi-même, la policy « Users can update their own
   * profile » suffit et évite d'affaiblir cette protection.
   */
  async function saveUserIdentity() {
    if (!editingUser || !editForm) {
      return
    }

    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError("Le prénom et le nom sont obligatoires.")
      return
    }

    setSavingEdit(true)
    setEditError(null)

    if (editingUser.isSelf) {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editForm.firstName.trim(),
          last_name: editForm.lastName.trim(),
          phone: editForm.phone.trim() || null,
        })
        .eq("id", editingUser.id)

      if (error) {
        console.error("Erreur mise à jour de son propre profil :", error)

        setEditError(
          error.message || "Impossible d'enregistrer vos informations."
        )

        setSavingEdit(false)
        return
      }
    } else {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        return
      }

      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          phone: editForm.phone.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setEditError(result.error ?? "L'enregistrement a échoué.")
        setSavingEdit(false)
        return
      }
    }

    setActionError(null)
    setActionMessage("Les informations du compte ont été mises à jour.")
    setSavingEdit(false)
    closeEditUser()

    await loadUsers()
  }

  async function resendInvitation(user: UserAccount) {
    setActionError(null)
    setActionMessage(null)
    setPendingUserId(user.id)

    const accessToken = await getAccessToken()

    if (!accessToken) {
      return
    }

    const response = await fetch(`/api/users/${user.id}/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      setActionError(result.error ?? "Impossible d'envoyer le lien d'accès.")
      setPendingUserId(null)
      return
    }

    /*
     * On n'affirme plus que le message est parti : la messagerie intégrée
     * de Supabase ne dessert que les membres de l'organisation. Le lien
     * affiché, lui, fonctionne dans tous les cas.
     */
    setAccessNotice({
      email: result.email ?? user.email,
      emailAttempted: result.emailAttempted !== false,
      accessLink: result.accessLink ?? null,
    })

    setPendingUserId(null)
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        matchesSearch(
          searchTerm,
          user.firstName,
          user.lastName,
          user.email
        )
      ),
    [users, searchTerm]
  )

  const activeCount = users.filter((user) => user.isActive).length

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">
              Comptes utilisateurs
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push("/settings")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Paramètres
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Retour au dashboard
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">Comptes utilisateurs</h2>

          <p className="mt-2 text-muted-foreground">
            Gérez les accès des membres de votre établissement. Réservé aux
            administrateurs.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {!loadError && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Comptes de l'école</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? `${filteredUsers.length} compte(s) sur ${users.length}`
                    : `${users.length} compte(s), dont ${activeCount} actif(s)`}
                </p>
              </div>

              <div className="w-full sm:w-72">
                <label htmlFor="user-search" className="sr-only">
                  Rechercher un compte
                </label>

                <input
                  id="user-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Rechercher un nom ou un email..."
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>
            </div>

            {actionError && (
              <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {actionError}
              </div>
            )}

            {actionMessage && (
              <div
                className="mt-6 rounded-lg border p-4 text-sm"
                style={{
                  background: "oklch(0.55 0.13 155 / 0.1)",
                  borderColor: "oklch(0.55 0.13 155 / 0.4)",
                }}
              >
                {actionMessage}
              </div>
            )}

            {accessNotice && (
              <div className="mt-6">
                <AccessLinkNotice
                  email={accessNotice.email}
                  emailAttempted={accessNotice.emailAttempted}
                  accessLink={accessNotice.accessLink}
                  onClose={() => setAccessNotice(null)}
                />
              </div>
            )}

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des comptes...
              </p>
            ) : users.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun compte rattaché à votre établissement.
              </p>
            ) : filteredUsers.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun compte ne correspond à « {searchTerm.trim()} ».
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                {filteredUsers.map((user) => {
                  const isPending = pendingUserId === user.id

                  const selectedRole =
                    pendingRoleByUserId[user.id] ?? user.role ?? ""

                  const needsDirection =
                    selectedRole === DIRECTION_SCOPED_ROLE

                  const chosenDirectionId =
                    pendingDirectionByUserId[user.id] ??
                    user.directionId ??
                    ""

                  const currentDirectionName = directions.find(
                    (item) => item.id === user.directionId
                  )?.name

                  return (
                    <div
                      key={user.id}
                      className="rounded-lg border p-5"
                      style={
                        user.isActive
                          ? undefined
                          : { background: "oklch(0.94 0.01 80 / 0.5)" }
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-heading text-lg font-bold">
                              {getFullName(user)}
                            </p>

                            {user.isSelf && (
                              <span className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
                                Vous
                              </span>
                            )}

                            <span
                              className="rounded-full border px-3 py-1 text-xs font-semibold"
                              style={{
                                color: user.isActive
                                  ? "oklch(0.55 0.13 155)"
                                  : "oklch(0.577 0.245 27.325)",
                                borderColor: user.isActive
                                  ? "oklch(0.55 0.13 155)"
                                  : "oklch(0.577 0.245 27.325)",
                              }}
                            >
                              {user.isActive ? "Actif" : "Désactivé"}
                            </span>

                            {!user.hasSignedIn && (
                              <span
                                className="rounded-full border px-3 py-1 text-xs font-semibold"
                                style={{
                                  color: "oklch(0.57 0.14 78)",
                                  borderColor: "oklch(0.57 0.14 78)",
                                }}
                              >
                                Jamais connecté
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {user.email ?? "Email inconnu"}
                            {user.phone ? ` — ${user.phone}` : ""}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {user.lastSignInAt
                              ? `Dernière connexion : ${new Date(
                                  user.lastSignInAt
                                ).toLocaleDateString("fr-FR")}`
                              : "Ne s'est jamais connecté"}
                          </p>

                          {user.role === DIRECTION_SCOPED_ROLE && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {currentDirectionName
                                ? `Périmètre : ${currentDirectionName}`
                                : "Aucune direction affectée — ce compte ne voit aucune donnée."}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="space-y-1">
                            <label
                              htmlFor={`role-${user.id}`}
                              className="block text-xs text-muted-foreground"
                            >
                              Rôle
                            </label>

                            <select
                              id={`role-${user.id}`}
                              value={selectedRole}
                              onChange={(event) =>
                                selectRole(user, event.target.value)
                              }
                              disabled={user.isSelf || isPending}
                              className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {!user.role && (
                                <option value="">Non défini</option>
                              )}

                              {Object.entries(roleLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          {needsDirection && !user.isSelf && (
                            <div className="space-y-1">
                              <label
                                htmlFor={`direction-${user.id}`}
                                className="block text-xs text-muted-foreground"
                              >
                                Direction
                              </label>

                              <div className="flex items-center gap-2">
                                <select
                                  id={`direction-${user.id}`}
                                  value={chosenDirectionId}
                                  onChange={(event) =>
                                    setPendingDirectionByUserId((current) => ({
                                      ...current,
                                      [user.id]: event.target.value,
                                    }))
                                  }
                                  disabled={isPending}
                                  className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="">Choisir...</option>

                                  {directions.map((direction) => (
                                    <option
                                      key={direction.id}
                                      value={direction.id}
                                    >
                                      {direction.name}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  onClick={() =>
                                    applyRole(
                                      user,
                                      DIRECTION_SCOPED_ROLE,
                                      chosenDirectionId
                                    )
                                  }
                                  disabled={isPending || !chosenDirectionId}
                                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Valider
                                </button>
                              </div>

                              {directions.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Aucune direction n'existe encore.{" "}
                                  <button
                                    onClick={() => router.push("/directions")}
                                    className="font-medium text-primary underline"
                                  >
                                    En créer une
                                  </button>
                                </p>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => startEditUser(user)}
                            disabled={isPending}
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Modifier
                          </button>

                          <button
                            onClick={() => resendInvitation(user)}
                            disabled={
                              user.isSelf || isPending || !user.isActive
                            }
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Renvoyer un lien d'accès
                          </button>

                          <button
                            onClick={() => toggleActive(user)}
                            disabled={user.isSelf || isPending}
                            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            style={
                              user.isActive
                                ? { color: "oklch(0.577 0.245 27.325)" }
                                : undefined
                            }
                          >
                            {isPending
                              ? "..."
                              : user.isActive
                                ? "Désactiver"
                                : "Réactiver"}
                          </button>
                        </div>
                      </div>

                      {user.isSelf && (
                        <p className="mt-4 text-xs text-muted-foreground">
                          Vous ne pouvez pas modifier votre propre rôle ni
                          désactiver votre propre compte. Demandez à un autre
                          administrateur.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {editingUser && editForm && (
        <EditDialog
          title="Modifier le compte"
          description={getFullName(editingUser)}
          error={editError}
          saving={savingEdit}
          onSubmit={saveUserIdentity}
          onClose={closeEditUser}
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
              value={editingUser.email ?? ""}
              readOnly
              disabled
              className="w-full rounded-md border bg-muted px-3 py-2 text-muted-foreground"
            />

            <p className="text-xs text-muted-foreground">
              L'email est l'identifiant de connexion : il ne se change pas
              depuis cette page.
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

          <p className="text-xs text-muted-foreground">
            Le rôle et l'accès se modifient depuis la fiche du compte, pas
            depuis cette boîte.
          </p>
        </EditDialog>
      )}
    </main>
  )
}
