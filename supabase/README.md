# Schéma de base de données

Le schéma vit dans Supabase, pas dans ce dépôt. Ce dossier documente son état
pour qu'il soit reproductible, mais il n'est **pas** une source de vérité
automatiquement synchronisée.

> ## ⚠️ Toute modification du schéma régénère `schema.sql` dans le MÊME commit
>
> Créer une table, ajouter une colonne, changer une contrainte, poser une
> policy ou une fonction : le fichier se régénère et part avec le changement.
>
> **Ce n'est pas une formalité.** Ce fichier existe pour mettre fin aux bugs
> écrits contre un schéma supposé plutôt que vérifié. Il a déjà divergé
> **trois fois** — et un fichier de référence périmé est plus dangereux
> qu'un fichier absent, parce qu'on lui fait confiance.
>
> La régénération se fait par introspection de `pg_catalog`, jamais en
> recopiant les scripts de ce dossier ni de mémoire : c'est précisément
> l'écart entre le script et le réel que ce fichier doit révéler.

## Ce que contient ce dossier

**`schema.sql`** — état de référence complet, obtenu par introspection de la
base de production le **2026-07-29** (lecture de `pg_catalog`).

| | |
|---|---|
| Tables | **24** |
| Colonnes | 197 |
| Contraintes | 115 |
| Tables avec RLS active | **24 sur 24** |
| Policies | 87 |
| Index | 46 |
| Fonctions `public` | 9 |
| Fonctions `private` | 17 |
| Déclencheurs | 24 |

**`rls-roles.sql`** — le cloisonnement par rôle, appliqué le 2026-07-29.

**`vie-scolaire-et-statistiques.sql`** — rôle `surveillant`, retards des
enseignants, thèmes au rang, rappels, fonctions statistiques.

Ces deux derniers sont la **trace** de ce qui a été appliqué, pas la source :
les rejouer sur la production échouerait. `schema.sql` seul décrit l'état.

> ⚠️ **Ne jamais exécuter `schema.sql` sur la base de production.**
> Il sert à recréer une base **vierge** : environnement local, base de test,
> reprise après sinistre. Sur une base existante il échouera, les objets
> existant déjà — et dans le pire des cas il masquerait un écart réel.

## Ce que ce dossier ne contient pas

**Il n'y a pas de dossier `migrations/`, volontairement.** Supabase enregistre
déjà quatre migrations appliquées via son API :

| Version | Nom |
|---|---|
| 20260725153111 | create_timetable_slots |
| 20260725155144 | create_sms_logs |
| 20260726130908 | add_directions_and_extended_roles |
| 20260726131529 | direction_scoped_rls |

Créer ici des fichiers de migration portant d'autres numéros exposerait à ce
qu'un `supabase db push` tente de les rejouer sur la production. Le risque
n'en vaut pas la peine tant que la base n'est pas gérée par la CLI.

**Les changements antérieurs et manuels ne sont enregistrés nulle part.**
Tout ce qui a été exécuté depuis l'éditeur SQL du tableau de bord — création
des tables initiales, colonnes pédagogiques de `schools`, `profiles.is_active`,
`fee_class_defaults`, `school_holidays` — n'apparaît dans aucun historique.
`schema.sql` est aujourd'hui la seule trace de leur résultat.

## Reprendre la main proprement

La bonne façon de sortir de cette situation est de laisser la CLI Supabase
générer l'historique depuis la base elle-même. Elle demande le mot de passe de
la base de données, que seul le titulaire du projet possède :

```bash
npx supabase login
```

```bash
npx supabase link --project-ref chmdpkrbyhxomrziwxsk
```

```bash
npx supabase db pull
```

`db pull` écrit un fichier de migration reflétant l'état réel et aligne
l'historique local sur celui du serveur. À partir de là, chaque changement se
fait par `supabase migration new`, puis `supabase db push` — et le dépôt
redevient la source de vérité.

Tant que cette étape n'est pas faite, toute modification de schéma doit être
reportée à la main dans `schema.sql`, sous peine de le voir diverger.

## Stockage de fichiers

Un seul bucket à ce jour : **`student-photos`**, qui porte les photos
d'identité affichées sur les cartes scolaires (`app/id-cards`).

Il est **public en lecture** — une carte imprimée doit afficher la photo sans
jeton d'authentification, et l'URL contient deux UUID, donc elle n'est pas
devinable. L'écriture, elle, est strictement cloisonnée.

**Ne rajoutez pas de policy `SELECT` sur `storage.objects` pour ce bucket.**
Les URL `/object/public/…` contournent le RLS : l'affichage n'en a pas besoin.
Une policy `SELECT` n'ouvre que le *listage*, et celle qui existait permettait
à un visiteur non connecté d'énumérer les photos de tous les élèves de toutes
les écoles — des mineurs. Elle a été retirée après vérification que les photos
restaient servies.

Le chemin de chaque fichier est **`{school_id}/{student_id}.{ext}`**. Ce n'est
pas une simple convention de rangement : c'est le mécanisme de sécurité.
Les policies comparent `storage.foldername(name)[1]` au `school_id` de
l'appelant, si bien qu'un utilisateur ne peut écrire que sous le dossier de
son propre établissement. Changer ce chemin dans le code casserait
silencieusement le cloisonnement — toute modification doit garder le
`school_id` en premier segment.

La colonne `students.photo_url` stocke l'URL publique résultante.

## Points connus

Vérifiés en base le 2026-07-29, pas reconduits de mémoire.

- **`students.matricule`** est une colonne morte : 0 ligne renseignée, aucune
  référence dans le code. L'application utilise `student_number`. Conservée
  ici pour rester fidèle au réel.
- **`classes.academic_year`** (texte) coexiste avec la table `academic_years`.
  Héritage de la première version, remplacé mais jamais retiré.
- **`timetable_slots` n'est pas cloisonné par direction.** Sa policy de
  lecture s'arrête au `school_id` : un `directeur_direction` voit l'emploi du
  temps de tout l'établissement. Seul point de cloisonnement encore ouvert.
- **Les fonctions `stats_*` contournent délibérément le RLS.** Elles sont en
  `SECURITY DEFINER` pour que chacun puisse comparer les classes, et ne sont
  sans danger **que** parce qu'elles ne rendent aucune colonne nominative. Y
  ajouter un nom d'élève ouvrirait le carnet de notes de toute l'école.

### Points résolus depuis, à ne pas réintroduire

- Les policies de `attendance`, `fee_assessments`, `fee_payments`,
  `timetable_slots` et `sms_logs` visaient le rôle `public` : **toutes visent
  désormais `authenticated`** (0 policy sur `public`).
- `schools` était lisible par tout utilisateur authentifié (`using (true)`) :
  restreint à sa propre école.
- `attendance` n'était pas cloisonné par direction : il l'est désormais.
