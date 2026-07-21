import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-3xl font-bold">
        Bienvenue sur EduMali
      </h1>

      <p className="mt-2 text-muted-foreground">
        Votre tableau de bord scolaire
      </p>

      <p className="mt-4">
        Connecté avec : {user.email}
      </p>
    </main>
  )
}