-- =====================================================================
-- Ridwane — cloisonnement des rôles
-- =====================================================================
-- À exécuter d'un seul bloc dans l'éditeur SQL de Supabase.
--
-- Tout est dans une transaction : chaque « drop » est immédiatement
-- suivi de son « create ». Il n'existe donc aucun instant où une table
-- se retrouve sans protection, et si une seule ligne échoue, rien n'est
-- appliqué.
--
-- ---------------------------------------------------------------------
-- POURQUOI
--
-- Toutes les policies actuelles ne vérifient que school_id, jamais le
-- rôle. Mesuré sur le compte enseignant réel, dans une transaction
-- annulée :
--
--   Supprimer un élève ................... AUTORISÉ
--   Supprimer les autres enseignants ..... AUTORISÉ (2 lignes)
--   Supprimer toutes les classes ......... AUTORISÉ (3 lignes)
--   Créer un frais de 999 999 ............ AUTORISÉ
--   Enregistrer un paiement .............. AUTORISÉ
--   Lire les paiements de l'école ........ AUTORISÉ
--   Renommer l'établissement ............. refusé
--   Se promouvoir administrateur ......... refusé
--
-- Seul le menu masquait ces pages, et un menu se contourne en tapant
-- l'adresse. Le rôle, lui, est déjà protégé : le déclencheur
-- profiles_prevent_privilege_escalation empêche quiconque de modifier
-- son propre rôle, son école ou son statut.
-- ---------------------------------------------------------------------

begin;

-- =====================================================================
-- 1. Fonctions d'aide
-- =====================================================================
-- Placées dans « private » : ce schéma n'est pas exposé par PostgREST,
-- elles ne sont donc pas appelables depuis l'API.
--
-- SECURITY DEFINER parce qu'elles lisent « profiles » : sans cela, la
-- policy de profiles s'appliquerait à l'intérieur d'une policy qui la
-- consulte, et l'on tournerait en rond.

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.role from profiles p where p.id = auth.uid();
$$;

-- Encadrement : pilote la pédagogie et la scolarité.
create or replace function private.is_encadrement()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.role in (
       'admin', 'promoteur', 'directeur_general', 'directeur_direction'
     )
     from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Direction générale : décide de la structure de l'établissement.
create or replace function private.is_direction_generale()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.role in ('admin', 'promoteur', 'directeur_general')
     from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Qui touche à l'argent : la direction générale et la comptabilité.
create or replace function private.handles_money()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.role in (
       'admin', 'promoteur', 'directeur_general', 'comptable'
     )
     from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Un enseignant n'écrit que sur les classes où il a une matière.
create or replace function private.teaches_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from class_subjects cs
    join teachers t on t.id = cs.teacher_id
    where cs.class_id = target_class_id
      and t.profile_id = auth.uid()
  );
$$;

create or replace function private.teaches_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from assessments a
    join class_subjects cs on cs.class_id = a.class_id
    join teachers t on t.id = cs.teacher_id
    where a.id = target_assessment_id
      and t.profile_id = auth.uid()
  );
$$;

-- Les fonctions existantes de « private » sont accordées au seul rôle
-- « authenticated », PUBLIC révoqué. On fait pareil, sans quoi le droit
-- resterait attaché à PUBLIC et la révocation n'aurait aucun effet.
revoke execute on function private.current_user_role() from public;
revoke execute on function private.is_encadrement() from public;
revoke execute on function private.is_direction_generale() from public;
revoke execute on function private.handles_money() from public;
revoke execute on function private.teaches_class(uuid) from public;
revoke execute on function private.teaches_assessment(uuid) from public;

grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_encadrement() to authenticated;
grant execute on function private.is_direction_generale() to authenticated;
grant execute on function private.handles_money() to authenticated;
grant execute on function private.teaches_class(uuid) to authenticated;
grant execute on function private.teaches_assessment(uuid) to authenticated;


-- =====================================================================
-- 2. L'argent — le cloisonnement le plus urgent
-- =====================================================================
-- Un enseignant n'a aucune raison de voir, et encore moins de modifier,
-- ce que les familles doivent ou ont versé.

drop policy if exists "Users can view fee assessments from their school" on fee_assessments;
drop policy if exists "Users can create fee assessments for their school" on fee_assessments;
drop policy if exists "Users can update fee assessments from their school" on fee_assessments;
drop policy if exists "Users can delete fee assessments from their school" on fee_assessments;

