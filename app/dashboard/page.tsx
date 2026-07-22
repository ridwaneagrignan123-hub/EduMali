"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState("")

  useEffect(() => {
    async function checkUserAndSchool() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserEmail(user.email ?? "")

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("Erreur profil :", profileError)
        setLoading(false)
        return
      }

      if (!profile.school_id) {
        router.push("/setup-school")
        return
      }

      setLoading(false)
    }

    checkUserAndSchool()
  }, [router])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Chargement...</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">
        Bienvenue sur EduMali
      </h1>

      <p className="mt-2 text-gray-600">
        Votre tableau de bord scolaire
      </p>

      <p className="mt-6">
        Connecté avec : {userEmail}
      </p>
    </main>
  )
}