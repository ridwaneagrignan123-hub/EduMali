/*
 * Mise en forme des noms de personnes, à l'enregistrement.
 *
 * L'usage scolaire malien — et francophone en général — écrit le NOM en
 * majuscules et le Prénom en capitale initiale. Le faire à la saisie
 * évite un fichier où « traoré », « Traoré » et « TRAORE » désignent la
 * même famille sans se ressembler, et où un tri alphabétique mélange
 * les trois.
 *
 * La mise en forme est appliquée à l'ENREGISTREMENT, pas à l'affichage :
 * ce qui est en base est ce qui s'imprime sur un bulletin, et deux
 * écrans qui mettraient en forme différemment finiraient par diverger.
 */

/*
 * Séparateurs à l'intérieur d'un prénom composé. On coupe dessus, mais
 * on les CONSERVE : « jean-pierre » doit rendre « Jean-Pierre », pas
 * « Jean Pierre ». D'où la parenthèse capturante.
 *
 * L'apostrophe droite et l'apostrophe typographique sont traitées toutes
 * deux : les claviers produisent l'une ou l'autre selon le système, et
 * « n'na » comme « n’na » doivent donner « N'Na ».
 */
const SEPARATEURS = /([\s\-’'])/

/**
 * Prénom : capitale initiale à chaque mot, le reste en minuscules.
 *
 * `toLocaleUpperCase("fr")` plutôt que `toUpperCase()` : sur une chaîne
 * accentuée, la casse dépend de la locale, et « é » doit donner « É ».
 */
export function formaterPrenom(valeur: string): string {
  return valeur
    .trim()
    .split(SEPARATEURS)
    .map((morceau) => {
      // Les séparateurs capturés reviennent tels quels dans le tableau.
      if (!morceau || SEPARATEURS.test(morceau)) {
        return morceau
      }

      return (
        morceau.charAt(0).toLocaleUpperCase("fr") +
        morceau.slice(1).toLocaleLowerCase("fr")
      )
    })
    .join("")
    // Un double espace saisi ne doit pas survivre à la mise en forme.
    .replace(/\s+/g, " ")
}

/**
 * Nom : tout en majuscules, accents compris — « traoré » → « TRAORÉ ».
 */
export function formaterNom(valeur: string): string {
  return valeur.trim().toLocaleUpperCase("fr").replace(/\s+/g, " ")
}
