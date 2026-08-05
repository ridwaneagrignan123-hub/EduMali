import { createClient } from "@supabase/supabase-js"

/*
 * Le catalogue des annales et des exercices corrigés.
 *
 * =====================================================================
 * LU SANS COMPTE, ET DONC LU CÔTÉ SERVEUR
 * =====================================================================
 *
 * La lecture se fait avec la CLÉ ANONYME, celle qui est déjà publique
 * dans le paquet du navigateur — rien de secret ne passe ici. Elle est
 * faite côté serveur quand même, pour deux raisons :
 *
 *   la page arrive REMPLIE, sans passe de chargement. Sur un téléphone
 *   en 3G, un catalogue qui s'affiche après deux secondes de vide est un
 *   catalogue qu'on quitte ;
 *
 *   le filtrage se fait ensuite en mémoire, dans le navigateur. Le
 *   catalogue tient en quelques centaines d'entrées : le trier
 *   localement est instantané, là où un aller-retour par filtre
 *   rajouterait une seconde à chaque clic.
 *
 * Le jour où le catalogue dépassera le millier d'entrées, ce choix
 * s'inversera — c'est le seuil à surveiller, pas une vérité éternelle.
 */

export type Ressource = {
  id: string
  kind: "annale" | "exercice"
  exam: string
  country: string | null
  serie: string | null
  subject: string
  year: number | null
  title: string
  file_url: string | null
  correction_file_url: string | null
  link_url: string | null
  source_name: string | null
}

/*
 * Les examens de la région. Le libellé est développé : « DEF » ne dit
 * rien à un élève sénégalais, et « BEPC » rien à un élève malien.
 */
export const EXAMENS: { code: string; libelle: string }[] = [
  { code: "DEF", libelle: "DEF — fin du second cycle" },
  { code: "BEPC", libelle: "BEPC — fin du second cycle" },
  { code: "BAC", libelle: "BAC — fin du lycée" },
  { code: "CEP", libelle: "CEP — fin du premier cycle" },
]

/*
 * Les seize pays, dans l'ordre de la carte de la page d'accueil :
 * d'ouest en est. Un ordre alphabétique mettrait le Bénin avant le
 * Burkina et le Cap-Vert, ce qui ne correspond à rien de géographique.
 */
export const PAYS: Record<string, string> = {
  CPV: "Cap-Vert",
  MRT: "Mauritanie",
  SEN: "Sénégal",
  GMB: "Gambie",
  GNB: "Guinée-Bissau",
  GIN: "Guinée",
  SLE: "Sierra Leone",
  LBR: "Liberia",
  CIV: "Côte d'Ivoire",
  MLI: "Mali",
  BFA: "Burkina Faso",
  GHA: "Ghana",
  TGO: "Togo",
  BEN: "Bénin",
  NER: "Niger",
  NGA: "Nigeria",
}

/** Le lien qu'ouvre le bouton principal : le fichier s'il existe, sinon la source. */
export function lienDuSujet(ressource: Ressource) {
  return ressource.file_url ?? ressource.link_url
}

/**
 * Ce qui distingue une entrée d'une autre dans les yeux de l'élève.
 * Sert au tri et à la recherche libre.
 */
export function texteCherchable(ressource: Ressource) {
  return [
    ressource.title,
    ressource.subject,
    ressource.exam,
    ressource.serie,
    ressource.year?.toString(),
    ressource.country ? PAYS[ressource.country] : "Afrique de l'Ouest",
    ressource.source_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

/**
 * Lit le catalogue actif.
 *
 * Rend un TABLEAU VIDE en cas d'erreur, jamais une exception : une page
 * publique qui plante parce que la base tousse est pire qu'une page qui
 * dit « rien pour l'instant ». L'erreur est journalisée côté serveur,
 * où l'exploitant la verra.
 */
export async function lireCatalogue(): Promise<Ressource[]> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await client
    .from("exam_resources")
    .select(
      "id, kind, exam, country, serie, subject, year, title, file_url, correction_file_url, link_url, source_name"
    )
    .eq("is_active", true)
    .order("year", { ascending: false, nullsFirst: false })
    .order("subject", { ascending: true })

  if (error) {
    console.error("Lecture du catalogue d'annales :", error)
    return []
  }

  return (data ?? []) as Ressource[]
}
