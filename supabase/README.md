# Schéma de base de données

Le schéma vit dans Supabase, pas dans ce dépôt. Ce dossier documente son état
pour qu'il soit reproductible, mais il n'est **pas** une source de vérité
automatiquement synchronisée.

> ## ⚠️ Toute modification du schéma régénère `schema.sql` dans le MÊME commit
>
> Créer une table, ajouter une colonne, changer une contrainte, poser une
> policy, une fonction **ou un droit de colonne** : le fichier se régénère et
> part avec le changement.
>
> **Ce n'est pas une formalité.** Ce fichier existe pour mettre fin aux bugs
> écrits contre un schéma supposé plutôt que vérifié. Il a déjà divergé
> **quatre fois** — et un fichier de référence périmé est plus dangereux
> qu'un fichier absent, parce qu'on lui fait confiance.
>
> La régénération se fait par introspection de `pg_catalog`, jamais en
> recopiant les scripts de ce dossier ni de mémoire : c'est précisément
> l'écart entre le script et le réel que ce fichier doit révéler.

## Ce que contient ce dossier

**`schema.sql`** — état de référence complet, obtenu par introspection de la
base de production le **2026-08-02** (lecture de `pg_catalog`).

| | |
|---|---|
| Tables | **35** |
| Colonnes | 306 |
| Contraintes | 190 |
| Tables avec RLS active | **35 sur 35** |
| Policies | 118 |
| Index | 76 |
| Fonctions `public` | 17 |
| Fonctions `private` | 49 |
| Déclencheurs | 50 |

Les déclencheurs incluent `on_auth_user_created`, posé sur `auth.users` et
non sur `public`.

Chaque régénération se contrôle **inventaire par inventaire, dans les deux
sens** : aucun objet de la base absent du fichier, aucun objet du fichier
absent de la base. C'est ce contrôle qui avait révélé, le 30 juillet, une
fonction décrite dans le fichier mais absente de la base — et, le 2 août,
huit fonctions qu'une substitution trop large venait d'effacer du fichier
sans que le décompte total ne le laisse voir. Les TOTAUX ne suffisent pas :
la comparaison se fait NOM PAR NOM.

Pour les policies, dont les noms sont nombreux, la comparaison se fait par
empreinte : `md5(string_agg(tablename||' :: '||policyname, …))` en base,
la même sur les noms extraits du fichier. Les deux doivent coïncider.

Il porte désormais une **section 5 : droits par colonne**. Le RLS travaille
par ligne et ne masque pas une colonne — sans ce bloc, une base recréée
depuis ce fichier rouvrirait la lecture des salaires à tout le personnel.

### Les fichiers de trace

Ils portent le **raisonnement** ; `schema.sql` porte l'**état**. Les rejouer
sur la production échouerait, les objets existant déjà.

| Fichier | Contenu |
|---|---|
| `rls-roles.sql` | cloisonnement par rôle (2026-07-29) |
| `vie-scolaire-et-statistiques.sql` | rôle `surveillant`, retards, thèmes au rang, rappels, fonctions `stats_*` |
| `caisse.sql` | numéros de reçu, traçabilité de l'encaissement, annulation, état de caisse (2026-07-30) |
| `paie.sql` | contrats et tarifs, règles de paie, calcul mensuel, fermeture des colonnes de salaire (2026-07-30) |
| `autorisation-creation-ecole.sql` | `school_creation_grants` : l'ouverture d'un établissement passe d'un contrôle client à une autorisation nominative serveur (2026-07-30) |
| `suppression-frais-payes.sql` | `fee_payments.fee_assessment_id` passe de CASCADE à RESTRICT, plus le refus lisible (2026-07-30) |
| `enseignants-sans-compte.sql` | la fiche enseignant se découple du compte de connexion ; WhatsApp obligatoire et unique par école (2026-07-30) |
| `cycles-et-titulaires.sql` | `classes.cycle`, table `class_head_teachers`, `subjects.filiere` (2026-07-30) |
| `franco-arabe.sql` | `profiles.filiere` et la décision sur le périmètre RLS d'une direction à deux directeurs (2026-07-30) |
| `paie-au-pointage.sql` | `timetable_checkins`, `payroll_closings` : la paie des vacataires se confirme au lieu de se déduire (2026-07-31) |
| `programme-par-filiere.sql` | le programme se partitionne par filière, l'élève reste entier ; filière obligatoire en franco-arabe (2026-07-31) |
| `grille-premier-cycle.sql` | le titulaire devient un enseignant aux yeux du RLS ; il tient sa grille de notes (2026-07-31) |
| `messages-parents-et-discipline.sql` | `sms_logs` devient la file d'envoi ; `lesson_attendance`, `detentions`, `school_rules`, `rule_violations` (2026-07-31) |
| `plafond-et-matieres-notables.sql` | on ne verse pas plus que le dû ; on ne note que les matières de la classe (2026-08-01) |
| `devoirs-maison.sql` | table `homework`, bucket `homework-photos`, `sms_logs.event_type` accueille `devoir` (2026-08-01) |
| `modele-de-roles.sql` | le promoteur passe en lecture seule, « admin » disparaît, directions par cycle, « qui note », surveillance par cycle, demandes d'accès (2026-08-02) |

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