create policy "Comptabilite lit les frais de son ecole"
  on fee_assessments for select to authenticated
  using (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Comptabilite cree les frais de son ecole"
  on fee_assessments for insert to authenticated
  with check (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Comptabilite modifie les frais de son ecole"
  on fee_assessments for update to authenticated
  using (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les frais"
  on fee_assessments for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

drop policy if exists "Users can view fee payments from their school" on fee_payments;
drop policy if exists "Users can create fee payments for their school" on fee_payments;
drop policy if exists "Users can update fee payments from their school" on fee_payments;
drop policy if exists "Users can delete fee payments from their school" on fee_payments;

create policy "Comptabilite lit les paiements de son ecole"
  on fee_payments for select to authenticated
  using (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Comptabilite enregistre les paiements"
  on fee_payments for insert to authenticated
  with check (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Comptabilite corrige les paiements"
  on fee_payments for update to authenticated
  using (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.handles_money()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

-- Suppression réservée à la direction générale : un paiement effacé
-- par erreur est une somme perdue pour la famille comme pour l'école.
create policy "Direction generale supprime les paiements"
  on fee_payments for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 3. Les élèves — lecture pour tous, écriture pour l'encadrement
-- =====================================================================

drop policy if exists "Users can create students for their school" on students;
drop policy if exists "Users can update students from their school" on students;
drop policy if exists "Users can delete students from their school" on students;

-- La policy de lecture est conservée telle quelle : un enseignant doit
-- voir ses élèves.

create policy "Encadrement inscrit les eleves"
  on students for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Encadrement modifie les eleves"
  on students for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les eleves"
  on students for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 4. Les enseignants — un enseignant ne gère pas ses collègues
-- =====================================================================

drop policy if exists "Users can create teachers for their school" on teachers;
drop policy if exists "Users can update teachers from their school" on teachers;
drop policy if exists "Users can delete teachers from their school" on teachers;

create policy "Encadrement cree les enseignants"
  on teachers for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Encadrement modifie les enseignants"
  on teachers for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les enseignants"
  on teachers for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 5. La structure — classes, matières, année scolaire
-- =====================================================================
-- Le cloisonnement par direction déjà en place est conservé mot pour
-- mot : on ne fait qu'ajouter la condition de rôle.

drop policy if exists "Users can create classes for their school" on classes;
drop policy if exists "Users can update classes from their school" on classes;
drop policy if exists "Users can delete classes from their school" on classes;

create policy "Encadrement cree les classes"
  on classes for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or direction_id = private.current_direction_id())
  );

create policy "Encadrement modifie les classes"
  on classes for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or direction_id = private.current_direction_id())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or direction_id = private.current_direction_id())
  );

create policy "Direction generale supprime les classes"
  on classes for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

drop policy if exists "Users can create subjects for their school" on subjects;
drop policy if exists "Users can update subjects from their school" on subjects;
drop policy if exists "Users can delete subjects from their school" on subjects;

create policy "Direction generale cree les matieres"
  on subjects for insert to authenticated
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale modifie les matieres"
  on subjects for update to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les matieres"
  on subjects for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

drop policy if exists "Users can create class subjects for their school" on class_subjects;
drop policy if exists "Users can update class subjects from their school" on class_subjects;
drop policy if exists "Users can delete class subjects from their school" on class_subjects;

create policy "Encadrement affecte les matieres aux classes"
  on class_subjects for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Encadrement modifie les affectations"
  on class_subjects for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Encadrement retire les affectations"
  on class_subjects for delete to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

drop policy if exists "Users can create academic years for their school" on academic_years;
drop policy if exists "Users can update academic years from their school" on academic_years;
drop policy if exists "Users can delete academic years from their school" on academic_years;

create policy "Direction generale cree les annees scolaires"
  on academic_years for insert to authenticated
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale modifie les annees scolaires"
  on academic_years for update to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les annees scolaires"
  on academic_years for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

drop policy if exists "Users can create academic periods for their school" on academic_periods;
drop policy if exists "Users can update academic periods from their school" on academic_periods;
drop policy if exists "Users can delete academic periods from their school" on academic_periods;

create policy "Direction generale cree les periodes"
  on academic_periods for insert to authenticated
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale modifie les periodes"
  on academic_periods for update to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Direction generale supprime les periodes"
  on academic_periods for delete to authenticated
  using (
    private.is_direction_generale()
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 6. Les inscriptions en classe
-- =====================================================================

drop policy if exists "Users can create student enrollments for their school" on student_class_enrollments;
drop policy if exists "Users can update student enrollments from their school" on student_class_enrollments;
drop policy if exists "Users can delete student enrollments from their school" on student_class_enrollments;

create policy "Encadrement inscrit en classe"
  on student_class_enrollments for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Encadrement modifie les inscriptions"
  on student_class_enrollments for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Encadrement retire les inscriptions"
  on student_class_enrollments for delete to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );


-- =====================================================================
-- 7. Le travail de l'enseignant — évaluations, notes, présences
-- =====================================================================
-- C'est ici qu'un enseignant écrit, et seulement sur les classes où il
-- a effectivement une matière. La lecture reste ouverte à l'école : un
-- conseil de classe a besoin de la vue d'ensemble.

drop policy if exists "Users can create assessments for their school" on assessments;
drop policy if exists "Users can update assessments from their school" on assessments;
drop policy if exists "Users can delete assessments from their school" on assessments;

create policy "Evaluations creees par l'encadrement ou l'enseignant de la classe"
  on assessments for insert to authenticated
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Evaluations modifiees par l'encadrement ou l'enseignant de la classe"
  on assessments for update to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  )
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

