"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/src/lib/supabase"
import {
  checkPasswordExposure,
  isPasswordWarningSnoozed,
} from "@/src/lib/password-safety"

/*
 * Le contrôle anti-fuite posé sur /update-password ne protège que les
 * mots de passe CHOISIS depuis. Ceux déjà en place n'ont jamais été
 * vérifiés — d'où ce second contrôle, à la connexion.
 *
 * Il n'a lieu qu'ici : c'est le seul moment où l'application voit le mot
 * de passe en clair. Elle ne le conserve pas, donc elle ne pourra plus
 * le vérifier ensuite.
 *
 * Il n'empêche JAMAIS de se connecter. L'authentification a déjà réussi
 * quand il s'exécute ; refuser l'accès enfermerait dehors quelqu'un dans
 * son propre compte, pour un mot de passe qui reste le sien.
 */

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setLoginError(null)
    setSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error(error.message)
      setLoginError(
        error.message === "Invalid login credentials"
          ? "Adresse email ou mot de passe incorrect."
          : "Impossible de vous connecter. Réessayez dans un instant."
      )
      setSubmitting(false)
      return
    }

    /*
     * Connexion réussie. On profite du seul instant où le mot de passe
     * est disponible pour le confronter aux fuites connues.
     *
     * Le rappel est mis en sourdine pendant une semaine si la personne
     * a choisi « plus tard » : sans cela, elle serait déroutée à chaque
     * connexion et finirait par cliquer sans lire.
     */
    if (!isPasswordWarningSnoozed()) {
      const exposure = await checkPasswordExposure(password)

      if (exposure.status === "compromis") {
        router.push(
          `/update-password?compromis=${exposure.occurrences}`
        )
        router.refresh()
        return
      }
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email">Adresse email</label>

        <Input
          id="email"
          type="email"
          placeholder="exemple@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password">Mot de passe</label>

        <Input
          id="password"
          type="password"
          placeholder="Votre mot de passe"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      {loginError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {loginError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  )
}