Deux buckets, bâtis sur le **même modèle** : **`student-photos`**, qui porte
les photos d'identité des cartes scolaires (`app/id-cards`), et
**`homework-photos`**, qui porte les photos d'exercice des devoirs à la
maison (`components/devoirs-maison.tsx`). Tout ce qui suit vaut pour les
deux — c'est délibéré, un second mécanisme aurait doublé la surface à
vérifier pour rien.

⚠️ **Ni l'un ni l'autre n'est décrit dans `schema.sql`**, qui ne couvre que
le schéma `public`. Une base recréée depuis ce fichier n'aura aucun bucket :
il faut les reposer à la main, avec les policies décrites ici.

Ils sont **publics en lecture** — une carte imprimée doit afficher la photo
sans jeton d'authentification, et le lien d'un devoir doit s'ouvrir depuis un
message WhatsApp, chez un parent qui n'a pas de compte. Les URL contiennent
des UUID, donc elles ne sont pas devinables. L'écriture, elle, est strictement
cloisonnée.

**Ne rajoutez pas de policy `SELECT` sur `storage.objects` pour ces buckets.**
Les URL `/object/public/…` contournent le RLS : l'affichage n'en a pas besoin.
Une policy `SELECT` n'ouvre que le *listage*, et celle qui existait permettait
à un visiteur non connecté d'énumérer les photos de tous les élèves de toutes
les écoles — des mineurs. Elle a été retirée après vérification que les photos
restaient servies.

Le chemin de chaque fichier commence par le **`school_id`** —
`{school_id}/{student_id}.{ext}` pour les cartes, `{school_id}/{uuid}.{ext}`
pour les devoirs, une photo de devoir n'appartenant à aucun élève en
particulier. Ce n'est pas une simple convention de rangement : c'est le
mécanisme de sécurité. Les policies comparent `storage.foldername(name)[1]`
au `school_id` de l'appelant, si bien qu'un utilisateur ne peut écrire que
sous le dossier de son propre établissement. Changer ce chemin dans le code
casserait silencieusement le cloisonnement — toute modification doit garder
le `school_id` en premier segment.

Les colonnes `students.photo_url` et `homework.photo_url` stockent l'URL
publique résultante.

La photo d'un devoir part aux parents **en lien, pas en pièce jointe** :
joindre l'image exigerait un message média sur un modèle approuvé par
WhatsApp Business, capacité à ajouter le jour où un fournisseur sera branché.

## Points connus

Vérifiés en base le 2026-08-01, pas reconduits de mémoire.

- **`students.matricule`** est une colonne morte : 0 ligne renseignée, aucune
  référence dans le code. L'application utilise `student_number`. Conservée
  ici pour rester fidèle au réel.
- **`classes.academic_year`** (texte) coexiste avec la table `academic_years`.
  Héritage de la première version, remplacé mais jamais retiré.
- **`timetable_slots` est cloisonné en ÉCRITURE, pas en lecture.** Depuis le
  partitionnement par programme, ses policies INSERT/UPDATE/DELETE portent la
  direction ET la filière. La lecture reste ouverte à l'école entière,
  délibérément : un enseignant doit voir l'emploi du temps où il figure, et un
  directeur doit constater que l'autre programme occupe déjà la classe à cette
  heure-là.
- **Les fonctions `stats_*` contournent délibérément le RLS.** Elles sont en
  `SECURITY DEFINER` pour que chacun puisse comparer les classes, et ne sont
  sans danger **que** parce qu'elles ne rendent aucune colonne nominative. Y
  ajouter un nom d'élève ouvrirait le carnet de notes de toute l'école.
