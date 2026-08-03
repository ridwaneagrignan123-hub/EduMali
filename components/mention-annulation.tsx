"use client"

/*
 * La mention d'une ligne annulée.
 *
 * ---------------------------------------------------------------------
 * JAMAIS UNE CASE VIDE MUETTE
 *
 * Une ligne annulée qui disparaîtrait, ou qui resterait sans explication,
 * poserait la même question à chaque lecture : « pourquoi ce chiffre a-t-il
 * changé ? ». Le document doit répondre tout seul — qui, quand, pourquoi —
 * sans qu'on ait à ouvrir le journal d'activité.
 *
 * D'où trois informations, toujours ensemble. Le motif peut manquer là où
 * il est facultatif (une note, une présence) : on écrit alors « sans motif »
 * plutôt que de laisser un blanc, qui se lirait comme une donnée perdue.
 * ---------------------------------------------------------------------
 */

export type Annulation = {
  cancelled_at: string | null
  cancellation_reason: string | null
  /* Le nom de l'auteur, déjà résolu par l'appelant. */
  cancelled_by_name?: string | null
}

/** Vrai si la ligne est annulée — un seul test, partout. */
export function estAnnulee(ligne: {
  cancelled_at?: string | null
}): boolean {
  return Boolean(ligne.cancelled_at)
}

/**
 * La classe à poser sur la ligne : barrée et grisée.
 *
 * Les deux ensemble, et non l'une ou l'autre : le barré seul se voit mal
 * sur un tableau dense, le grisé seul se confond avec une ligne
 * secondaire.
 */
export const CLASSE_ANNULEE = "line-through opacity-60"

export function MentionAnnulation({ ligne }: { ligne: Annulation }) {
  if (!ligne.cancelled_at) {
    return null
  }

  const quand = new Date(ligne.cancelled_at)

  return (
    <span className="block text-xs text-destructive">
      Annulée par {ligne.cancelled_by_name || "un compte supprimé depuis"} le{" "}
      {quand.toLocaleDateString("fr-FR")} à{" "}
      {quand.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}
      {" — motif : "}
      {ligne.cancellation_reason?.trim() || "sans motif"}
    </span>
  )
}
