/*
 * Ce que chaque rôle a le droit de faire.
 *
 * ---------------------------------------------------------------------
 * OÙ CETTE MATRICE FAIT FOI, ET OÙ ELLE NE FAIT PAS FOI
 *
 * Sur les TABLES, la sécurité est dans les policies RLS
 * (supabase/rls-roles.sql), et elle seule compte : un menu se contourne
 * en tapant l'adresse.
 *
 * Sur les ROUTES SERVEUR, en revanche, cette matrice fait foi. Les
 * routes sous app/api/ écrivent avec la clé service role, qui contourne
 * le RLS : leur seule barrière est requirePermission() dans
 * src/lib/apiAuth.ts, qui interroge PERMISSIONS ci-dessous. Une
 * permission élargie ici ouvre réellement l'accès.
 *
 * Enfin, can() sert aussi à l'écran, pour ne pas proposer un bouton qui
 * renverra 403. Cet usage-là ne protège rien.
 * ---------------------------------------------------------------------
 *
 * LE MODÈLE, EN UNE PHRASE PAR RÔLE
 *
 *   promoteur ........... propriétaire. VOIT tout, N'ÉCRIT RIEN, sauf
 *                         nommer le directeur général, nommer le
 *                         comptable, et ouvrir ou fermer la
 *                         comptabilité au directeur général.
 *   directeur_general ... nomme les directeurs, tient la structure
 *                         commune (matières, année scolaire, périodes,
 *                         directions, paramètres). Ne touche pas au
 *                         travail pédagogique des directions.
 *   directeur_direction . sa direction et rien d'autre : ses classes,
 *                         ses élèves, ses enseignants, son emploi du
 *                         temps. Les directeurs sont PAIRS.
 *   comptable ........... la comptabilité, et elle seule.
 *   surveillant ......... la surveillance de son cycle.
 *   teacher ............. ses classes, ses créneaux.
 *
 * « admin » N'EXISTE PLUS. C'était le propriétaire de l'école sous un
 * autre nom : ses comptes sont devenus `promoteur`, et ses écritures
 * ont été reventilées vers le rôle qui fait le travail. Le compte qui
 * répare n'est plus un rôle d'école : c'est l'exploitant de la
 * plateforme, table `platform_operators`, hors de cette matrice.
 */

export const ROLE_LABELS: Record<string, string> = {
  promoteur: "Promoteur",
  directeur_general: "Directeur général",
  directeur_direction: "Directeur de direction",
  teacher: "Enseignant",
  comptable: "Comptable",
  surveillant: "Surveillant",
  surveillant_general: "Surveillant général",
}

/*
 * La SURVEILLANCE : retards, retenues, violations du règlement, thèmes
 * au rang, rappels. Anciennement « vie scolaire ».
 *
 * L'enseignant y figure en LECTURE SEULE, borné à ses propres élèves
 * par le RLS : il voit ce qui est reproché à sa classe sans pouvoir
 * poser lui-même une retenue. Poser une sanction est un acte de la
 * surveillance, pas de l'enseignement.
 */
export const SURVEILLANCE = ["promoteur", "directeur_general",
  "directeur_direction", "surveillant", "surveillant_general", "teacher"]

/** Direction générale : vue d'ensemble de l'établissement. */
const DIRECTION_GENERALE = ["promoteur", "directeur_general"]

/** Encadrement : direction générale + directeur d'une direction. */
const ENCADREMENT = [...DIRECTION_GENERALE, "directeur_direction"]

/*
 * L'encadrement QUI ÉCRIT — le même, moins le promoteur.
 *
 * Le promoteur reste dans ENCADREMENT parce qu'il voit tout. Il doit
 * disparaître de chaque écriture. Deux listes jumelles plutôt qu'une
 * seule avec des exceptions dispersées : c'est le pendant exact des
 * fonctions `private.encadrement_ecrit()` et `private.dg_ecrit()` en
 * base, et l'on peut vérifier d'un coup d'œil qu'aucune écriture ne
 * nomme le promoteur.
 *
 * Côté écran, le pendant tient en deux listes : DG_ECRIT pour ce qui
 * est commun à l'école, DIRECTEUR_ECRIT pour ce qui appartient à une
 * direction.
 */
const DG_ECRIT = ["directeur_general"]
const DIRECTEUR_ECRIT = ["directeur_direction"]