- **Les fonctions `cash_report_*`, `payroll_month` et
  `set_teacher_compensation` contournent aussi le RLS**, pour lire les noms
  des encaisseurs et croiser des tables que l'appelant ne voit pas entièrement.
  Chacune **refait donc le contrôle d'accès dans son corps**, sur
  `private.can_see_money()`. Retirer ce `raise` ouvrirait la caisse et les
  salaires à tout compte authentifié — le RLS ne rattraperait rien.
- **Les colonnes `teachers.hourly_rate` et `teachers.monthly_salary` sont
  fermées au rôle `authenticated`** par des droits de colonne, pas par une
  policy. Le RLS travaille par ligne et n'aurait pas pu les masquer. Toute
  nouvelle colonne sensible sur `teachers` doit être omise des `grant` de la
  section 5 de `schema.sql`, sinon elle sera lisible par toute l'école.

- **On ne verse jamais plus que le montant dû**, et le dû ne descend pas
  sous le déjà-payé. Deux déclencheurs, `fee_payments_plafond` et
  `fee_assessments_plafond`, en comptant les seuls versements non annulés.
  Le premier est nommé pour s'exécuter APRÈS
  `fee_payments_controle_annulation` — l'ordre alphabétique décide, et il
  doit voir le `cancelled_at` que celui-ci impose. Annuler n'est jamais
  bloqué.
- **On ne note que les matières affectées à la classe.**
  `assessments_matiere_de_la_classe` garde les évaluations, ce qui suffit à
  garder les notes. `class_subjects` est la source unique de ce que la classe
  étudie : bulletin ET page Moyennes en lisent la liste et les coefficients.
  Ne pas revenir à une lecture des matières depuis les notes — c'est ce qui
  faisait diverger les deux écrans et produisait des bulletins vides.
- **Un message aux parents ne naît JAMAIS « envoyé ».** `sms_logs` est la
  file d'envoi ; le déclencheur `sms_logs_auteur` ramène tout insert à
  `en_attente` et efface un `provider_message_id` inventé. Seul
  `src/lib/whatsapp.ts` peut faire passer une ligne à `sent`, et seulement si
  un fournisseur a accepté le message. Aucun fournisseur n'y est codé : le
  brancher est une démarche externe (compte WhatsApp Business, modèles
  pré-approuvés par Meta, numéro vérifié).
- **La présence a DEUX modèles, et le cycle décide.** `attendance` marque la
  journée (premier cycle) ; `lesson_attendance` marque une leçon, avec la clé
  d'unicité `(student_id, slot_id, lesson_date)` — le créneau EST la leçon.
  Ne pas fusionner les deux : la contrainte par jour laisserait le premier
  enseignant à marquer verrouiller la journée entière au second cycle.
- **`lesson_attendance.slot_id` est en `ON DELETE RESTRICT`.** Un relevé
  d'absence est un fait constaté, souvent déjà signalé à la famille.
  Supprimer un créneau ne doit pas l'effacer ; le créneau reste modifiable.
- **Une règle du règlement se DÉSACTIVE, elle ne se supprime pas.** Abrogée,
  elle reste celle qui fondait les manquements déjà constatés —
  `rule_violations.rule_id` est en `RESTRICT` pour cette raison.
- **Au PREMIER CYCLE, la note est sur 10 et la moyenne est SIMPLE.** Total ÷
  nombre de matières, une case vide comptant 0, sans coefficient. La règle vit
  dans `src/lib/premier-cycle.ts` et les trois écrans — grille, Moyennes,
  bulletin — l'appellent. Ne pas la redupliquer : c'est sa divergence qui
  produisait des bulletins vides. Le bulletin ne remet PAS ces notes au barème
  de l'établissement, sinon il afficherait 16 là où la grille montre 8.
- **`private.teaches_class()` inclut le TITULAIRE**, via
  `class_head_teachers` et non seulement `class_subjects.teacher_id`. Idem pour
  `teaches_student()` et `teaches_assessment()`. Au premier cycle le titulaire
  tient la classe sans figurer dans `class_subjects` : sans cela il ne voyait
  ni sa classe, ni ses élèves.
- **La grille n'a PAS de table à elle.** Chaque colonne est une évaluation de
  type `composition` sur 10, du couple (classe, matière, période) ; chaque
  cellule une ligne de `grades`. C'est ce qui garde le bulletin d'accord avec
  elle.
