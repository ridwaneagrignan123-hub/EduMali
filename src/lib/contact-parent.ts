/*
 * Le numéro du parent — la seule coordonnée par laquelle l'école joint
 * une famille.
 *
 * Cette règle vit ici, et pas dans l'adaptateur WhatsApp : celui-ci lit
 * un jeton d'API et ne doit jamais être importé par un écran. La
 * validation, elle, doit tourner des deux côtés — au moment de la saisie
 * pour prévenir tout de suite, et au moment de l'envoi parce que c'est
 * là qu'elle engage.
 */

/** Un numéro malien en compte 8 ; on refuse en deçà. */
export const MIN_CHIFFRES = 8

export function compterChiffres(valeur: string) {
  return valeur.replace(/\D/g, "").length
}

export function numeroParentValide(valeur: string | null | undefined) {
  return compterChiffres(valeur ?? "") >= MIN_CHIFFRES
}

/**
 * Le reproche à afficher, ou `null` si le numéro convient.
 *
 * Un numéro vide n'est PAS une erreur : tous les parents n'en ont pas, et
 * bloquer l'inscription d'un élève pour cela serait absurde. C'est au
 * moment d'écrire à la famille que l'absence devient bloquante — et
 * l'écran le dit alors nommément.
 */
export function reprocheNumeroParent(valeur: string) {
  const propre = valeur.trim()

  if (!propre) {
    return null
  }

  if (compterChiffres(propre) < MIN_CHIFFRES) {
    return `Le numéro du parent doit comporter au moins ${MIN_CHIFFRES} chiffres.`
  }

  return null
}

/**
 * Ramène un numéro saisi localement — « 76 12 34 56 » — au format
 * international, seul routable par une passerelle.
 */
export function normaliserNumeroMalien(phone: string) {
  const propre = phone.trim().replace(/[\s-]/g, "")

  if (propre.startsWith("+")) {
    return propre
  }

  if (propre.startsWith("00")) {
    return `+${propre.slice(2)}`
  }

  return `+223${propre.replace(/^0+/, "")}`
}
