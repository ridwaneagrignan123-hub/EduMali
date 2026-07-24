"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type School = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
}

export default function SettingsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")

  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [logoUrl, setLogoUrl] = useState("")

  useEffect(() => {
    loadSchool()
  }, [])

  async function loadSchool() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoadError(
        "Impossible de charger votre profil. Réessayez ou reconnectez-vous."
      )
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("id, name, address, phone, email, logo_url")
      .eq("id", profile.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error("Erreur école :", schoolError)
      setLoadError(
        "Impossible de charger les informations de l'établissement."
      )
      setLoading(false)
      return
    }

    if (school) {
      const schoolData = school as School
      setName(schoolData.name ?? "")
      setAddress(schoolData.address ?? "")
      setPhone(schoolData.phone ?? "")
      setEmail(schoolData.email ?? "")
      setLogoUrl(schoolData.logo_url ?? "")
    }

    setLoading(false)
  }

  async function saveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim()) {
      alert("Le nom de l'établissement est obligatoire.")
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)

    const { error } = await supabase
      .from("schools")
      .update({
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        logo_url: logoUrl.trim() || null,
      })
      .eq("id", schoolId)

    if (error) {
      console.error(
        "Erreur lors de la mise à jour de l'établissement :",
        error
      )
      setSaveError(
        "Impossible d'enregistrer les modifications. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
      )
      setSaving(false)
      return
    }

    setSaveMessage("Informations de l'établissement enregistrées avec succès.")
    setSaving(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement des paramètres...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">EduMali</h1>
            <p className="text-sm text-muted-foreground">Paramètres</p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">
            Paramètres de l'établissement
          </h2>

          <p className="mt-2 text-muted-foreground">
            Modifiez les informations générales de votre établissement.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border bg-background p-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
              style={{ background: "oklch(0.58 0.15 45 / 0.08)" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={`Logo ${name || "établissement"}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-2xl font-heading font-extrabold text-primary">
                  {name.charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>

            <div>
              <p className="font-heading text-xl font-bold">
                {name || "Établissement scolaire"}
              </p>

              <p className="text-sm text-muted-foreground">
                {address || "Aucune adresse renseignée"}
              </p>
            </div>
          </div>

          <form onSubmit={saveSchool} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label htmlFor="school-name">Nom de l'établissement *</label>

              <input
                id="school-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="school-address">Adresse</label>

              <input
                id="school-address"
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="school-phone">Téléphone</label>

                <input
                  id="school-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="school-email">Email de contact</label>

                <input
                  id="school-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="school-logo">URL du logo</label>

              <input
                id="school-logo"
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border bg-background px-3 py-2"
              />

              <p className="text-xs text-muted-foreground">
                Collez le lien d'une image déjà hébergée en ligne. Ce logo
                apparaît sur les bulletins scolaires.
              </p>
            </div>

            {saveError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {saveError}
              </div>
            )}

            {saveMessage && (
              <p className="text-sm text-muted-foreground">{saveMessage}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
