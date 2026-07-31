/*
 * La règle de notation du PREMIER CYCLE, en un seul endroit.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 *
 * Trois écrans montrent la même moyenne : la grille, la page Moyennes et
 * le bulletin. Tant que chacun la recalculait à sa façon, ils pouvaient
 * diverger — et c'est exactement ce qui produisait des bulletins vides
 * alors que les notes étaient là.
 *
 * Toute modification de la règle se fait ici, et nulle part ailleurs.
 * ---------------------------------------------------------------------
 *
 * La règle, telle qu'elle se tient dans un cahier malien :
 *
 *   Chaque matière est notée sur 10.
 *   Total   = somme des notes.
 *   Moyenne = Total ÷ nombre de MATIÈRES — pas de notes saisies.
 *   Une case vide compte pour 0, et tire donc la moyenne vers le bas.
 *   Aucun coefficient : toutes les matières pèsent pareil.
 *   Rang = classement sur la moyenne, ex æquo au même rang.
 *
 * Le second cycle et le lycée gardent leur calcul pondéré, ailleurs.
 */

/** Toute note du premier cycle est sur 10. */
export const NOTE_MAX = 10

/**
 * Total des notes d'un élève, une case vide comptant 0.
 *
 * `notes` porte une entrée par MATIÈRE de la classe, `null` là où rien
 * n'a été saisi — c'est ce qui fait entrer les cases vides dans le
 * calcul plutôt que de les ignorer.
 */
export function total(notes: (number | null)[]): number {
  return notes.reduce<number>((somme, note) => somme + (note ?? 0), 0)
}

/**
 * Moyenne simple sur 10.
 *
 * Renvoie `null` quand la classe n'a aucune matière : diviser par zéro
 * afficherait « NaN », et « pas encore de matière » n'est pas « 0 ».
 */
export function moyenne(notes: (number | null)[]): number | null {
  if (notes.length === 0) {
    return null
  }

  return total(notes) / notes.length
}

/**
 * Rangs d'une classe, ex æquo au même rang.
 *
 * Deux moyennes égales partagent le rang, et le rang suivant saute
 * d'autant — c'est le classement usuel d'un bulletin.
 *
 * Les moyennes sont comparées arrondies au centième : sans cela, deux
 * élèves affichés « 7,50 » se verraient attribuer des rangs différents
 * pour une différence invisible à l'écran.
 */
export function rangs<T>(
  lignes: T[],
  moyenneDe: (ligne: T) => number | null
): Map<T, number | null> {
  const classement = [...lignes].sort(
    (a, b) => (moyenneDe(b) ?? -1) - (moyenneDe(a) ?? -1)
  )

  const table = new Map<T, number | null>()

  let rangCourant = 0
  let precedente: number | null = null

  classement.forEach((ligne, index) => {
    const valeur = moyenneDe(ligne)

    if (valeur === null) {
      table.set(ligne, null)
      return
    }

    const arrondie = Number(valeur.toFixed(2))

    if (precedente === null || arrondie !== precedente) {
      rangCourant = index + 1
    }

    table.set(ligne, rangCourant)
    precedente = arrondie
  })

  return table
}

/** Le cycle décide de la règle ; il n'y a pas d'autre critère. */
export function estPremierCycle(cycle: unknown): boolean {
  return cycle === "premier_cycle"
}

/**
 * Titre de l'évaluation qui porte une colonne de grille.
 *
 * La grille n'est pas une nouvelle table : chaque colonne est une
 * évaluation ordinaire du couple (classe, matière, période), sur 10. Ce
 * titre la rend reconnaissable dans la page Évaluations, où elle
 * apparaît comme n'importe quelle composition.
 */
export function titreEvaluation(nomPeriode: string): string {
  return `Composition — ${nomPeriode}`
}
