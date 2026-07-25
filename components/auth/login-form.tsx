"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/src/lib/supabase"

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