export type Permission =
  /** Voir les frais, les paiements, les montants de référence. */
  | "finances.voir"
  /** Créer un frais, enregistrer un paiement. */
  | "finances.saisir"
  /** Ouvrir ou fermer la comptabilité au directeur général. */
  | "comptabilite.autoriser_dg"
  /** Inscrire, modifier ou supprimer un élève. */
  | "eleves.gerer"
  /** Matières, années scolaires, périodes, directions — toute l'école. */
  | "structure.ecole"
  /** Classes, affectations, emploi du temps — dans sa direction. */
  | "classes.gerer"
  /** Gérer les fiches enseignants. */
  | "enseignants.gerer"
  /** Saisir et corriger les notes. */
  | "notes.saisir"
  /** Consulter le journal d'activité. */
  | "activite.consulter"
  /** Modifier les paramètres de l'établissement. */
  | "parametres.gerer"
  /** Poser retards, retenues, violations, thèmes au rang et rappels. */
  | "surveillance.tenir"
  /** Voir la liste des comptes de l'établissement. */
  | "comptes.consulter"
  /** Modifier l'identité d'un compte et lui renvoyer un lien d'accès. */
  | "comptes.gerer"

const PERMISSIONS: Record<Permission, string[]> = {
  /*
   * Le promoteur CONSULTE la comptabilité, il n'y saisit jamais : il ne
   * change pas les montants en cours de route. Le directeur général n'y
   * est pas non plus — il n'y entre que si le promoteur l'y autorise,
   * école par école, ce qu'une liste figée ne peut pas exprimer. Voir
   * peutVoirComptabilite() plus bas.
   */
  "finances.voir": ["promoteur", "comptable"],
  "finances.saisir": ["comptable"],
  "comptabilite.autoriser_dg": ["promoteur"],

  /*
   * L'élève appartient à une direction, et son directeur en est le seul
   * maître : c'est lui qui l'inscrit et qui corrige sa fiche. Le RLS
   * borne l'écriture à sa propre direction.
   */
  "eleves.gerer": DIRECTEUR_ECRIT,

  /*
   * La structure COMMUNE au directeur général : matières, année
   * scolaire, périodes, directions, paramètres. Les directeurs sont
   * pairs, donc aucun ne peut trancher pour les autres sur la date de
   * la rentrée ou le barème ; le promoteur, lui, n'écrit rien. Sans ce
   * rôle, personne ne pourrait ouvrir une année scolaire.
   */
  "structure.ecole": DG_ECRIT,
  "parametres.gerer": DG_ECRIT,

  // Les classes, en revanche, sont le travail du directeur : il crée
  // les siennes, y affecte les matières et compose son emploi du temps.
  "classes.gerer": DIRECTEUR_ECRIT,
  "enseignants.gerer": DIRECTEUR_ECRIT,

  /*
   * Qui saisit la note dépend de la CLASSE, pas seulement du rôle : le
   * directeur décide, classe par classe, si c'est l'enseignant ou
   * lui-même. Cette liste dit qui peut y prétendre ; peutNoterClasse()
   * tranche pour une classe donnée.
   */
  "notes.saisir": ["teacher", "directeur_direction"],

  /*
   * Le directeur général y a droit lui aussi, mais le RLS lui retire
   * les lignes financières tant que le promoteur ne les lui a pas
   * ouvertes.
   */
  "activite.consulter": DIRECTION_GENERALE,
  "surveillance.tenir": [
    "directeur_direction",
    "surveillant",
    "surveillant_general",
  ],

  /*
   * Les comptes, à granularité fine — et c'est délibéré.
   *
   * Consulter, renommer et renvoyer un lien d'accès sont des gestes
   * d'administration courante. Attribuer un rôle en est un autre : c'est
   * la seule opération de l'application qui donne du pouvoir à
   * quelqu'un. Les confondre reviendrait à laisser une secrétaire
   * nommer un directeur. La nomination a donc sa propre table, NOMINE.
   */
  "comptes.consulter": ENCADREMENT,

  /*
   * LE PROMOTEUR EST ICI, et il le faut : c'est par cette route que
   * passent la nomination du directeur général et celle du comptable —
   * ses deux seules écritures. L'en exclure les lui aurait retirées,
   * alors qu'elles sont la raison d'être de son rôle.
   *
   * Ce n'est pas un blanc-seing : NOMINE borne à DEUX rôles les comptes
   * sur lesquels il peut agir, et forbidRoleEscalation() le vérifie
   * aussi sur le rôle que la cible porte DÉJÀ. Il administre exactement
   * les deux comptes qu'il nomme, et aucun autre.
   */
  "comptes.gerer": ENCADREMENT,
}

