"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { roleLabel } from "@/src/lib/roles"

/*
 * Refus lisible pour une page qu'un rôle n'a pas à ouvrir.
 *
 * Rappel : ceci ne protège rien. Les policies RLS sont la seule barrière
 * — celui qui contourne cet écran ne récupère aucune donnée. Ce qui est
 * ici évite qu'une personne se heurte à une page vide sans comprendre
 * pourquoi.
 */

type Etat =
  | { statut: "chargement" }
  | { statut: "refuse"; role: string }
  | { statut: "autorise"; role: string; schoolId: string }

export function useRoleGate(allowedRoles: string[]) {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>({ statut: "chargement" })

  useEffect(() => {
    async function verifier() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle()

      if (error || !profile) {
        console.error("Erreur profil :", error)
        router.push("/login")
        return
      }

      if (!profile.school_id) {
        router.push("/setup-school")
        return
      }

      const role = profile.role ?? ""

      setEtat(
        allowedRoles.includes(role)
          ? { statut: "autorise", role, schoolId: profile.school_id }
          : { statut: "refuse", role }
      )
    }

    verifier()
    // Les rôles autorisés d'une page sont une constante de module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return etat
}

export function AccesRefuse({ role }: { role: string }) {
  const router = useRouter()

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-6">
        <h1 className="font-heading text-xl font-bold">
          Cette page ne vous est pas ouverte
        </h1>

        <p className="mt-3 text-muted-foreground">
          Votre compte est enregistré comme{" "}
          <strong>{roleLabel(role)}</strong>. Si vous pensez devoir y
          accéder, demandez à la direction de votre établissement de
          revoir votre rôle.
        </p>

        <button
          onClick={() => router.push("/dashboard")}
          className="mt-6 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          Retour au tableau de bord
        </button>
      </div>
    </main>
  )
}

export function ChargementPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">Chargement...</p>
    </main>
  )
}
