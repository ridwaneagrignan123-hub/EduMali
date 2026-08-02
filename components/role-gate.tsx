"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { peutVoirComptabilite, roleLabel } from "@/src/lib/roles"

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

/**
 * @param allowedRoles rôles qui ouvrent la page par eux-mêmes.
 * @param options.comptabilite page financière : le directeur général y
 *   entre en plus si le promoteur de son école l'y a autorisé. Sans ce
 *   drapeau, aucune liste figée ne pourrait exprimer cet accès, qui
 *   dépend d'un interrupteur posé école par école.
 */
export function useRoleGate(
  allowedRoles: string[],
  options?: { comptabilite?: boolean }
) {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>({ statut: "chargement" })
  const surComptabilite = options?.comptabilite === true

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
      let autorise = allowedRoles.includes(role)

      if (!autorise && surComptabilite) {
        const { data: ecole } = await supabase
          .from("schools")
          .select("dg_voit_comptabilite")
          .eq("id", profile.school_id)
          .maybeSingle()

        autorise = peutVoirComptabilite(role, ecole?.dg_voit_comptabilite)
      }

      setEtat(
        autorise
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
