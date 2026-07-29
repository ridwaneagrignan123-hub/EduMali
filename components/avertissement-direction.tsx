"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/src/lib/supabase"

/*
 * Avertit un directeur de direction à qui aucune direction n'a été
 * affectée.
 *
 * Sans direction, private.current_direction_id() vaut NULL et aucune
 * classe ne satisfait la condition de cloisonnement : la personne voit
 * zéro classe, zéro élève, zéro note. Le cloisonnement échoue du bon
 * côté — rien ne fuit — mais l'écran reste muet, et l'on croit à une
 * panne.
 *
 * Le composant va chercher lui-même ce qu'il lui faut et ne rend rien
 * quand il n'y a rien à dire : le poser sur une page tient en une ligne.
 */

type Etat = "chargement" | "rien-a-dire" | "sans-direction"

export function AvertissementDirection({
  compact = false,
}: {
  /** Version resserrée, pour une page déjà chargée en informations. */
  compact?: boolean
}) {
  const [etat, setEtat] = useState<Etat>("chargement")

  useEffect(() => {
    let annule = false

    async function verifier() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!annule) setEtat("rien-a-dire")
        return
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, direction_id")
        .eq("id", user.id)
        .maybeSingle()

      if (annule) {
        return
      }

      if (error) {
        // Un avertissement absent vaut mieux qu'un avertissement faux.
        console.error("Erreur lecture du profil :", error)
        setEtat("rien-a-dire")
        return
      }

      setEtat(
        profile?.role === "directeur_direction" && !profile.direction_id
          ? "sans-direction"
          : "rien-a-dire"
      )
    }

    verifier()

    return () => {
      annule = true
    }
  }, [])

  if (etat !== "sans-direction") {
    return null
  }

  const cadre = {
    background: "oklch(0.80 0.14 78 / 0.12)",
    borderColor: "oklch(0.57 0.14 78 / 0.5)",
  }

  if (compact) {
    return (
      <div className="rounded-lg border p-3 text-sm" style={cadre}>
        <strong>Aucune direction ne vous est affectée.</strong> Cette page
        restera vide tant qu&apos;un directeur général ne vous en aura pas
        attribué une.
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 text-sm" style={cadre}>
      <p className="font-medium">
        Aucune direction ne vous est affectée.
      </p>

      <p className="mt-2 text-muted-foreground">
        Votre compte est enregistré comme directeur de direction, mais
        aucune direction ne lui est rattachée. Vos écrans resteront donc
        vides — aucune classe, aucun élève, aucune note — parce que votre
        périmètre est vide, et non parce que l&apos;application est en
        panne.
      </p>

      <p className="mt-2 text-muted-foreground">
        Demandez à un directeur général de vous rattacher à une direction
        depuis la page <strong>Comptes utilisateurs</strong>.
      </p>
    </div>
  )
}