- **La paie d'un vacataire vient des POINTAGES, pas du planning.**
  `timetable_checkins` est la source unique des heures payées ; `payroll_month`
  ne lit plus `teacher_attendance` pour établir un montant. Un créneau non
  pointé n'est pas payé. Les réglages `payroll_pay_excused_absence` et
  `payroll_deduct_late` ont été **supprimés** : ils n'avaient de sens que dans
  le modèle par déduction. Ne pas les réintroduire.
- **`timetable_checkins.slot_id` est en `ON DELETE RESTRICT`**, comme
  `fee_payments`. Supprimer un créneau effacerait sinon des heures dues.
- **La filière partitionne le PROGRAMME, jamais le dossier de l'élève.**
  Emploi du temps, affectation, titulaire, notes, évaluations, bulletin : oui.
  Élève, inscriptions, frais, absences : non. `private.mon_programme()` rend
  `true` sauf pour un `directeur_direction` portant une filière, ce qui laisse
  l'école classique intacte.
- **En école franco-arabe, `subjects.filiere` est obligatoire.** Deux
  déclencheurs le tiennent : à la création d'une matière, et à la bascule d'une
  école en franco-arabe. Une matière sans programme serait ambiguë sur le
  bulletin comme sur l'emploi du temps.
- **`fee_payments.fee_assessment_id` est en `ON DELETE RESTRICT`**, pas en
  CASCADE. Le remettre en CASCADE rendrait à un administrateur le pouvoir
  d'effacer toute la caisse d'un élève en supprimant un frais — reçus,
  annulations et motifs compris. Le déclencheur
  `fee_assessments_refus_suppression` n'est là que pour rendre le refus
  lisible ; c'est la clé étrangère qui garantit.
- **Des clés en CASCADE pointent encore vers de la caisse ou de l'audit**,
  signalées et non corrigées : `activity_log.school_id` et
  `fee_payments.school_id` vers `schools`, `sms_logs.student_id`,
  `teacher_attendance.teacher_id` vers `teachers`. Les deux `school_id`
  relèvent sans doute d'un choix assumé ; les deux autres méritent une
  décision explicite. Détail dans `suppression-frais-payes.sql`.
- **`school_creation_grants` n'a aucune policy, volontairement.** RLS active
  et zéro policy ferme la table à tout client ; seule la clé service role y
  accède, ce qui en fait la voie de confiance de `/api/setup-school`. Lui
  ajouter une policy de lecture révélerait qui est attendu.

- **`teachers.phone` EST le numéro WhatsApp.** Ce n'est pas une simple
  coordonnée : `app/supervision` construit `https://wa.me/…` à partir d'elle,
  la route d'enregistrement l'exige, et le déclencheur
  `teachers_whatsapp_unique` la refuse en double dans une même école. Ne pas
  créer de colonne `whatsapp` à côté : il y aurait alors deux numéros pour un
  seul usage.
- **`teachers.profile_id` est nul le plus souvent, et c'est normal.**
  Enregistrer un enseignant ne crée plus de compte ; la plupart des vacataires
  n'en auront jamais. Tout code qui lit cette colonne doit tolérer l'absence.
  `private.teaches_class` et `teaches_student` le font par construction, leur
  jointure sur `profile_id` excluant les nuls.
- **`schools.school_type` pilote l'affichage, pas les droits.** Aucune policy
  ne le lit. En `classique`, l'axe filière doit rester invisible partout.
- **La filière ne restreint aucun périmètre RLS.** Deux `directeur_direction`
  peuvent partager une direction et voient exactement la même chose ; leur
  filière dit de quel programme chacun répond. Le raisonnement complet est
  dans `franco-arabe.sql` — cloisonner un jour supposerait de porter la
  filière sur l'élève, pas sur le directeur.
- **`classes.cycle` décide du mode d'affectation**, pas `classes.level` qui
  reste un texte libre. Un cycle nul retombe sur le mode par matière, c'est-à-
  dire le comportement d'avant.

### Points résolus depuis, à ne pas réintroduire

- Les policies de `attendance`, `fee_assessments`, `fee_payments`,
  `timetable_slots` et `sms_logs` visaient le rôle `public` : **toutes visent
  désormais `authenticated`** (0 policy sur `public`).
- `schools` était lisible par tout utilisateur authentifié (`using (true)`) :
  restreint à sa propre école.
- `attendance` n'était pas cloisonné par direction : il l'est désormais.
