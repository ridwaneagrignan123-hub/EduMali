"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

export default function SetupSchoolPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .insert({
        name,
        address,
        phone,
        email,
      })
      .select()
      .single()

    if (schoolError) {
      setError(schoolError.message)
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        school_id: school.id,
        first_name: user.user_metadata?.first_name ?? "",
        last_name: user.user_metadata?.last_name ?? "",
        role: "admin",
      })
      .eq("id", user.id)

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    router.push("/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">
            Configurez votre école
          </h1>

          <p className="text-muted-foreground">
            Commençons par enregistrer les informations de votre établissement.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name">Nom de l'école</label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Exemple : École Khadidjah"
              required
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="address">Adresse</label>

            <input
              id="address"
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Exemple : Lafiabougou, Bamako"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone">Téléphone</label>

            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Exemple : 70 00 00 00"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email">Email de l'école</label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ecole@example.com"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Création en cours..." : "Créer mon école"}
          </button>
        </form>
      </div>
    </main>
  )
}