/*
 * QUI NOMME QUI.
 *
 * Une table explicite plutôt que deux niveaux de permission : la
 * hiérarchie des nominations EST le modèle de rôles, et on doit pouvoir
 * la lire d'un trait.
 *
 * Le promoteur nomme le directeur général et le comptable — ses deux
 * seules écritures, avec l'accès du DG à la comptabilité. Le directeur
 * général nomme les directeurs et les surveillants. Chaque directeur
 * nomme ses enseignants.
 *
 * Personne ne nomme un promoteur : le propriétaire de l'école ne se
 * remplace pas depuis l'application. Cela se fait par l'exploitant de
 * la plateforme, hors de cette matrice.
 */
export const NOMINE: Record<string, string[]> = {
  promoteur: ["directeur_general", "comptable"],
  directeur_general: [
    "directeur_direction",
    "surveillant",
    "surveillant_general",
  ],
  directeur_direction: ["teacher"],
}

export function can(role: string | null | undefined, permission: Permission) {
  return PERMISSIONS[permission].includes(role ?? "")
}

/**
 * La comptabilité, y compris le cas qu'aucune liste figée ne peut
 * porter : le directeur général n'y entre que si le promoteur de SON
 * école l'y a autorisé (`schools.dg_voit_comptabilite`).
 *
 * C'est un droit de LECTURE. La saisie reste au comptable seul, quelle
 * que soit la valeur de l'interrupteur — `finances.saisir` ne le nomme
 * pas, et `private.can_write_money()` non plus en base.
 */
export function peutVoirComptabilite(
  role: string | null | undefined,
  dgAutorise: boolean | null | undefined
) {
  if (can(role, "finances.voir")) {
    return true
  }

  return role === "directeur_general" && dgAutorise === true
}

/**
 * Vrai si `role` a le droit d'attribuer `roleVise`, ou d'agir sur un
 * compte qui le porte déjà.
 *
 * Le rôle ACTUEL de la cible compte autant que celui qu'on veut lui
 * donner : rétrograder un directeur général est aussi une prise de
 * pouvoir que de nommer le sien.
 */
export function canAssignRole(
  role: string | null | undefined,
  roleVise: string | null | undefined
) {
  const nominables = NOMINE[role ?? ""] ?? []

  /*
   * Un compte fraîchement invité n'a pas encore de rôle. Le lui refuser
   * le rendrait ingérable par celui-là même qui vient de l'inviter :
   * quiconque nomme peut agir sur un compte sans rôle.
   */
  if (!roleVise) {
    return nominables.length > 0
  }

  return nominables.includes(roleVise)
}

