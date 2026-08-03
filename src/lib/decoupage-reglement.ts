/*
 * Découper un règlement intérieur en règles distinctes.
 *
 * =====================================================================
 * LE FORMAT RETENU : DU TEXTE, D'OÙ QU'IL VIENNE
 * =====================================================================
 *
 * `.txt`, `.csv`, `.xlsx`, `.docx` — tous ramenés à du texte, puis
 * découpés par la même fonction. Un seul découpage à comprendre, un seul
 * à corriger.
 *
 * Le `.doc` ancien format (Word 97) n'est PAS lu : c'est un format
 * binaire propriétaire qui demanderait une bibliothèque entière pour un
 * gain nul — enregistrer en .docx ou copier-coller dans un .txt prend dix
 * secondes. On le dit à l'écran plutôt que de rendre un charabia.
 *
 * =====================================================================
 * LE DÉCOUPAGE N'EST QU'UNE PROPOSITION
 * =====================================================================
 *
 * Aucune heuristique ne devinera juste sur tous les règlements du Mali.
 * Celle-ci vise le cas fréquent — « Article 5 : ... », des puces, des
 * lignes numérotées — et rend un découpage GROSSIER quand elle ne
 * reconnaît rien, plutôt que de refuser le fichier.
 *
 * C'est l'utilisateur qui tranche ensuite : il fusionne, sépare,
 * corrige, supprime. Un import qui n'offrirait que « tout ou rien »
 * obligerait à retoucher le fichier source et à recommencer.
 */

/** Une règle proposée, avant validation par l'utilisateur. */
export type RegleProposee = {
  /** Titre court — ce qui s'affiche dans les listes de sanctions. */
  label: string
  /** Le texte complet de l'article. */
  texte: string
}

/*
 * Les entêtes d'article reconnus. L'ordre compte : on essaie le plus
 * explicite d'abord.
 *
 *   « Article 5 : Tenue »   « Art. 5 - Tenue »   « 5. Tenue »
 *   « 5) Tenue »            « I. Tenue »         « - Tenue »
 */
const ENTETE_ARTICLE =
  /^\s*(?:article|art\.?)\s*(\d+|[IVXLC]+)\s*[:.)\-–—]?\s*(.*)$/i

const ENTETE_NUMEROTE = /^\s*(\d{1,3})\s*[.)\-–—]\s*(.+)$/

const ENTETE_ROMAIN = /^\s*([IVXLC]{1,6})\s*[.)\-–—]\s*(.+)$/

const PUCE = /^\s*[-–—•*·]\s*(.+)$/

/** Coupe un titre trop long : un libellé de liste doit rester lisible. */
const LONGUEUR_LIBELLE = 80

function raccourcir(texte: string) {
  const propre = texte.replace(/\s+/g, " ").trim()

  if (propre.length <= LONGUEUR_LIBELLE) {
    return propre
  }

  /*
   * On coupe au dernier espace avant la limite, pas au caractère : un
   * libellé tronqué en plein mot se lit mal et se cherche mal.
   */
  const tronque = propre.slice(0, LONGUEUR_LIBELLE)
  const espace = tronque.lastIndexOf(" ")

  return `${espace > 40 ? tronque.slice(0, espace) : tronque}…`
}

/**
 * Découpe un texte en règles.
 *
 * Trois passes, de la plus fiable à la plus grossière — on s'arrête à la
 * première qui donne au moins deux règles :
 *
 *   1. les entêtes d'article explicites ;
 *   2. les paragraphes séparés par une ligne vide ;
 *   3. une règle par ligne non vide.
 *
 * Le seuil de DEUX est délibéré : une seule règle détectée signifie que
 * l'heuristique n'a rien reconnu, pas qu'un règlement tient en un
 * article.
 */
export function decouperReglement(texte: string): RegleProposee[] {
  const lignes = texte
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((ligne) => ligne.trimEnd())

  // ---- Passe 1 : les entêtes d'article ------------------------------
  const parArticles: RegleProposee[] = []
  let courante: { titre: string; corps: string[] } | null = null

  for (const ligne of lignes) {
    const article = ENTETE_ARTICLE.exec(ligne)
    const numerote = !article ? ENTETE_NUMEROTE.exec(ligne) : null
    const romain = !article && !numerote ? ENTETE_ROMAIN.exec(ligne) : null

    const entete = article ?? numerote ?? romain

    if (entete) {
      if (courante) {
        parArticles.push(assembler(courante))
      }

      const suite = (entete[2] ?? "").trim()

      courante = {
        titre: suite || `Article ${entete[1]}`,
        corps: suite ? [] : [],
      }

      continue
    }

    if (courante && ligne.trim()) {
      courante.corps.push(ligne.trim())
    }
  }

  if (courante) {
    parArticles.push(assembler(courante))
  }

  if (parArticles.length >= 2) {
    return parArticles
  }

  // ---- Passe 2 : les paragraphes ------------------------------------
  const paragraphes = texte
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((bloc) => bloc.trim())
    .filter(Boolean)

  if (paragraphes.length >= 2) {
    return paragraphes.map((bloc) => ({
      label: raccourcir(premiereLigne(bloc)),
      texte: bloc.replace(/\s*\n\s*/g, " ").trim(),
    }))
  }

  // ---- Passe 3 : une règle par ligne --------------------------------
  return lignes
    .map((ligne) => {
      const puce = PUCE.exec(ligne)
      return (puce ? puce[1] : ligne).trim()
    })
    .filter(Boolean)
    .map((ligne) => ({ label: raccourcir(ligne), texte: ligne }))
}

function premiereLigne(bloc: string) {
  return bloc.split("\n")[0] ?? bloc
}

function assembler(brut: { titre: string; corps: string[] }): RegleProposee {
  const corps = brut.corps.join(" ").trim()

  return {
    label: raccourcir(brut.titre),
    // Un article réduit à son titre garde ce titre pour texte : mieux
    // vaut une règle courte qu'une règle vide.
    texte: corps ? `${brut.titre} ${corps}`.trim() : brut.titre,
  }
}

/** Fusionne deux règles voisines — l'utilisateur corrige un découpage trop fin. */
export function fusionner(regles: RegleProposee[], index: number) {
  if (index < 0 || index >= regles.length - 1) {
    return regles
  }

  const a = regles[index]
  const b = regles[index + 1]

  const fusionnee: RegleProposee = {
    label: a.label,
    texte: `${a.texte} ${b.texte}`.trim(),
  }

  return [...regles.slice(0, index), fusionnee, ...regles.slice(index + 2)]
}

/**
 * Sépare une règle en deux, à la position donnée dans son texte.
 *
 * L'inverse de `fusionner()` : un découpage trop grossier se rattrape
 * sans repasser par le fichier.
 */
export function separer(
  regles: RegleProposee[],
  index: number,
  position: number
) {
  const regle = regles[index]

  if (!regle || position <= 0 || position >= regle.texte.length) {
    return regles
  }

  const debut = regle.texte.slice(0, position).trim()
  const fin = regle.texte.slice(position).trim()

  if (!debut || !fin) {
    return regles
  }

  return [
    ...regles.slice(0, index),
    { label: raccourcir(debut), texte: debut },
    { label: raccourcir(fin), texte: fin },
    ...regles.slice(index + 1),
  ]
}
