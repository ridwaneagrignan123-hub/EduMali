"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"
import { EditDialog } from "@/components/edit-dialog"
import { AccessLinkNotice } from "@/components/access-link-notice"
import {
  ROLE_LABELS,
  assignableRoles,
  can,
  canAssignRole,
  roleLabelDetaille,
} from "@/src/lib/roles"
import {
  CYCLES,
  CYCLE_LABELS,
  FILIERES,
  FILIERE_LABELS,
  filiereLabel,
  hasFiliere,
  toSchoolType,
} from "@/src/lib/etablissement"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"

type UserAccount = {
  id: string
  firstName: string | null
  lastName: string | null
  role: string | null
  directionId: string | null
  /* Filière du directeur de direction. Nulle hors école franco-arabe. */
  filiere: string | null
  /* Cycle du surveillant rattaché. Nul pour tout autre rôle. */
  cycle: string | null
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

/*
 * Copie locale supprimée : elle avait déjà divergé, « surveillant » y
 * manquant depuis sa création. La liste des rôles n'a qu'une source.
 */
const roleLabels = ROLE_LABELS

/*
 * Doit rester aligné sur la permission comptes.consulter — le directeur
 * de direction y figure, et il en a besoin : c'est lui qui ajoute ses
 * enseignants.
 */
const ROLES_AUTORISES = ["promoteur", "directeur_general", "directeur_direction"]

// Seul rôle dont le périmètre est limité à une direction.
const DIRECTION_SCOPED_ROLE = "directeur_direction"

/*
 * Le surveillant est rattache a UN cycle. Le surveillant GENERAL voit
 * les trois : il n'a donc pas de cycle a choisir.
 */
const CYCLE_SCOPED_ROLE = "surveillant"

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
  const gate = useRoleGate(ROLES_AUTORISES)

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

  /* Filière choisie en attente — école franco-arabe seulement. */
  const [pendingFiliereByUserId, setPendingFiliereByUserId] = useState<
    Record<string, string>
  >({})

  /* Cycle choisi en attente — surveillant rattaché seulement. */
  const [pendingCycleByUserId, setPendingCycleByUserId] = useState<
    Record<string, string>
  >({})

  /*
   * AJOUT D'UN MEMBRE. Les roles proposes ne sont pas une liste ecrite
   * ici : ce sont exactement ceux que NOMINE autorise a l'appelant. La
   * route serveur refait le meme controle — l'ecran ne fait qu'eviter de
   * proposer ce qui sera refuse.
   */
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [nouveauPrenom, setNouveauPrenom] = useState("")
  const [nouveauNom, setNouveauNom] = useState("")
  const [nouvelEmail, setNouvelEmail] = useState("")
  const [nouveauRole, setNouveauRole] = useState("")
  const [nouvelleDirection, setNouvelleDirection] = useState("")
  const [nouvelleFiliere, setNouvelleFiliere] = useState("")
  const [nouveauCycle, setNouveauCycle] = useState("")
  const [nouveauTelephone, setNouveauTelephone] = useState("")
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [ajoutErreur, setAjoutErreur] = useState<string | null>(null)

  const [schoolType, setSchoolType] = useState("classique")
  const avecFiliere = hasFiliere(schoolType)


  /* Le promoteur ouvre ou ferme la comptabilite a son directeur general. */
  const [dgVoitCompta, setDgVoitCompta] = useState(false)
  const [bascule, setBascule] = useState(false)

  const [searchTerm, setSearchTerm] = useState("")

  // Identifiant du compte en cours de modification, pour désactiver ses boutons.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  /** Rôle de la personne connectée, pour n'afficher que ses commandes. */
  const [monRole, setMonRole] = useState("")

  /*
   * Ce que NOMINE autorise a l'appelant, et rien d'autre. La liste vide
   * fait disparaitre le formulaire : un role qui ne nomme personne n'a
   * pas a voir un bouton qui echouerait.
   */
  const rolesCreables = assignableRoles(monRole)

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

    const comptes = (result.users as UserAccount[]) ?? []
    setUsers(comptes)

    /*
     * Le rôle de l'appelant sert à masquer les commandes qu'il ne peut
     * pas déclencher. La route serveur les refuse de toute façon : ceci
     * évite seulement de proposer un bouton qui rendrait 403.
     */
    setMonRole(comptes.find((compte) => compte.isSelf)?.role ?? "")

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

    /* L'axe filière n'apparaît qu'en école franco-arabe. */
    const { data: schoolData, error: schoolError } = await supabase
      .from("schools")
      .select("school_type, dg_voit_comptabilite")
      .maybeSingle()

    if (schoolError) {
      console.error("Erreur type d'établissement :", schoolError)
    } else {
      setSchoolType(toSchoolType(schoolData?.school_type))
      setDgVoitCompta(schoolData?.dg_voit_comptabilite === true)
    }

    setLoading(false)
  }

  function fermerAjout() {
    setAjoutOuvert(false)
    setAjoutErreur(null)
    setNouveauPrenom("")
    setNouveauNom("")
    setNouvelEmail("")
    setNouveauRole("")
    setNouvelleDirection("")
    setNouvelleFiliere("")
    setNouveauCycle("")
    setNouveauTelephone("")
  }

  async function ajouterMembre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setAjoutErreur(null)
    setAjoutEnCours(true)

    const accessToken = await getAccessToken()

    if (!accessToken) {
      return
    }

    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        firstName: nouveauPrenom,
        lastName: nouveauNom,
        email: nouvelEmail,
        role: nouveauRole,
        directionId: nouvelleDirection || undefined,
        filiere: nouvelleFiliere || undefined,
        cycle: nouveauCycle || undefined,
        phone: nouveauTelephone || undefined,
      }),
    })

    const resultat = await response.json()
    setAjoutEnCours(false)

    if (!response.ok) {
      setAjoutErreur(resultat.error ?? "Le compte n'a pas pu être créé.")
      return
    }

    /*
     * Le lien d'acces s'affiche tout de suite : tant qu'aucun service
     * d'envoi n'est branche, c'est le seul chemin reel vers le compte.
     */
    setAccessNotice({
      email: resultat.email,
      emailAttempted: resultat.emailAttempted,
      accessLink: resultat.accessLink,
    })

    setActionMessage(
      `${nouveauNom.toUpperCase()} ${nouveauPrenom} a été ajouté comme ${roleLabels[nouveauRole] ?? nouveauRole}.`
    )

    fermerAjout()
    await loadUsers()
  }

  async function basculerComptaDuDg(autorise: boolean) {
    setActionError(null)
    setActionMessage(null)
    setBascule(true)

    const accessToken = await getAccessToken()

    if (!accessToken) {
      return
    }

    const response = await fetch("/api/school/accounting-access", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ autorise }),
    })

    const result = await response.json()
    setBascule(false)

    if (!response.ok) {
      setActionError(result.error ?? "Le reglage n'a pas pu etre enregistre.")
      return
    }

    setDgVoitCompta(autorise)
    setActionMessage(
      autorise
        ? "Le directeur general voit desormais la comptabilite."
        : "La comptabilite est refermee au directeur general."
    )
  }

  async function updateUser(
    userId: string,
    updates: {
      role?: string
      isActive?: boolean
      directionId?: string
      filiere?: string | null
      cycle?: string | null
    },
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
    if (role !== DIRECTION_SCOPED_ROLE && role !== CYCLE_SCOPED_ROLE) {
      applyRole(user, role, null)
    }
  }

  /*
   * Le cycle d'un surveillant se valide en meme temps que son role : la
   * route refuse un surveillant sans cycle, parce qu'il ne verrait
   * aucune classe.
   */
  async function applyCycle(user: UserAccount, cycle: string) {
    const confirmed = window.confirm(
      `Faire de ${getFullName(user)} le surveillant du ${
        CYCLE_LABELS[cycle as keyof typeof CYCLE_LABELS] ?? cycle
      } ? Il ne verra que la surveillance de ce cycle.`
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
      { role: CYCLE_SCOPED_ROLE, cycle },
      `${getFullName(user)} surveille désormais le ${
        CYCLE_LABELS[cycle as keyof typeof CYCLE_LABELS] ?? cycle
      }.`
    )

    setPendingCycleByUserId((current) => {
      const next = { ...current }
      delete next[user.id]
      return next
    })

    await loadUsers()
  }

  async function applyRole(
    user: UserAccount,
    role: string,
    directionId: string | null,
    filiere: string | null = null
  ) {
    if (
      role === user.role &&
      directionId === user.directionId &&
      filiere === user.filiere
    ) {
      return
    }

    const directionName = directions.find(
      (item) => item.id === directionId
    )?.name

    const confirmed = window.confirm(
      directionId
        ? `Faire de ${getFullName(user)} le directeur${filiere ? ` ${filiereLabel(filiere).toLowerCase()}` : ""} de « ${directionName ?? "cette direction"} » ? Il ne verra plus que les classes de cette direction.`
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
      directionId ? { role, directionId, filiere } : { role },
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

  /*
   * Un enseignant qui tape l'adresse voyait la page se dessiner, puis un
   * message de permission au milieu. La route refusait bien — aucun
   * compte ne s'affichait — mais autant le dire d'emblée, comme le font
   * déjà /fees et /activity.
   */
  if (gate.statut === "chargement") {
    return <ChargementPage />
  }

  if (gate.statut === "refuse") {
    return <AccesRefuse role={gate.role} />
  }

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
            {/* Les paramètres restent réservés à l'administrateur. */}
            {can(monRole, "parametres.gerer") && (
              <button
                onClick={() => router.push("/settings")}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Paramètres
              </button>
            )}

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
            Gérez les accès des membres de votre établissement. Les rôles que
            vous pouvez attribuer dépendent du vôtre.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/*
          Les trois seules écritures du promoteur tiennent sur cet écran :
          nommer son directeur général, nommer son comptable — par la
          colonne « Rôle » ci-dessous — et cet interrupteur-ci. Partout
          ailleurs, il regarde.
        */}
        {can(monRole, "comptabilite.autoriser_dg") && (
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Comptabilité du directeur général
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Par défaut, le directeur général ne voit pas les frais, les
              paiements ni la paie. Vous pouvez lui ouvrir la consultation.
              Cela ne lui donne <strong>jamais</strong> la saisie : seul le
              comptable enregistre un paiement.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => basculerComptaDuDg(!dgVoitCompta)}
                disabled={bascule}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                {bascule
                  ? "Enregistrement..."
                  : dgVoitCompta
                    ? "Refermer la comptabilité"
                    : "Ouvrir la comptabilité"}
              </button>

              <p className="text-sm">
                État actuel :{" "}
                <strong>
                  {dgVoitCompta ? "ouverte en lecture" : "fermée"}
                </strong>
              </p>
            </div>
          </div>
        )}

        {/*
          AJOUTER UN MEMBRE.
          Les rôles proposés viennent de NOMINE, jamais d'une liste
          écrite ici : le promoteur voit directeur général et comptable,
          le directeur général ses directeurs et surveillants, le
          directeur ses enseignants. La route serveur refait le même
          contrôle — cet écran évite seulement de proposer ce qui sera
          refusé.
        */}
        {rolesCreables.length > 0 && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Ajouter un membre</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Crée le compte, le rattache à votre établissement et
                  produit son lien d&apos;accès.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  ajoutOuvert ? fermerAjout() : setAjoutOuvert(true)
                }
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                {ajoutOuvert ? "Annuler" : "Ajouter un membre"}
              </button>
            </div>

            {ajoutOuvert && (
              <form onSubmit={ajouterMembre} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="membre-prenom">Prénom *</label>

                    <input
                      id="membre-prenom"
                      value={nouveauPrenom}
                      onChange={(event) => setNouveauPrenom(event.target.value)}
                      required
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="membre-nom">Nom *</label>

                    <input
                      id="membre-nom"
                      value={nouveauNom}
                      onChange={(event) => setNouveauNom(event.target.value)}
                      required
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="membre-email">Adresse email *</label>

                  <input
                    id="membre-email"
                    type="email"
                    value={nouvelEmail}
                    onChange={(event) => setNouvelEmail(event.target.value)}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />

                  <p className="text-xs text-muted-foreground">
                    C&apos;est son identifiant de connexion, et l&apos;adresse
                    à laquelle son lien d&apos;accès sera rattaché.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="membre-role">Rôle *</label>

                  <select
                    id="membre-role"
                    value={nouveauRole}
                    onChange={(event) => {
                      setNouveauRole(event.target.value)
                      setNouvelleDirection("")
                      setNouvelleFiliere("")
                      setNouveauCycle("")
                    }}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Choisir...</option>

                    {rolesCreables.map((valeur) => (
                      <option key={valeur} value={valeur}>
                        {roleLabels[valeur] ?? valeur}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Le périmètre, pour les rôles qui en ont un. */}
                {nouveauRole === DIRECTION_SCOPED_ROLE && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="membre-direction">Direction *</label>

                      <select
                        id="membre-direction"
                        value={nouvelleDirection}
                        onChange={(event) =>
                          setNouvelleDirection(event.target.value)
                        }
                        required
                        className="w-full rounded-md border bg-background px-3 py-2"
                      >
                        <option value="">Choisir...</option>

                        {directions.map((direction) => (
                          <option key={direction.id} value={direction.id}>
                            {direction.name}
                          </option>
                        ))}
                      </select>

                      {directions.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Aucune direction n&apos;existe encore.{" "}
                          <button
                            type="button"
                            onClick={() => router.push("/directions")}
                            className="font-medium text-primary underline"
                          >
                            En créer une
                          </button>
                        </p>
                      )}
                    </div>

                    {/*
                      Le choix se nomme comme l'école le nomme : on ne
                      choisit pas « une filière », on choisit le directeur
                      arabe ou le directeur français. Le champ n'apparaît
                      que pour un directeur, il peut donc le dire ainsi
                      sans risque de confusion.
                    */}
                    {avecFiliere && (
                      <div className="space-y-2">
                        <label htmlFor="membre-filiere">Directeur de</label>

                        <select
                          id="membre-filiere"
                          value={nouvelleFiliere}
                          onChange={(event) =>
                            setNouvelleFiliere(event.target.value)
                          }
                          className="w-full rounded-md border bg-background px-3 py-2"
                        >
                          <option value="">Les deux filières</option>

                          {FILIERES.map((valeur) => (
                            <option key={valeur} value={valeur}>
                              Directeur {FILIERE_LABELS[valeur].toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {nouveauRole === CYCLE_SCOPED_ROLE && (
                  <div className="space-y-2">
                    <label htmlFor="membre-cycle">Cycle surveillé *</label>

                    <select
                      id="membre-cycle"
                      value={nouveauCycle}
                      onChange={(event) => setNouveauCycle(event.target.value)}
                      required
                      className="w-full rounded-md border bg-background px-3 py-2"
                    >
                      <option value="">Choisir...</option>

                      {CYCLES.map((valeur) => (
                        <option key={valeur} value={valeur}>
                          {CYCLE_LABELS[valeur]}
                        </option>
                      ))}
                    </select>

                    <p className="text-xs text-muted-foreground">
                      Un surveillant sans cycle ne voit aucune classe. Pour
                      couvrir les trois, choisissez plutôt surveillant
                      général.
                    </p>
                  </div>
                )}

                {/*
                  L'enseignant reçoit aussi une FICHE, pas seulement un
                  compte : sans elle il ne pourrait être affecté à aucune
                  classe, ni pointé, ni payé. Le numéro WhatsApp devient
                  donc obligatoire, comme partout où une fiche naît.
                */}
                {nouveauRole === "teacher" && (
                  <div className="space-y-2">
                    <label htmlFor="membre-tel">Numéro WhatsApp *</label>

                    <input
                      id="membre-tel"
                      type="tel"
                      value={nouveauTelephone}
                      onChange={(event) =>
                        setNouveauTelephone(event.target.value)
                      }
                      required
                      placeholder="Exemple : 76 00 00 00"
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />

                    <p className="text-xs text-muted-foreground">
                      Une fiche enseignant est créée en même temps que le
                      compte, et le numéro y est obligatoire.
                    </p>
                  </div>
                )}

                {ajoutErreur && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {ajoutErreur}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ajoutEnCours}
                  className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-50"
                >
                  {ajoutEnCours ? "Création..." : "Créer le compte"}
                </button>
              </form>
            )}
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

                  const needsCycle = selectedRole === CYCLE_SCOPED_ROLE

                  const chosenCycle =
                    pendingCycleByUserId[user.id] ?? user.cycle ?? ""

                  const chosenDirectionId =
                    pendingDirectionByUserId[user.id] ??
                    user.directionId ??
                    ""

                  const chosenFiliere =
                    pendingFiliereByUserId[user.id] ?? user.filiere ?? ""

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

                          {/*
                            La filière qualifie le titre plutôt que de
                            s'ajouter en queue de phrase : « Directeur
                            arabe de Direction arabe A » se lit comme on
                            le dit dans l'école, là où « Directeur de
                            direction — Périmètre : … — programme arabe »
                            répétait deux fois le même mot pour dire une
                            seule chose.
                          */}
                          {user.role === DIRECTION_SCOPED_ROLE && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {currentDirectionName
                                ? `${roleLabelDetaille(
                                    user.role,
                                    avecFiliere ? user.filiere : null
                                  )} de « ${currentDirectionName} »`
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
                              /*
                               * Verrouillé si l'appelant ne peut pas
                               * attribuer de rôle, ou si ce compte porte
                               * déjà un rôle hors de sa portée : un
                               * directeur général ne rétrograde pas un
                               * administrateur.
                               */
                              disabled={
                                user.isSelf ||
                                isPending ||
                                !canAssignRole(monRole, user.role)
                              }
                              className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {!user.role && (
                                <option value="">Non défini</option>
                              )}

                              {Object.entries(roleLabels)
                                /*
                                 * On ne propose que ce que l'appelant
                                 * peut réellement donner. Le rôle actuel
                                 * du compte reste listé, sans quoi le
                                 * sélecteur afficherait autre chose que
                                 * la réalité.
                                 */
                                .filter(
                                  ([value]) =>
                                    canAssignRole(monRole, value) ||
                                    value === user.role
                                )
                                .map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                            </select>
                          </div>

                          {needsCycle && !user.isSelf && (
                            <div className="space-y-1">
                              <label
                                htmlFor={`cycle-${user.id}`}
                                className="block text-xs text-muted-foreground"
                              >
                                Cycle surveillé
                              </label>

                              <div className="flex items-center gap-2">
                                <select
                                  id={`cycle-${user.id}`}
                                  value={chosenCycle}
                                  onChange={(event) =>
                                    setPendingCycleByUserId((current) => ({
                                      ...current,
                                      [user.id]: event.target.value,
                                    }))
                                  }
                                  disabled={isPending}
                                  className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="">Choisir...</option>

                                  {CYCLES.map((value) => (
                                    <option key={value} value={value}>
                                      {CYCLE_LABELS[value]}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  onClick={() =>
                                    applyCycle(user, chosenCycle)
                                  }
                                  disabled={isPending || !chosenCycle}
                                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Valider
                                </button>
                              </div>

                              <p className="text-xs text-muted-foreground">
                                Un surveillant sans cycle ne voit aucune
                                classe. Pour couvrir les trois, nommez-le
                                plutôt surveillant général.
                              </p>
                            </div>
                          )}

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

                                {/*
                                  ÉCOLE FRANCO-ARABE : une direction est
                                  tenue par deux directeurs, un par
                                  filière. La filière dit lequel répond de
                                  quel programme ; elle ne restreint pas
                                  ce qu'il voit — les deux suivent les
                                  mêmes élèves, dont le bulletin porte les
                                  deux programmes.
                                */}
                                {avecFiliere && (
                                  <select
                                    aria-label={`Filière de ${getFullName(user)}`}
                                    value={chosenFiliere}
                                    onChange={(event) =>
                                      setPendingFiliereByUserId((current) => ({
                                        ...current,
                                        [user.id]: event.target.value,
                                      }))
                                    }
                                    disabled={isPending}
                                    className="rounded-md border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="">Directeur de...</option>

                                    {FILIERES.map((value) => (
                                      <option key={value} value={value}>
                                        Directeur{" "}
                                        {FILIERE_LABELS[value].toLowerCase()}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                <button
                                  onClick={() =>
                                    applyRole(
                                      user,
                                      DIRECTION_SCOPED_ROLE,
                                      chosenDirectionId,
                                      chosenFiliere || null
                                    )
                                  }
                                  disabled={
                                    isPending ||
                                    !chosenDirectionId ||
                                    (avecFiliere && !chosenFiliere)
                                  }
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
                            {/*
                              Le mot change selon la situation : celui
                              qui ne s'est jamais connecté attend une
                              INVITATION, pas un lien de secours. C'est
                              le cas le plus fréquent d'un lien expiré.
                            */}
                            {user.hasSignedIn
                              ? "Renvoyer un lien d'accès"
                              : "Renvoyer l'invitation"}
                          </button>

                          <button
                            onClick={() => toggleActive(user)}
                            /*
                             * Désactiver relève du même pouvoir
                             * qu'attribuer un rôle : couper l'accès de
                             * l'administrateur reviendrait à régner
                             * seul.
                             */
                            disabled={
                              user.isSelf ||
                              isPending ||
                              !canAssignRole(monRole, user.role)
                            }
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
