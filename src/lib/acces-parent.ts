import { ilYA, joursDepuis } from "@/src/lib/temps-relatif"

/*
 * L'état d'un accès famille, dit d'une seule voix.
 *
 * Deux écrans le montrent : le bloc sur la fiche de l'élève, et le
 * tableau des familles. Écrire la phrase deux fois garantissait qu'elles
 * finiraient par se contredire — le secrétariat lirait « jamais ouvert »
 * ici et « en attente » là, pour la même famille.
 *
 * Ce module ne parle donc pas à la base : il ne fait que traduire un
 * état en une phrase. Ce qui le rend lisible depuis n'importe où.
 */

export type CodeParent = {
  id: string
  code: string
  created_at: string
  last_used_at: string | null
  opened_count: number
}

export type EtatAcces = {
  /*
   * Vrai pour le SEUL cas qui commande un geste. Tout le reste est du
   * constat : si trois états sur quatre portaient une couleur, elle ne
   * voudrait plus rien dire.
   */
  alerte: boolean
  titre: string
  detail: string | null
}

/*
 * Le délai n'est pas une science : c'est le temps qu'il faut pour qu'un
 * papier remis au secrétariat traverse un cartable et arrive à la
 * maison. En deçà, l'absence d'ouverture ne prouve rien.
 */
export const DELAI_INQUIETUDE = 14

export function etatAcces(code: CodeParent): EtatAcces {
  const ageJours = joursDepuis(code.created_at) ?? 0

  if (code.opened_count === 0) {
    if (ageJours < DELAI_INQUIETUDE) {
      return {
        alerte: false,
        titre: "Jamais ouvert",
        detail: `Remis ${ilYA(code.created_at)} — laissez-lui le temps d'arriver.`,
      }
    }

    return {
      alerte: true,
      titre: `Jamais ouvert, et remis ${ilYA(code.created_at)}`,
      detail:
        "Le papier n'est probablement jamais arrivé à la famille. Redonnez-le plutôt que d'attendre.",
    }
  }

  if (code.opened_count === 1) {
    return {
      alerte: false,
      titre: `Ouvert une seule fois, ${ilYA(code.last_used_at ?? code.created_at)}`,
      detail: "La famille a essayé ; elle n'est pas encore revenue.",
    }
  }

  return {
    alerte: false,
    titre: `Ouvert ${code.opened_count} fois`,
    detail: `Dernière visite ${ilYA(code.last_used_at ?? code.created_at)}.`,
  }
}

/**
 * La même chose en une ligne, pour une cellule de tableau.
 *
 * Le tableau montre des centaines de familles : la phrase longue y
 * noierait le regard. Elle reste sur la fiche de l'élève, où l'on est
 * quand un parent se présente au guichet.
 */
export function etatAccesCourt(code: CodeParent | null): EtatAcces {
  if (!code) {
    return {
      alerte: false,
      titre: "Aucun code",
      detail: null,
    }
  }

  const complet = etatAcces(code)

  if (code.opened_count === 0) {
    return {
      alerte: complet.alerte,
      titre: "Jamais ouvert",
      detail: `remis ${ilYA(code.created_at)}`,
    }
  }

  return {
    alerte: false,
    titre: code.opened_count === 1 ? "Ouvert 1 fois" : `Ouvert ${code.opened_count} fois`,
    detail: ilYA(code.last_used_at ?? code.created_at),
  }
}
