"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/src/lib/supabase"
import { useLangue } from "@/src/i18n/contexte"
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
  const { t } = useLangue()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const router = useRouter()

  /*
   * La destination doit figurer dans les URL de redirection autorisées du
   * projet Supabase, sinon il la remplace silencieusement par l'URL du
   * site. On part de l'origine courante : la même page fonctionne en
   * local et en production.
   */
  async function signInWithGoogle() {
    setGoogleError(null)
    setGoogleLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Force le choix du compte : sans cela Google reconnecte
        // silencieusement le dernier utilisé, ce qui déroute sur un poste
        // partagé — cas courant dans une école.
        queryParams: { prompt: "select_account" },
      },
    })

    if (error) {
      console.error("Erreur connexion Google :", error)
      setGoogleLoading(false)

      setGoogleError(
        error.message?.includes("provider is not enabled")
          ? "La connexion Google n'est pas encore activée sur cet établissement."
          : "Impossible d'ouvrir la connexion Google. Réessayez."
      )
    }

    // Succès : le navigateur partant vers Google, on laisse l'état chargé.
  }

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
          ? t("connexion.echec")
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
        <label htmlFor="email">{t("connexion.email")}</label>

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
        <label htmlFor="password">{t("connexion.motDePasse")}</label>

        <Input
          id="password"
          type="password"
          placeholder={t("connexion.motDePassePlaceholder")}
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
        {submitting ? t("connexion.connexionEnCours") : t("connexion.seConnecter")}
      </Button>

      <div className="flex items-center gap-3 pt-2">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t("connexion.ou")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/*
        Google mène à /auth/callback, qui AIGUILLE au lieu de refuser :
        espace de son école, écran d'exploitation, création
        d'établissement si une autorisation l'attend, état de sa demande,
        ou dépôt d'une demande. Google prouve une adresse ; il ne crée
        aucune école — celle-ci reste fermée derrière une autorisation
        nominative.
      */}
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={submitting || googleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden focusable="false">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>

        {googleLoading
          ? t("connexion.connexionEnCours")
          : t("connexion.avecGoogle")}
      </button>

      {googleError && (
        <p className="text-sm text-destructive">{googleError}</p>
      )}
    </form>
  )
}