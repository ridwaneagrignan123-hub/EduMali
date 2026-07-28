"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"

/*
 * Page d'atterrissage des liens d'accès envoyés depuis /users.
 *
 * Supabase établit une session à l'ouverture du lien : il ne reste plus
 * qu'à définir le mot de passe.
 */

const MIN_PASSWORD_LENGTH = 8

export default function UpdatePasswordPage() {
  const router = useRouter()

  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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
        setCheckingSession(false)
      }
    })

    checkSession()

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    setHasSession(Boolean(session))
    setCheckingSession(false)
  }

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

    setSaving(true)

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
            Définir votre mot de passe
          </h1>

          {checkingSession ? (
            <p className="mt-4 text-muted-foreground">Vérification du lien...</p>
          ) : !hasSession ? (
            <div className="mt-4 space-y-4">
              <p className="text-muted-foreground">
                Ce lien n'est plus valide ou a déjà été utilisé. Demandez à
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
                  Au moins {MIN_PASSWORD_LENGTH} caractères.
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
                {saving ? "Enregistrement..." : "Enregistrer le mot de passe"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
