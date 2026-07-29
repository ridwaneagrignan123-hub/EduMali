"use client"

import { FormEvent, Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"
import {
  checkPasswordExposure,
  findObviousWeakness,
  snoozePasswordWarning,
} from "@/src/lib/password-safety"

/*
 * Page d'atterrissage des liens d'accès envoyés depuis /users.
 *
 * Supabase établit une session à l'ouverture du lien : il ne reste plus
 * qu'à définir le mot de passe.
 *
 * C'est le seul endroit de l'application où un mot de passe est choisi —
 * les invitations y aboutissent toutes. Le contrôle contre les mots de
 * passe issus de fuites est donc posé ici, et nulle part ailleurs.
 */

const MIN_PASSWORD_LENGTH = 8

/*
 * useSearchParams impose une frontière de Suspense au rendu statique :
 * la page est enveloppée plus bas.
 */
export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Chargement...</p>
        </main>
      }
    >
      <UpdatePasswordForm />
    </Suspense>
  )
}

function UpdatePasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  /*
   * Renseigné quand la connexion vient de détecter un mot de passe
   * présent dans des fuites : la personne n'a rien demandé, il faut donc
   * lui expliquer pourquoi elle est ici.
   */
  const compromisedCount = searchParams.get("compromis")

  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")

  const [saving, setSaving] = useState(false)
  const [checkingExposure, setCheckingExposure] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /** Renseigné pour refuser un mot de passe bâti sur sa propre adresse. */
  const [userEmail, setUserEmail] = useState("")

  /** Le contrôle anti-fuite n'a pas pu aboutir : on le dit sans bloquer. */
  const [exposureUnchecked, setExposureUnchecked] = useState(false)

  useEffect(() => {
    /*
     * Le jeton arrive dans l'URL : le client Supabase l'exploite au
     * chargement. On écoute aussi onAuthStateChange pour ne pas dépendre
     * de l'ordre entre cette détection et la première lecture de session.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true)
        setUserEmail(session.user?.email ?? "")
        setCheckingSession(false)
      }
    })

    /*
     * Déclarée dans l'effet plutôt qu'au-dessus : une fonction du corps
     * du composant serait référencée avant sa déclaration, et la
     * référence capturée ne suivrait pas les rendus suivants.
     */
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setHasSession(Boolean(session))
      setUserEmail(session?.user?.email ?? "")
      setCheckingSession(false)
    }

    checkSession()

    return () => subscription.unsubscribe()
  }, [])

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
      )
      return
    }

    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }

    const weakness = findObviousWeakness(password, userEmail)

    if (weakness) {
      setError(weakness)
      return
    }

    setSaving(true)

    /*
     * Contrôle contre les fuites connues. Le mot de passe ne quitte pas
     * l'appareil : seuls cinq caractères de son empreinte sont envoyés.
     *
     * Si le service est injoignable, on laisse passer plutôt que de
     * bloquer quelqu'un qui doit accéder à son espace — un contrôle
     * absent vaut mieux qu'un utilisateur enfermé dehors.
     */
    setCheckingExposure(true)
    const exposure = await checkPasswordExposure(password)
    setCheckingExposure(false)

    if (exposure.status === "compromis") {
      setError(
        `Ce mot de passe figure dans des fuites de données connues (${exposure.occurrences.toLocaleString("fr-FR")} fois). Choisissez-en un autre : il serait parmi les premiers essayés.`
      )
      setSaving(false)
      return
    }

    if (exposure.status === "indisponible") {
      // Non bloquant, mais l'utilisateur doit savoir que le filet a manqué.
      setExposureUnchecked(true)
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      console.error("Erreur mise à jour du mot de passe :", updateError)
      setError(
        "Impossible d'enregistrer le mot de passe. Le lien a peut-être expiré : demandez-en un nouveau à votre administrateur."
      )
      setSaving(false)
      return
    }

    setDone(true)
    setSaving(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        <div className="rounded-xl border bg-background p-6">
          <h1 className="font-heading text-2xl font-bold">
            {compromisedCount
              ? "Changez votre mot de passe"
              : "Définir votre mot de passe"}
          </h1>

          {compromisedCount && !done && (
            <div
              className="mt-4 rounded-lg border p-4 text-sm"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.5)",
              }}
            >
              <p className="font-medium">
                Votre mot de passe actuel figure dans des fuites de données
                publiques.
              </p>

              <p className="mt-2 text-muted-foreground">
                {`Il est apparu ${Number(compromisedCount).toLocaleString(
                  "fr-FR"
                )} fois dans des bases dérobées à d'autres sites.`}{" "}
                Cela ne veut pas dire que votre compte Ridwane a été touché,
                mais ce mot de passe est parmi les premiers qu&apos;un
                attaquant essaierait.
              </p>

              <p className="mt-2 text-muted-foreground">
                Votre connexion a réussi et votre accès reste ouvert. Changer
                de mot de passe maintenant ne prend qu&apos;un instant.
              </p>
            </div>
          )}

          {checkingSession ? (
            <p className="mt-4 text-muted-foreground">Vérification du lien...</p>
          ) : !hasSession ? (
            <div className="mt-4 space-y-4">
              <p className="text-muted-foreground">
                Ce lien n&apos;est plus valide ou a déjà été utilisé. Demandez à
                votre administrateur de vous en envoyer un nouveau.
              </p>

              <button
                onClick={() => router.push("/login")}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Retour à la connexion
              </button>
            </div>
          ) : done ? (
            <div className="mt-4 space-y-4">
              <p className="text-muted-foreground">
                Votre mot de passe a été enregistré. Vous pouvez maintenant
                accéder à votre espace.
              </p>

              {/*
                Le compte est nommé explicitement : un lien ouvert dans un
                navigateur déjà connecté voit l'ancienne session reprendre
                le dessus, et l'on croit alors travailler sous une identité
                qui n'est pas la sienne.
              */}
              {userEmail && (
                <p className="rounded-md border bg-muted/40 p-3 text-sm">
                  Vous êtes connecté en tant que{" "}
                  <strong>{userEmail}</strong>.
                </p>
              )}

              {exposureUnchecked && (
                <p
                  className="rounded-lg border p-3 text-sm"
                  style={{
                    background: "oklch(0.80 0.14 78 / 0.12)",
                    borderColor: "oklch(0.57 0.14 78 / 0.4)",
                  }}
                >
                  La vérification contre les fuites de données connues
                  n&apos;a pas pu aboutir — le service était injoignable.
                  Votre mot de passe a bien été enregistré.
                </p>
              )}

              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
              >
                Aller au tableau de bord
              </button>
            </div>
          ) : (
            <form onSubmit={updatePassword} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label htmlFor="password">Nouveau mot de passe *</label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />

                <p className="text-xs text-muted-foreground">
                  Au moins {MIN_PASSWORD_LENGTH} caractères. Il est comparé
                  aux fuites de données connues, sans jamais quitter votre
                  appareil.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmation">Confirmer le mot de passe *</label>

                <input
                  id="confirmation"
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkingExposure
                  ? "Vérification du mot de passe..."
                  : saving
                    ? "Enregistrement..."
                    : "Enregistrer le mot de passe"}
              </button>

              {/*
                Seulement quand la personne a été redirigée depuis la
                connexion : elle a un accès valide et doit pouvoir
                travailler tout de suite. On ne la retient pas.
              */}
              {compromisedCount && (
                <button
                  type="button"
                  onClick={() => {
                    snoozePasswordWarning()
                    router.push("/dashboard")
                  }}
                  className="w-full rounded-md border px-4 py-2 text-sm hover:bg-muted"
                >
                  Plus tard — me le rappeler dans une semaine
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
