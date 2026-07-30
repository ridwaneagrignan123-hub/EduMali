"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import {
  SCHOOL_TYPES,
  SCHOOL_TYPE_HINTS,
  SCHOOL_TYPE_LABELS,
  SchoolType,
} from "@/src/lib/etablissement"

export default function SetupSchoolPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [schoolType, setSchoolType] = useState<SchoolType>("classique")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    /*
     * La création passe par une route serveur, pas par un update direct.
     *
     * Le déclencheur profiles_prevent_privilege_escalation interdit à un
     * utilisateur de modifier son propre role ou school_id — c'est ce qui
     * empêche un enseignant de se promouvoir administrateur. L'inscription
     * doit faire exactement cela une fois, légitimement : seul le service
     * role en a le droit, donc seule une route serveur peut le faire.
     */
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      router.push("/login")
      return
    }

    try {
      const response = await fetch("/api/setup-school", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name, address, phone, email, schoolType }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error ?? "La création de l'établissement a échoué.")
        setLoading(false)
        return
      }
    } catch (requestError) {
      console.error("Erreur création de l'établissement :", requestError)

      setError(
        "Le serveur n'a pas répondu. Vérifiez votre connexion et réessayez."
      )
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
            <label htmlFor="name">Nom de l&apos;école</label>

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

          {/*
            Le type conditionne l'affichage de toute la scolarité — double
            direction, double titulaire au premier cycle. Il se modifie
            ensuite dans les paramètres, mais le demander ici évite de
            reconfigurer une école déjà remplie.
          */}
          <fieldset className="space-y-2">
            <legend className="mb-2">Type d&apos;établissement</legend>

            <div className="space-y-2">
              {SCHOOL_TYPES.map((type) => (
                <label
                  key={type}
                  htmlFor={`school-type-${type}`}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                    schoolType === type ? "border-black bg-muted/50" : ""
                  }`}
                >
                  <input
                    id={`school-type-${type}`}
                    type="radio"
                    name="schoolType"
                    value={type}
                    checked={schoolType === type}
                    onChange={() => setSchoolType(type)}
                    className="mt-1"
                  />

                  <span>
                    <span className="block font-medium">
                      {SCHOOL_TYPE_LABELS[type]}
                    </span>

                    <span className="block text-sm text-muted-foreground">
                      {SCHOOL_TYPE_HINTS[type]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

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
            <label htmlFor="email">Email de l&apos;école</label>

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