create policy "Evaluations supprimees par l'encadrement ou l'enseignant de la classe"
  on assessments for delete to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id())
  );

drop policy if exists "Users can create grades for their school" on grades;
drop policy if exists "Users can update grades from their school" on grades;
drop policy if exists "Users can delete grades from their school" on grades;

create policy "Notes saisies par l'encadrement ou l'enseignant de la classe"
  on grades for insert to authenticated
  with check (
    (private.is_encadrement() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id())
  );

create policy "Notes corrigees par l'encadrement ou l'enseignant de la classe"
  on grades for update to authenticated
  using (
    (private.is_encadrement() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id())
  )
  with check (
    (private.is_encadrement() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id())
  );

create policy "Notes supprimees par l'encadrement ou l'enseignant de la classe"
  on grades for delete to authenticated
  using (
    (private.is_encadrement() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id())
  );

-- Présences : les policies visaient le rôle « public » et non
-- « authenticated », contrairement aux plus récentes. On en profite
-- pour aligner.
drop policy if exists "Users can view attendance from their school" on attendance;
drop policy if exists "Users can create attendance for their school" on attendance;
drop policy if exists "Users can update attendance from their school" on attendance;
drop policy if exists "Users can delete attendance from their school" on attendance;

create policy "Presences lues dans son ecole"
  on attendance for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid()));

create policy "Presences saisies par l'encadrement ou l'enseignant de la classe"
  on attendance for insert to authenticated
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Presences corrigees par l'encadrement ou l'enseignant de la classe"
  on attendance for update to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Presences supprimees par l'encadrement"
  on attendance for delete to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 8. Emploi du temps et journal des SMS
-- =====================================================================

drop policy if exists "Users can view timetable slots from their school" on timetable_slots;
drop policy if exists "Users can create timetable slots for their school" on timetable_slots;
drop policy if exists "Users can update timetable slots from their school" on timetable_slots;
drop policy if exists "Users can delete timetable slots from their school" on timetable_slots;

create policy "Emploi du temps lu dans son ecole"
  on timetable_slots for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid()));

create policy "Emploi du temps compose par l'encadrement"
  on timetable_slots for insert to authenticated
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Emploi du temps modifie par l'encadrement"
  on timetable_slots for update to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  )
  with check (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Emploi du temps allege par l'encadrement"
  on timetable_slots for delete to authenticated
  using (
    private.is_encadrement()
    and school_id in (select school_id from profiles where id = auth.uid())
  );

-- Les SMS partent aux familles et sont facturés : un enseignant n'a pas
-- à en déclencher ni à lire l'historique de l'établissement.
drop policy if exists "Users can view sms logs from their school" on sms_logs;
drop policy if exists "Users can create sms logs for their school" on sms_logs;

create policy "Journal SMS lu par l'encadrement et la comptabilite"
  on sms_logs for select to authenticated
  using (
    (private.is_encadrement() or private.handles_money())
    and school_id in (select school_id from profiles where id = auth.uid())
  );

create policy "Journal SMS alimente par l'encadrement et la comptabilite"
  on sms_logs for insert to authenticated
  with check (
    (private.is_encadrement() or private.handles_money())
    and school_id in (select school_id from profiles where id = auth.uid())
  );


-- =====================================================================
-- 9. Alignement des policies restantes sur « authenticated »
-- =====================================================================
-- Sans effet pratique — le RLS exige de toute façon un auth.uid() —
-- mais l'incohérence entretient le doute à chaque relecture.

-- On ne change QUE le rôle visé. Élargir qui peut renommer un
-- établissement serait une décision de gouvernance, pas un correctif de
-- sécurité : la restriction à « admin » est donc reconduite à
-- l'identique.
drop policy if exists "Admins can update their school" on schools;

create policy "Admins can update their school"
  on schools for update to authenticated
  using (
    id in (
      select school_id from profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    id in (
      select school_id from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

commit;
