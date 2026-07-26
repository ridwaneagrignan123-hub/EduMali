"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"

type UserAccount = {
  id: string
  firstName: string | null
  lastName: string | null
  role: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  email: string | null
  lastSignInAt: string | null
  hasSignedIn: boolean
  isBanned: boolean
  isSelf: boolean
}

const roleLabels: Record<string, string> = {
  admin: "Administrateur",
  teacher: "Enseignant",
}

function getFullName(user: UserAccount) {
  const fullName = `${user.lastName ?? ""} ${user.firstName ?? ""}`.trim()

  return fullName || "Nom non renseigné"
}

export default function UsersPage() {
  const router = useRouter()

  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")

  // Identifiant du compte en cours de modification, pour désactiver ses boutons.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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
    setLoading(false)
  }

  async function updateUser(
    userId: string,
    updates: { role?: string; isActive?: boolean },
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

  async function changeRole(user: UserAccount, role: string) {
    if (role === user.role) {
      return
    }

    const confirmed = window.confirm(
      `Changer le rôle de ${getFullName(user)} en « ${roleLabels[role] ?? role} » ?`
    )

    if (!confirmed) {
      return
    }

    await updateUser(
      user.id,
      { role },
      `Le rôle de ${getFullName(user)} a été mis à jour.`
    )
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

    setActionMessage(
      `Un lien d'accès a été envoyé à ${result.email ?? "l'adresse du compte"}.`
    )
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
                  background: "oklch(0.56 0.13 150 / 0.1)",
                  borderColor: "oklch(0.56 0.13 150 / 0.4)",
                }}
              >
                {actionMessage}
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
                                  ? "oklch(0.56 0.13 150)"
                                  : "oklch(0.577 0.245 27.325)",
                                borderColor: user.isActive
                                  ? "oklch(0.56 0.13 150)"
                                  : "oklch(0.577 0.245 27.325)",
                              }}
                            >
                              {user.isActive ? "Actif" : "Désactivé"}
                            </span>

                            {!user.hasSignedIn && (
                              <span
                                className="rounded-full border px-3 py-1 text-xs font-semibold"
                                style={{
                                  color: "oklch(0.6 0.14 85)",
                                  borderColor: "oklch(0.6 0.14 85)",
                                }}
                              >
                                Jamais connecté
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {user.email ?? "Email inconnu"}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {user.lastSignInAt
                              ? `Dernière connexion : ${new Date(
                                  user.lastSignInAt
                                ).toLocaleDateString("fr-FR")}`
                              : "Ne s'est jamais connecté"}
                          </p>
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
                              value={user.role ?? ""}
                              onChange={(event) =>
                                changeRole(user, event.target.value)
                              }
                              disabled={user.isSelf || isPending}
                              className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {!user.role && (
                                <option value="">Non défini</option>
                              )}

                              <option value="admin">Administrateur</option>
                              <option value="teacher">Enseignant</option>
                            </select>
                          </div>

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
    </main>
  )
}
