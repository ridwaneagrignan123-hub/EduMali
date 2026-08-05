/*
 * LE FRANÇAIS EST LA SOURCE.
 *
 * ---------------------------------------------------------------------
 * CE QUE CE FICHIER GARANTIT
 *
 * Il est le seul dictionnaire COMPLET. `en.ts` et `ar.ts` sont typés
 * `Partial` de celui-ci : une clé absente y est légale — l'écran retombe
 * alors sur le français, lisible — mais une clé INVENTÉE ne compile pas.
 *
 * C'est exactement la propriété qu'on veut pour un chantier qui
 * s'étalera sur plusieurs passes : traduire progressivement sans jamais
 * casser un écran, et sans jamais laisser une faute de frappe passer
 * pour une traduction manquante.
 * ---------------------------------------------------------------------
 *
 * Les clés sont PLATES et préfixées par surface (`nav.`, `eleves.`…).
 * Un objet imbriqué se lirait mieux, mais rendrait le typage des clés
 * bien plus lourd pour un gain nul à l'usage.
 *
 * Les valeurs peuvent porter des marques `{nom}`, remplacées à l'appel :
 *   t("eleves.compte", { nombre: 12 })
 */
export const fr = {
  // ---- Commun ------------------------------------------------------
  "commun.chargement": "Chargement...",
  "commun.enregistrer": "Enregistrer",
  "commun.annuler": "Annuler",
  "commun.fermer": "Fermer",
  "commun.modifier": "Modifier",
  "commun.supprimer": "Supprimer",
  "commun.rechercher": "Rechercher",
  "commun.retour": "Retour",
  "commun.retourTableauDeBord": "Retour au tableau de bord",
  "commun.imprimer": "Imprimer",
  "commun.oui": "Oui",
  "commun.non": "Non",
  "commun.aucunResultat": "Aucun résultat.",
  "commun.erreurChargement": "Le chargement a échoué. Réessayez.",
  "commun.langue": "Langue",

  // ---- Navigation --------------------------------------------------
  "nav.tableauDeBord": "Tableau de bord",
  "nav.statistiques": "Statistiques",
  "nav.surveillance": "Surveillance",
  "nav.eleves": "Élèves",
  "nav.passageDeClasse": "Passage de classe",
  "nav.cartesScolaires": "Cartes scolaires",
  "nav.attestations": "Attestations",
  "nav.enseignants": "Enseignants",
  "nav.classes": "Classes",
  "nav.directions": "Directions",
  "nav.matieres": "Matières",
  "nav.classesMatieres": "Classes / Matières",
  "nav.anneeScolaire": "Année scolaire",
  "nav.emploiDuTemps": "Emploi du temps",
  "nav.evaluations": "Évaluations",
  "nav.notes": "Notes",
  "nav.moyennes": "Moyennes",
  "nav.bulletins": "Bulletins",
  "nav.presences": "Présences",
  "nav.comptabilite": "Comptabilité",
  "nav.maRemuneration": "Ma rémunération",
  "nav.activite": "Activité",
  "nav.comptes": "Comptes utilisateurs",
  "nav.parametres": "Paramètres",
  "nav.sauvegarde": "Sauvegarde",
  "nav.deconnexion": "Se déconnecter",
  "nav.menu": "Menu",

  // ---- Connexion ---------------------------------------------------
  "connexion.titre": "Connexion",
  "connexion.sousTitre": "Connectez-vous à votre espace scolaire",
  "connexion.email": "Adresse email",
  "connexion.motDePasse": "Mot de passe",
  "connexion.seConnecter": "Se connecter",
  "connexion.connexionEnCours": "Connexion...",
  "connexion.avecGoogle": "Continuer avec Google",
  "connexion.retourAccueil": "← Retour à l'accueil",
  "connexion.pasDAcces":
    "Votre école n'a pas encore d'accès ? Demandez-en un",
  "connexion.motDePassePlaceholder": "Votre mot de passe",
  "connexion.ou": "ou",
  "connexion.echec":
    "La connexion a échoué. Vérifiez votre adresse et votre mot de passe.",

  // ---- Demande d'accès ---------------------------------------------
  "demande.titre": "Demander un accès",
  "demande.intro":
    "Ridwane ne s'ouvre pas librement : chaque établissement entre par une autorisation nominative. Cette page transmet votre demande, nous vous recontactons, et l'ouverture se fait ensuite avec cette autorisation.",
  "demande.identifiezVous":
    "Commencez par vous identifier. L'autorisation sera rattachée à cette adresse, et à elle seule.",
  "demande.jAiUnCompte": "J'ai déjà un compte",
  "demande.titreFormulaire": "Votre établissement",
  "demande.introFormulaire":
    "Ces informations servent à examiner votre demande. Rien n'est créé pour l'instant.",
  "demande.votreAdresse": "Votre adresse",
  "demande.adresseAide":
    "Issue de votre connexion. L'autorisation lui sera rattachée.",
  "demande.nomEcole": "Nom de l'établissement",
  "demande.ville": "Ville",
  "demande.typeEcole": "Type d'établissement",
  "demande.whatsapp": "Numéro WhatsApp",
  "demande.nomPromoteur": "Nom du promoteur",
  "demande.envoyer": "Envoyer ma demande",
  "demande.envoiEnCours": "Envoi...",
  "demande.recueTitre": "Demande reçue",
  "demande.recueTexte":
    "Nous vous recontacterons au numéro indiqué. Si votre demande est acceptée, l'autorisation sera rattachée au compte avec lequel vous venez de vous identifier — reconnectez-vous alors avec le même, et vous pourrez ouvrir votre établissement.",
  "demande.retourConnexion": "Retour à la connexion",

  // ---- Tableau de bord ---------------------------------------------
  "tdb.bonjour": "Bonjour {prenom}",
  "tdb.sousTitre": "Voici l'essentiel de votre établissement aujourd'hui.",
  "tdb.eleves": "Élèves",
  "tdb.classes": "Classes",
  "tdb.enseignants": "Enseignants",
  "tdb.presencesDuJour": "Présences du jour",
  "tdb.perimetreDirection": "Périmètre : direction {direction}",
  "tdb.erreurPartielle":
    "Certaines données n'ont pas pu être chargées. Rechargez la page.",

  // ---- Élèves ------------------------------------------------------
  "eleves.titre": "Élèves",
  "eleves.sousTitre": "Inscrivez et gérez les élèves de votre établissement.",
  "eleves.ajouter": "Ajouter un élève",
  "eleves.liste": "Liste des élèves",
  "eleves.compte": "{nombre} élève(s)",
  "eleves.compteFiltre": "{filtres} élève(s) sur {total}",
  "eleves.aucun": "Aucun élève inscrit pour le moment.",
  "eleves.prenom": "Prénom",
  "eleves.nom": "Nom",
  "eleves.matricule": "Matricule",
  "eleves.dateNaissance": "Date de naissance",
  "eleves.sexe": "Sexe",
  "eleves.masculin": "Masculin",
  "eleves.feminin": "Féminin",
  "eleves.adresse": "Adresse",
  "eleves.parent": "Parent",
  "eleves.telephoneParent": "Téléphone du parent",
  "eleves.classe": "Classe",
  "eleves.rechercherUnEleve": "Rechercher un élève",
  "eleves.historique": "Historique",
  "eleves.rapportMensuel": "Rapport mensuel",
  "eleves.aucuneClasse": "Sans classe",

  // ---- Notes -------------------------------------------------------
  "notes.titre": "Notes",
  "notes.sousTitre": "Saisissez et corrigez les notes de vos évaluations.",
  "notes.evaluation": "Évaluation",
  "notes.note": "Note",
  "notes.sur": "sur {max}",
  "notes.enregistrer": "Enregistrer les notes",
  "notes.enregistrement": "Enregistrement...",
  "notes.enregistrees": "Notes enregistrées.",
  "notes.aucuneEvaluation":
    "Aucune évaluation pour cette classe et cette période.",
  "notes.aucunEleve": "Aucun élève inscrit dans cette classe.",
  "notes.horsLigne":
    "Vous êtes hors ligne. Les notes sont conservées et partiront au retour du réseau.",
  "notes.enAttenteSync": "{nombre} note(s) en attente d'envoi.",
  "notes.total": "Total",
  "notes.moyenne": "Moyenne",
  "notes.rang": "Rang",
  "notes.saisieReserveeDirecteur":
    "Pour cette classe, les notes sont saisies par le directeur.",
  "notes.saisieReserveeEnseignant":
    "Pour cette classe, les notes sont saisies par l'enseignant.",

  // ---- Bulletin ----------------------------------------------------
  "bulletin.titre": "Bulletins",
  "bulletin.sousTitre": "Éditez et imprimez les bulletins de la classe.",
  "bulletin.bulletinScolaire": "Bulletin scolaire",
  "bulletin.periode": "Période",
  "bulletin.anneeScolaire": "Année scolaire",
  "bulletin.matiere": "Matière",
  "bulletin.moyenne": "Moyenne",
  "bulletin.coefficient": "Coef.",
  "bulletin.moyenneGenerale": "Moyenne générale",
  "bulletin.rang": "Rang",
  "bulletin.appreciation": "Appréciation",
  "bulletin.excellent": "Excellent",
  "bulletin.tresBien": "Très bien",
  "bulletin.bien": "Bien",
  "bulletin.passable": "Passable",
  "bulletin.insuffisant": "Insuffisant",
  "bulletin.absences": "Absences",
  "bulletin.retards": "Retards",
  "bulletin.imprimerTout": "Imprimer tous les bulletins",
  "bulletin.aucun": "Aucun bulletin à éditer pour cette sélection.",
  "bulletin.signature": "Signature de la direction",

  // ---- Sélecteur de langue -----------------------------------------
  "langue.choisir": "Choisir la langue",
  "langue.enregistree": "Langue enregistrée.",
} as const

/** Toutes les clés du dictionnaire — le français les porte toutes. */
export type CleDeTraduction = keyof typeof fr

/** Une traduction partielle : ce qui manque retombe sur le français. */
export type Traductions = Partial<Record<CleDeTraduction, string>>
