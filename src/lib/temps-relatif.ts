/*
 * « il y a trois jours » plutôt que « 04/08/2026 ».
 *
 * Une date absolue oblige à faire la soustraction de tête, et c'est
 * justement l'écart qui porte l'information : un code remis hier et
 * jamais ouvert est normal ; le même remis il y a deux mois est un
 * papier qui n'est jamais arrivé.
 *
 * Pas de dépendance ajoutée pour ça. Intl.RelativeTimeFormat existe dans
 * tous les navigateurs visés, mais il rend « il y a 45 jours » là où une
 * personne dit « il y a un mois et demi » — et surtout il ne connaît pas
 * « aujourd'hui » ni « hier », qui sont les deux cas les plus fréquents.
 */

/** Nombre de jours pleins écoulés depuis une date ISO. */
export function joursDepuis(iso: string) {
  const alors = new Date(iso).getTime()

  if (Number.isNaN(alors)) {
    return null
  }

  /*
   * On compare des JOURS calendaires, pas des tranches de 24 heures.
   * Sans cela, une ouverture hier soir à 23 h deviendrait « aujourd'hui »
   * ce matin à 8 h — ce qui est faux pour qui lit l'écran.
   */
  const aJour = (valeur: number) => {
    const d = new Date(valeur)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }

  const ecart = aJour(Date.now()) - aJour(alors)

  return Math.round(ecart / 86_400_000)
}

/**
 * L'écart, dit comme on le dit — « aujourd'hui », « hier »,
 * « il y a 3 jours », « il y a 2 semaines », « il y a 3 mois ».
 *
 * Les paliers ne sont pas décoratifs : au-delà d'une quinzaine, personne
 * ne compte plus en jours, et « il y a 47 jours » demande un effort que
 * « il y a un mois et demi » n'exige pas.
 */
export function ilYA(iso: string) {
  const jours = joursDepuis(iso)

  if (jours === null) {
    return "date inconnue"
  }

  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return "hier"
  if (jours < 14) return `il y a ${jours} jours`

  if (jours < 60) {
    const semaines = Math.round(jours / 7)
    return `il y a ${semaines} semaines`
  }

  const mois = Math.round(jours / 30)

  if (mois < 18) {
    return `il y a ${mois} mois`
  }

  const annees = Math.round(jours / 365)

  return annees <= 1 ? "il y a un an" : `il y a ${annees} ans`
}
