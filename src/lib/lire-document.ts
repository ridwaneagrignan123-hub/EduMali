import * as XLSX from "xlsx"

/*
 * Ramener un fichier à du TEXTE, d'où qu'il vienne.
 *
 * =====================================================================
 * QUATRE FORMATS, UN SEUL DÉCOUPAGE
 * =====================================================================
 *
 *   .txt / .md  ... lus tels quels
 *   .csv / .xlsx ... chaque cellule non vide devient une ligne
 *   .docx        ... le texte des paragraphes du document
 *
 * Tous rendent une chaîne, que `decouperReglement()` traite ensuite de
 * la même façon. Une école qui tient son règlement dans un tableur et
 * une autre qui le tient dans Word suivent le même chemin.
 *
 * LE `.doc` ANCIEN FORMAT N'EST PAS LU. C'est un format binaire
 * propriétaire, qui demanderait une bibliothèque entière pour un gain
 * nul : « Enregistrer sous → .docx » prend dix secondes. On le REFUSE
 * en le nommant, plutôt que de rendre du charabia que l'utilisateur
 * essaierait de corriger à la main.
 */

/** Ce que l'appelant doit dire à l'utilisateur si le format est refusé. */
export class FormatNonLu extends Error {}

const TAILLE_MAX = 5 * 1024 * 1024

export async function lireCommeTexte(fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX) {
    throw new FormatNonLu(
      "Ce fichier dépasse 5 Mo. Un règlement intérieur tient largement en dessous : vérifiez qu'il ne contient pas d'images."
    )
  }

  const nom = fichier.name.toLowerCase()

  if (nom.endsWith(".doc")) {
    throw new FormatNonLu(
      "L'ancien format Word (.doc) n'est pas lu. Ouvrez le fichier dans Word et enregistrez-le en .docx, ou copiez son texte dans un fichier .txt."
    )
  }

  if (nom.endsWith(".docx")) {
    return lireDocx(fichier)
  }

  if (nom.endsWith(".xlsx") || nom.endsWith(".xls") || nom.endsWith(".csv")) {
    return lireTableur(fichier)
  }

  // Tout le reste est tenté comme du texte : un règlement copié dans un
  // fichier sans extension reste lisible, et refuser serait gratuit.
  return fichier.text()
}

/*
 * LE TABLEUR : une cellule non vide, une ligne.
 *
 * On lit TOUTES les feuilles, contrairement à l'import d'élèves qui n'en
 * lit qu'une : un règlement se répartit parfois en « Discipline »,
 * « Tenue », « Retards ». Les ignorer perdrait silencieusement des
 * articles.
 */
async function lireTableur(fichier: File) {
  const donnees = await fichier.arrayBuffer()
  const classeur = XLSX.read(donnees, { type: "array" })

  const lignes: string[] = []

  for (const nom of classeur.SheetNames) {
    const feuille = classeur.Sheets[nom]

    /*
     * `header: 1` fait rendre des RANGÉES, non des objets : chaque
     * élément est un tableau de cellules brutes.
     *
     * Le type est écrit ici plutôt que laissé à l'inférence. SheetJS
     * expose plusieurs surcharges de `sheet_to_json`, et selon celle que
     * le compilateur retient, l'élément de rangée peut retomber en `any`
     * implicite — ce que `noImplicitAny` refuse. L'annoter coupe court à
     * cette dépendance.
     */
    const grille: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
      header: 1,
      blankrows: false,
    })

    for (const rangee of grille) {
      const cellules = (rangee ?? [])
        .map((cellule: unknown) => String(cellule ?? "").trim())
        .filter(Boolean)

      if (cellules.length > 0) {
        // Deux colonnes se lisent souvent « titre | texte » : on les
        // recolle par un tiret, ce que le découpage saura reprendre.
        lignes.push(cellules.join(" — "))
      }
    }
  }

  return lignes.join("\n")
}

/*
 * LE .docx : un ZIP dont `word/document.xml` porte le texte.
 *
 * On le lit sans bibliothèque, avec `DecompressionStream` — présent dans
 * les navigateurs modernes. Ajouter une dépendance de plusieurs centaines
 * de kilo-octets pour extraire un seul fichier d'une archive ne se
 * justifierait pas dans une application qui doit s'ouvrir sur un
 * téléphone en 3G.
 */
async function lireDocx(fichier: File) {
  const octets = new Uint8Array(await fichier.arrayBuffer())
  const xml = await extraireDuZip(octets, "word/document.xml")

  if (!xml) {
    throw new FormatNonLu(
      "Ce fichier .docx n'a pas pu être ouvert. Copiez son texte dans un fichier .txt et réessayez."
    )
  }

  /*
   * On ne fait pas d'analyse XML : les balises de Word sont innombrables
   * et changent d'une version à l'autre. Deux règles suffisent — une fin
   * de paragraphe devient un saut de ligne, tout le reste des balises
   * disparaît.
   */
  return xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Extrait un fichier d'une archive ZIP, par son nom.
 *
 * On passe par le RÉPERTOIRE CENTRAL, en fin d'archive, et non par les
 * entêtes locaux : ceux-ci peuvent annoncer une taille nulle et renvoyer
 * à un descripteur placé après les données, ce qui oblige à deviner où
 * l'entrée s'arrête. Le répertoire central, lui, porte toujours les
 * tailles justes.
 */
async function extraireDuZip(octets: Uint8Array, cible: string) {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)

  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la
  // fin (le commentaire d'archive, facultatif, la suit).
  let finRepertoire = -1

  for (let i = octets.length - 22; i >= 0 && i > octets.length - 65558; i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      finRepertoire = i
      break
    }
  }

  if (finRepertoire < 0) {
    return null
  }

  const nombre = vue.getUint16(finRepertoire + 10, true)
  let position = vue.getUint32(finRepertoire + 16, true)

  const decodeur = new TextDecoder()

  for (let entree = 0; entree < nombre; entree++) {
    if (vue.getUint32(position, true) !== 0x02014b50) {
      return null
    }

    const compression = vue.getUint16(position + 10, true)
    const tailleCompressee = vue.getUint32(position + 20, true)
    const longueurNom = vue.getUint16(position + 28, true)
    const longueurExtra = vue.getUint16(position + 30, true)
    const longueurCommentaire = vue.getUint16(position + 32, true)
    const decalageLocal = vue.getUint32(position + 42, true)

    const nom = decodeur.decode(
      octets.subarray(position + 46, position + 46 + longueurNom)
    )

    if (nom === cible) {
      // L'entête local porte ses propres longueurs de nom et d'extra,
      // qui diffèrent de celles du répertoire central.
      const nomLocal = vue.getUint16(decalageLocal + 26, true)
      const extraLocal = vue.getUint16(decalageLocal + 28, true)
      const debut = decalageLocal + 30 + nomLocal + extraLocal

      const donnees = octets.subarray(debut, debut + tailleCompressee)

      if (compression === 0) {
        return decodeur.decode(donnees)
      }

      if (compression !== 8) {
        return null
      }

      const flux = new Blob([donnees as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))

      return new TextDecoder().decode(
        new Uint8Array(await new Response(flux).arrayBuffer())
      )
    }

    position += 46 + longueurNom + longueurExtra + longueurCommentaire
  }

  return null
}