/** Les rôles que `role` peut effectivement attribuer. */
export function assignableRoles(role: string | null | undefined) {
  return NOMINE[role ?? ""] ?? []
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
export type NavItem = {
  label: string
  path: string
  roles: string[]
  /** Vrai seulement pour l'entrée « Comptabilité » : le directeur
   *  général l'obtient par autorisation du promoteur, pas par son rôle. */
  suitAutorisationComptable?: boolean
}

const PEDAGOGIE = [...ENCADREMENT, "teacher"]

const SURVEILLANTS = ["surveillant", "surveillant_general"]

/*
 * LE COMPTABLE NE VOIT QUE TROIS CHOSES : la Comptabilité, les Classes
 * et la liste des Élèves. Rien d'autre.
 *
 * Les Classes et les Élèves ne sont pas un agrément : sans eux, il ne
 * peut rattacher ni un frais ni un paiement à qui que ce soit. Le RLS
 * lui donne d'ailleurs exactement ces lectures, et aucune donnée
 * pédagogique — ni note, ni évaluation, ni présence.
 *
 * Les STATISTIQUES lui sont retirées. Elles ne portent pourtant que des
 * agrégats, jamais une note nominative — mais « rien d'autre » veut dire
 * rien d'autre, et un écran de moyennes de classe n'est pas son métier.
 */
const COMPTABLE_VOIT = [...ENCADREMENT, "comptable"]

/*
 * Le tableau de bord reste ouvert à tous : c'est la page d'accueil, et
 * la retirer à quelqu'un le laisserait sans point d'entrée.
 */
const TOUS = [...PEDAGOGIE, "comptable", ...SURVEILLANTS]

/*
 * Les statistiques ne portent que des moyennes agrégées, jamais une note
 * nominative — c'est la raison d'être des fonctions stats_* en base. Le
 * surveillant y a donc droit ; le comptable, non (voir ci-dessus).
 */
const STATISTIQUES = [...PEDAGOGIE, ...SURVEILLANTS]

export const NAV_ITEMS: NavItem[] = [
  { label: "Tableau de bord", path: "/dashboard", roles: TOUS },
  { label: "Statistiques", path: "/statistics", roles: STATISTIQUES },
  { label: "Surveillance", path: "/supervision", roles: SURVEILLANCE },
  { label: "Élèves", path: "/students", roles: COMPTABLE_VOIT },
  /*
   * Le pic de ressaisie de l'année : réinscrire tout un effectif à la
   * rentrée. Mêmes rôles que la gestion des élèves.
   */
  { label: "Passage de classe", path: "/promotion", roles: ENCADREMENT },
  { label: "Cartes scolaires", path: "/id-cards", roles: ENCADREMENT },
  { label: "Enseignants", path: "/teachers", roles: ENCADREMENT },
  { label: "Classes", path: "/classes", roles: COMPTABLE_VOIT },
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
  /*
   * UNE SEULE ENTRÉE FINANCIÈRE.
   *
   * Frais scolaires, État de caisse et Paie relevaient du même métier et
   * des mêmes rôles, mais occupaient trois lignes du menu. Elles sont
   * regroupées sous « Comptabilité », qui n'est qu'un point d'entrée :
   * les trois écrans existent tels quels et gardent chacun leur propre
   * garde de rôle.
   *
   * Le directeur général n'y figure PAS par son rôle : il l'obtient de
   * l'interrupteur posé par le promoteur, d'où le drapeau ci-dessous.
   * Ce retrait du menu ne protège rien par lui-même : cash_report_* et
   * payroll_month() revérifient can_see_money() en base, et les colonnes
   * de rémunération de `teachers` sont fermées au rôle `authenticated`.
   */
  {
    label: "Comptabilité",
    path: "/accounting",
    roles: ["promoteur", "comptable"],
    suitAutorisationComptable: true,
  },
  /*
   * L'enseignant y voit ce que l'école lui doit. Ouvert à tous les rôles
   * susceptibles d'avoir une fiche enseignant rattachée : la fonction
   * my_payroll_month() se borne d'elle-même aux fiches de l'appelant, et
   * l'écran ne montre rien à qui n'en a aucune.
   */
  { label: "Ma rémunération", path: "/my-pay", roles: PEDAGOGIE },
  { label: "Activité", path: "/activity", roles: DIRECTION_GENERALE },
  /*
   * La copie des données de l'école, réservée à son propriétaire. Ce
   * n'est pas une capacité de gestion : c'est la garantie qu'il peut
   * repartir avec ses données sans les demander à personne.
   */
  { label: "Sauvegarde", path: "/sauvegarde", roles: ["promoteur"] },
  { label: "Comptes utilisateurs", path: "/users", roles: ENCADREMENT },
  { label: "Paramètres", path: "/settings", roles: DG_ECRIT },
]

/**
 * Le menu d'un rôle, autorisation comptable du directeur général
 * comprise.
 *
 * Le filtrage vit ici, avec les règles, et non dans le tableau de bord :
 * c'est ce qui empêche un écran de proposer une page que la permission
 * refusera.
 */
export function menuPour(
  role: string | null | undefined,
  options?: { dgVoitComptabilite?: boolean | null }
) {
  return NAV_ITEMS.filter((item) => {
    if (item.suitAutorisationComptable) {
      return peutVoirComptabilite(role, options?.dgVoitComptabilite)
    }

    // Pas de repli implicite : un rôle inconnu ou absent n'ouvre rien.
    return item.roles.includes(role ?? "")
  })
}
