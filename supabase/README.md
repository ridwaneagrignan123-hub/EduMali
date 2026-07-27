# Schéma de base de données

Le schéma vit dans Supabase, pas dans ce dépôt. Ce dossier documente son état
pour qu'il soit reproductible, mais il n'est **pas** une source de vérité
automatiquement synchronisée.

## Ce que contient ce dossier

**`schema.sql`** — état de référence complet, obtenu par introspection de la
base de production le 2026-07-27 (lecture de `pg_catalog`, pas une
reconstitution de mémoire). Vérifié automatiquement : 20 tables, 164 colonnes,
30 contraintes nommées, RLS active sur les 20 tables, 5 fonctions.

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

## Points connus

- **`students.matricule`** est une colonne morte : aucune ligne renseignée,
  aucune référence dans le code. L'application utilise `student_number`.
  À supprimer un jour, mais elle est conservée ici pour rester fidèle au réel.
- **`classes.academic_year`** (texte) coexiste avec la table `academic_years`.
  Héritage de la première version, remplacé mais jamais retiré.
- **Les policies de `attendance`, `fee_assessments`, `fee_payments`,
  `timetable_slots` et `sms_logs` visent le rôle `public`** et non
  `authenticated`, contrairement aux plus récentes. Sans effet pratique — RLS
  exige de toute façon un `auth.uid()` — mais l'incohérence est réelle.
- **`schools` est lisible par tout utilisateur authentifié** (`using (true)`),
  y compris les écoles dont il n'est pas membre.
- **`attendance` et `timetable_slots` ne sont pas cloisonnées par direction.**
  Un `directeur_direction` y voit toute l'école.
