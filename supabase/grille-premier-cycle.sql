-- =====================================================================
-- Ridwane — la grille de notes du premier cycle
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-31. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.
--
-- ---------------------------------------------------------------------
-- AUCUNE TABLE NOUVELLE
--
-- La grille n'est pas un second système de notes. Chaque colonne est une
-- évaluation ordinaire du couple (classe, matière, période), de type
-- `composition` et sur 10 ; chaque cellule est une ligne de `grades`.
-- C'est ce qui fait que le bulletin et la page Moyennes — qui lisent
-- déjà `grades` — restent d'accord avec elle, au lieu de diverger.
--
-- Ce qui a changé en base ne concerne QUE les droits : le titulaire
-- devait pouvoir tenir sa grille, et il ne le pouvait pas.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- LE DÉFAUT CORRIGÉ : LE TITULAIRE N'ÉTAIT PAS UN ENSEIGNANT
--
-- `private.teaches_class()`, `teaches_student()` et `teaches_assessment()`
-- ne regardaient que `class_subjects.teacher_id`. Or au premier cycle le
-- titulaire tient toute la classe SANS forcément y figurer : la table
-- `class_head_teachers` porte ce lien, et personne ne la lisait.
--
-- Conséquence : un titulaire ne voyait ni sa classe, ni ses élèves, et
-- ne pouvait saisir aucune note. Les trois fonctions consultent
-- désormais aussi `class_head_teachers`, via `private.est_titulaire()`.
--
-- Elles ne font que S'ÉLARGIR : partout où elles apparaissent, c'est
-- dans un OR. Aucun accès existant n'est retiré.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- L'EN-TÊTE CRÉE LA MATIÈRE — DONC LE TITULAIRE DOIT POUVOIR LA CRÉER
--
-- « Écrire une matière dans l'en-tête la rattache à la classe » supprime
-- l'étape d'affectation séparée. Mais créer une matière était réservé à
-- la direction générale, et rattacher une matière à une classe à
-- l'encadrement : un titulaire aurait buté sur les deux.
--
-- Deux policies étroites plutôt qu'un élargissement général :
--
--   subjects INSERT ....... au titulaire d'AU MOINS UNE classe de
--                           premier cycle, dans son école
--   class_subjects INSERT . au titulaire de CETTE classe précise
--   class_subjects DELETE . idem — retirer une colonne de SA grille
--
-- `private.est_titulaire(class_id)` borne l'écriture à la classe dont on
-- est effectivement titulaire. Vérifié : composer une classe dont on
-- n'est pas titulaire est refusé.
--
-- Aucune policy sur `subjects` en UPDATE ou DELETE : renommer une
-- matière la renommerait pour toutes les classes de l'école. L'en-tête
-- ne renomme donc pas — il REMPLACE la colonne par une autre matière, et
-- prévient quand l'ancienne portait des notes.
-- ---------------------------------------------------------------------

create or replace function private.est_titulaire(target_class_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from class_head_teachers h
    join teachers t on t.id = h.teacher_id
    where h.class_id = target_class_id
      and t.profile_id = auth.uid());
$$;

create or replace function private.est_titulaire_premier_cycle()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from class_head_teachers h
    join teachers t on t.id = h.teacher_id
    join classes c on c.id = h.class_id
    where t.profile_id = auth.uid()
      and c.cycle = 'premier_cycle');
$$;

-- Les trois fonctions teaches_* consultent désormais class_head_teachers.
-- Leur définition à jour figure dans schema.sql.

create policy "Titulaire cree les matieres de sa grille" on subjects
  for insert to authenticated
  with check (private.est_titulaire_premier_cycle()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid()));

create policy "Titulaire compose la grille de sa classe" on class_subjects
  for insert to authenticated
  with check (private.est_titulaire(class_id)
    and school_id in (select p.school_id from profiles p where p.id = auth.uid()));

create policy "Titulaire retire une colonne de sa grille" on class_subjects
  for delete to authenticated
  using (private.est_titulaire(class_id)
    and school_id in (select p.school_id from profiles p where p.id = auth.uid()));


-- =====================================================================
-- LA RÈGLE DE CALCUL VIT DANS LE CODE, PAS EN BASE
-- =====================================================================
-- `src/lib/premier-cycle.ts` porte total, moyenne et rang, et les trois
-- écrans l'appellent. Elle n'est pas dupliquée en SQL : un second
-- exemplaire en base finirait par diverger du premier, et c'est
-- précisément cette divergence qui produisait des bulletins vides.
--
--   Total   = somme des notes
--   Moyenne = Total ÷ nombre de MATIÈRES (pas de notes saisies)
--   Case vide = 0, et tire donc la moyenne vers le bas
--   Aucun coefficient : moyenne simple
--   Rang sur la moyenne, ex æquo au même rang
--
-- LE BARÈME RESTE 10. Le bulletin ramenait toute note au barème de
-- l'établissement — 20 par défaut. Appliqué ici, il aurait affiché 16 là
-- où la grille montre 8, et les deux écrans se seraient contredits. Au
-- premier cycle la note n'est donc pas remise à l'échelle, et les seuils
-- d'appréciation sont ramenés proportionnellement : sans cela
-- « Excellent » aurait demandé 18 sur une note plafonnée à 10.


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-07-31)
-- =====================================================================
-- Calcul, sur une classe de 3 matières et 3 élèves :
--   Élève1 8/6/10 ......... total 24 -> 8,00
--   Élève2 5/5/(vide) ..... total 10 -> 3,33  (la case vide pèse 0)
--   Élève3 8/6/10 ......... même total -> même rang qu'Élève1
--   Le bulletin trouve 8 notes rattachées à la classe : plus de bulletin
--   vide, les matières venant de class_subjects comme les notes.
--
-- Droits, sous l'identité d'un titulaire réel SANS ligne class_subjects :
--   Voit sa classe ........................... 1
--   Voit ses élèves .......................... 1
--   Crée la matière depuis l'en-tête ......... OK
--   La rattache à SA classe .................. OK
--   Compose une classe qui n'est pas la sienne  refusé
--   Crée la composition de la colonne ........ OK
--   Saisit une note .......................... OK
