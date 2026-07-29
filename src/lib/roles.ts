/*
 * Ce que chaque rôle a le droit de faire, côté écran.
 *
 * ---------------------------------------------------------------------
 * CE FICHIER NE PROTÈGE RIEN.
 *
 * La sécurité est dans les policies RLS (supabase/rls-roles.sql), et
 * elle seule fait foi : un menu se contourne en tapant l'adresse. Ce qui
 * est ici sert à ne pas proposer une action qui sera refusée — un
 * formulaire qui échoue est pire qu'un formulaire absent.
 *
 * Toute règle ajoutée ici doit avoir sa contrepartie dans le SQL.
 * ---------------------------------------------------------------------
 */

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  promoteur: "Promoteur",
  directeur_general: "Directeur général",
  directeur_direction: "Directeur de direction",
  teacher: "Enseignant",
  comptable: "Comptable",
  surveillant: "Surveillant",
}

/** Tient la vie scolaire : retards, thèmes au rang, rappels. */
export const VIE_SCOLAIRE = ["admin", "promoteur", "directeur_general",
  "directeur_direction", "surveillant"]

/** Direction générale : vue d'ensemble de l'établissement. */
const DIRECTION_GENERALE = ["admin", "promoteur", "directeur_general"]

/** Encadrement : direction générale + directeur d'une direction. */
const ENCADREMENT = [...DIRECTION_GENERALE, "directeur_direction"]

export type Permission =
  /** Voir les frais, les paiements, les montants de référence. */
  | "finances.voir"
  /** Créer un frais, enregistrer un paiement. */
  | "finances.saisir"
  /** Inscrire, modifier ou supprimer un élève. */
  | "eleves.gerer"
  /** Créer classes, matières, années, affectations. */
  | "structure.gerer"
  /** Gérer les comptes enseignants. */
  | "enseignants.gerer"
  /** Saisir et corriger les notes. */
  | "notes.saisir"
  /** Consulter le journal d'activité. */
  | "activite.consulter"
  /** Modifier les paramètres de l'établissement. */
  | "parametres.gerer"
  /** Noter les retards, poser les thèmes au rang et les rappels. */
  | "vie_scolaire.tenir"

const PERMISSIONS: Record<Permission, string[]> = {
  // Le directeur général en est volontairement exclu.
  "finances.voir": ["admin", "promoteur", "comptable"],
  // Le promoteur voit sans écrire : il ne change pas les montants en
  // cours de route.
  "finances.saisir": ["admin", "comptable"],
  "eleves.gerer": ENCADREMENT,
  "structure.gerer": ENCADREMENT,
  "enseignants.gerer": ENCADREMENT,
  // La note appartient à l'enseignant qui l'a donnée. Les directeurs et
  // le promoteur la lisent et l'impriment, ils ne la modifient pas.
  // L'admin fait exception : c'est le compte qui répare.
  "notes.saisir": ["admin", "teacher"],
  /*
   * Le directeur général y a droit lui aussi, mais le RLS lui retire
   * les lignes financières — il voit passer les notes, les élèves et
   * les comptes, jamais un montant.
   */
  "activite.consulter": DIRECTION_GENERALE,
  "parametres.gerer": ["admin"],
  "vie_scolaire.tenir": VIE_SCOLAIRE,
}

export function can(role: string | null | undefined, permission: Permission) {
  return PERMISSIONS[permission].includes(role ?? "")
}

export function isDirectionGenerale(role: string | null | undefined) {
  return DIRECTION_GENERALE.includes(role ?? "")
}

export function isEncadrement(role: string | null | undefined) {
  return ENCADREMENT.includes(role ?? "")
}

export function roleLabel(role: string | null | undefined) {
  return ROLE_LABELS[role ?? ""] ?? "Rôle inconnu"
}

/*
 * Les entrées du menu, et qui les voit.
 *
 * L'enseignant ne voit ni « Élèves » ni « Classes » comme pages de
 * gestion : le RLS ne lui montrerait que sa classe, mais avec des
 * boutons de création qui échoueraient. Il accède à ses élèves par
 * Notes, Moyennes et Bulletins.
 */
export type NavItem = { label: string; path: string; roles: string[] }

const PEDAGOGIE = [...ENCADREMENT, "teacher"]

/*
 * Les statistiques sont ouvertes à tous, y compris au comptable et au
 * surveillant : elles ne portent que des moyennes agrégées, jamais une
 * note nominative. C'est la raison d'être des fonctions stats_* en base,
 * qui ne rendent rien d'autre que des agrégats.
 */
const TOUS = [...PEDAGOGIE, "comptable", "surveillant"]

export const NAV_ITEMS: NavItem[] = [
  { label: "Tableau de bord", path: "/dashboard", roles: TOUS },
  { label: "Statistiques", path: "/statistics", roles: TOUS },
  { label: "Vie scolaire", path: "/supervision", roles: VIE_SCOLAIRE },
  { label: "Élèves", path: "/students", roles: ENCADREMENT },
  { label: "Cartes scolaires", path: "/id-cards", roles: ENCADREMENT },
  { label: "Enseignants", path: "/teachers", roles: ENCADREMENT },
  { label: "Classes", path: "/classes", roles: ENCADREMENT },
  { label: "Directions", path: "/directions", roles: DIRECTION_GENERALE },
  { label: "Matières", path: "/subjects", roles: DIRECTION_GENERALE },
  { label: "Classes / Matières", path: "/class_subjects", roles: ENCADREMENT },
  { label: "Année scolaire", path: "/academic", roles: DIRECTION_GENERALE },
  { label: "Emploi du temps", path: "/timetable", roles: PEDAGOGIE },
  { label: "Évaluations", path: "/assessments", roles: PEDAGOGIE },
  { label: "Notes", path: "/grades", roles: PEDAGOGIE },
  { label: "Moyennes", path: "/averages", roles: PEDAGOGIE },
  { label: "Bulletins", path: "/report-card", roles: PEDAGOGIE },
  { label: "Présences", path: "/attendance", roles: PEDAGOGIE },
  { label: "Frais scolaires", path: "/fees", roles: ["admin", "promoteur", "comptable"] },
  { label: "Activité", path: "/activity", roles: DIRECTION_GENERALE },
  { label: "Comptes utilisateurs", path: "/users", roles: DIRECTION_GENERALE },
  { label: "Paramètres", path: "/settings", roles: ["admin"] },
]
