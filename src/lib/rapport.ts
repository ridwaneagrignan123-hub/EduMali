/*
 * Mise en forme des rapports mensuels — élève et enseignant.
 *
 * ---------------------------------------------------------------------
 * POURQUOI LE JOUR DE LA SEMAINE EST ÉCRIT EN TOUTES LETTRES
 *
 * Ces documents se posent sur une table pendant une convocation. « Le
 * 14/03 » n'évoque rien à un parent ; « mardi 14 mars » se rattache à
 * un souvenir, et se conteste ou se reconnaît. C'est toute la différence
 * entre une liste et un fait opposable.
 * ---------------------------------------------------------------------
 *
 * DEUX SOURCES D'HEURE, ET IL FAUT SAVOIR LAQUELLE ON LIT
 *
 * Une absence par leçon a une heure VRAIE : celle du cours, portée par
 * le créneau. Une absence à la journée, une retenue ou un manquement
 * n'en ont pas — la seule heure disponible est celle de la SAISIE
 * (`created_at`), qui dit quand le fait a été consigné, pas quand il
 * s'est produit.
 *
 * Les confondre ferait dire au document quelque chose de faux. Chaque
 * ligne porte donc sa source, et `SOURCE_HEURE` la nomme à l'écran.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

export const MOIS_NOMS = MOIS

/** Ce que l'heure affichée désigne réellement. */
export type SourceHeure = "cours" | "saisie"

export const SOURCE_HEURE: Record<SourceHeure, string> = {
  cours: "heure du cours",
  saisie: "heure de saisie",
}

/** Premier et dernier jour du mois, au format ISO comparable en base. */
export function bornesDuMois(annee: number, mois: number) {
  const debut = new Date(Date.UTC(annee, mois - 1, 1))
  const fin = new Date(Date.UTC(annee, mois, 0))

  return {
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  }
}

export function libelleMois(annee: number, mois: number) {
  return `${MOIS[mois - 1]} ${annee}`
}

/**
 * « mardi » — à partir d'une date ISO seule (AAAA-MM-JJ).
 *
 * Le `T00:00:00` sans fuseau force une lecture LOCALE. Sans lui,
 * JavaScript lit une date nue comme UTC, et le 1er du mois bascule au
 * dernier jour du mois précédent à l'ouest de Greenwich — un fait daté
 * d'un jour trop tôt sur un document de convocation.
 */
export function jourDeLaSemaine(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
  })
}

/** « 14/03/2026 ». */
export function dateCourte(dateIso: string) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("fr-FR")
}

/** « 08:15 » — l'heure d'un horodatage complet. */
export function heureDe(horodatage: string | null | undefined) {
  if (!horodatage) {
    return "—"
  }

  return new Date(horodatage).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** « 08:00 » — une heure Postgres « 08:00:00 » ramenée à l'essentiel. */
export function heurePostgres(valeur: string | null | undefined) {
  return valeur ? valeur.slice(0, 5) : "—"
}

/** « 08:00 – 09:00 », la plage d'un créneau. */
export function plageHoraire(
  debut: string | null | undefined,
  fin: string | null | undefined
) {
  if (!debut && !fin) {
    return "—"
  }

  return `${heurePostgres(debut)} – ${heurePostgres(fin)}`
}

/** La date d'un horodatage complet, sans son heure. */
export function dateDeLHorodatage(horodatage: string) {
  return horodatage.slice(0, 10)
}

/**
 * Un fait daté, tel qu'il s'imprime : une ligne du rapport.
 *
 * `heure` et `source` vont ensemble — afficher l'une sans l'autre
 * laisserait croire que toutes les heures se valent.
 */
export type FaitDate = {
  dateIso: string
  heure: string
  source: SourceHeure
  categorie: string
  detail: string
  /** Complément facultatif : motif, note, statut d'envoi. */
  precision?: string | null
}

/** Du plus ancien au plus récent : un dossier se lit dans l'ordre. */
export function parOrdreChronologique(faits: FaitDate[]) {
  return [...faits].sort((a, b) => {
    const parDate = a.dateIso.localeCompare(b.dateIso)

    return parDate !== 0 ? parDate : a.heure.localeCompare(b.heure)
  })
}
