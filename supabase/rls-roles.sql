-- =====================================================================
-- Ridwane — cloisonnement des rôles
-- =====================================================================
-- À exécuter d'un seul bloc dans l'éditeur SQL de Supabase.
--
-- Tout tient dans une transaction : chaque « drop » est immédiatement
-- suivi de son « create ». Aucune table ne se retrouve un instant sans
-- protection, et si une seule ligne échoue, rien n'est appliqué.
--
-- ---------------------------------------------------------------------
-- CE QUI ÉTAIT EN PLACE
--
-- Toutes les policies ne vérifiaient que school_id, jamais le rôle.
-- Mesuré sur le compte enseignant réel, en transaction annulée : il
-- pouvait supprimer un élève, supprimer les autres enseignants,
-- supprimer toutes les classes, créer des frais, enregistrer des
-- paiements et lire toute la comptabilité. Seul le menu masquait ces
-- pages — et un menu se contourne en tapant l'adresse.
--
-- Le rôle lui-même était déjà protégé : le déclencheur
-- profiles_prevent_privilege_escalation interdit de modifier son propre
-- rôle, son école ou son statut. On n'y touche pas.
--
-- ---------------------------------------------------------------------
-- LA RÈGLE APPLIQUÉE ICI
--
--   Enseignant ......... ses classes seulement. Saisit les notes de ses
--                        élèves, consulte moyennes et bulletins. Ne voit
--                        rien des finances. N'inscrit aucun élève.
--   Directeur de dir. .. tout dans sa direction, sauf modifier les notes
--                        saisies par l'enseignant — il les lit et les
--                        imprime. Aucun accès aux finances.
--   Directeur général .. tout l'établissement, sauf les finances.
--   Comptable .......... rien, sauf l'état des paiements.
--   Promoteur .......... voit tout, y compris les finances et le journal
--                        d'activité. Ne modifie ni les notes ni les
--                        montants des frais.
--   Admin .............. compte technique de l'établissement, non
--                        restreint : c'est lui qui répare quand un
--                        cloisonnement bloque à tort.
--
-- Les notes ne sont modifiables QUE par l'enseignant de la classe et
-- par l'admin. C'est la règle que vous avez posée pour les directeurs
-- et le promoteur ; l'étendre au directeur général est la seule lecture
-- cohérente — une note appartient à celui qui l'a donnée.
-- ---------------------------------------------------------------------

begin;

-- =====================================================================
-- 1. Fonctions d'aide
-- =====================================================================
-- Dans « private » : ce schéma n'est pas exposé par PostgREST, ces
-- fonctions ne sont donc pas appelables depuis l'API.
--
-- SECURITY DEFINER parce qu'elles lisent « profiles » : sans cela, la
-- policy de profiles s'appliquerait à l'intérieur d'une policy qui la
-- consulte, et l'on tournerait en rond.

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select p.role = 'admin' from profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.is_promoteur()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select p.role = 'promoteur' from profiles p where p.id = auth.uid()), false);
$$;

-- Vue d'ensemble de l'établissement : ne dit rien des finances.
create or replace function private.is_direction_generale()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select p.role in ('admin', 'promoteur', 'directeur_general')
     from profiles p where p.id = auth.uid()),
    false);
$$;

-- Encadrement : direction générale + directeur d'une direction.
create or replace function private.is_encadrement()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select p.role in ('admin', 'promoteur', 'directeur_general', 'directeur_direction')
     from profiles p where p.id = auth.uid()),
    false);
$$;

-- Qui voit l'argent. Le directeur général en est volontairement exclu.
create or replace function private.can_see_money()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select p.role in ('admin', 'promoteur', 'comptable')
     from profiles p where p.id = auth.uid()),
    false);
$$;

-- Qui touche à l'argent. Le promoteur voit mais ne modifie pas : il ne
-- change pas les montants en cours de route.
create or replace function private.can_write_money()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select p.role in ('admin', 'comptable')
     from profiles p where p.id = auth.uid()),
    false);
$$;

create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select p.role = 'teacher' from profiles p where p.id = auth.uid()), false);
$$;

-- Les classes où l'enseignant a effectivement une matière.
--
-- Le contrôle « p.role = 'teacher' » n'est pas redondant. Sans lui, un
-- compte passé d'enseignant à comptable gardait l'accès aux notes tant
-- que sa fiche enseignant subsistait — mesuré : il voyait les huit
-- notes de son ancienne classe. Le lien d'enseignement ne suffit pas,
-- il faut aussi porter le rôle.
create or replace function private.teaches_class(target_class_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from class_subjects cs
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where cs.class_id = target_class_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$$;

create or replace function private.teaches_assessment(target_assessment_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from assessments a
    join class_subjects cs on cs.class_id = a.class_id
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where a.id = target_assessment_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$$;

-- Un élève inscrit dans l'une des classes de l'enseignant.
create or replace function private.teaches_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from student_class_enrollments e
    join class_subjects cs on cs.class_id = e.class_id
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where e.student_id = target_student_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$$;

-- Un élève inscrit dans une classe de la direction de l'appelant.
create or replace function private.student_in_my_direction(target_student_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from student_class_enrollments e
    join classes c on c.id = e.class_id
    where e.student_id = target_student_id
      and c.direction_id = (select p.direction_id from profiles p where p.id = auth.uid()));
$$;

revoke execute on function private.is_admin() from public;
revoke execute on function private.is_promoteur() from public;
revoke execute on function private.is_direction_generale() from public;
revoke execute on function private.is_encadrement() from public;
revoke execute on function private.can_see_money() from public;
revoke execute on function private.can_write_money() from public;
revoke execute on function private.is_teacher() from public;
revoke execute on function private.teaches_class(uuid) from public;
revoke execute on function private.teaches_assessment(uuid) from public;
revoke execute on function private.teaches_student(uuid) from public;
revoke execute on function private.student_in_my_direction(uuid) from public;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_promoteur() to authenticated;
grant execute on function private.is_direction_generale() to authenticated;
grant execute on function private.is_encadrement() to authenticated;
grant execute on function private.can_see_money() to authenticated;
grant execute on function private.can_write_money() to authenticated;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.teaches_class(uuid) to authenticated;
grant execute on function private.teaches_assessment(uuid) to authenticated;
grant execute on function private.teaches_student(uuid) to authenticated;
grant execute on function private.student_in_my_direction(uuid) to authenticated;


-- =====================================================================
-- 2. Les finances
-- =====================================================================
-- Ni l'enseignant ni le directeur général n'y ont accès. Le promoteur
-- lit sans écrire. Le comptable est le seul, avec l'admin, à saisir.

drop policy if exists "Users can view fee assessments from their school" on fee_assessments;
drop policy if exists "Users can create fee assessments for their school" on fee_assessments;
drop policy if exists "Users can update fee assessments from their school" on fee_assessments;
drop policy if exists "Users can delete fee assessments from their school" on fee_assessments;

create policy "Frais lus par la comptabilite et le promoteur"
  on fee_assessments for select to authenticated
  using (private.can_see_money()
         and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Frais crees par la comptabilite"
  on fee_assessments for insert to authenticated
  with check (private.can_write_money()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Frais modifies par la comptabilite"
  on fee_assessments for update to authenticated
  using (private.can_write_money()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.can_write_money()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Frais supprimes par l'admin"
  on fee_assessments for delete to authenticated
  using (private.is_admin()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can view fee payments from their school" on fee_payments;
drop policy if exists "Users can create fee payments for their school" on fee_payments;
drop policy if exists "Users can update fee payments from their school" on fee_payments;
drop policy if exists "Users can delete fee payments from their school" on fee_payments;

create policy "Paiements lus par la comptabilite et le promoteur"
  on fee_payments for select to authenticated
  using (private.can_see_money()
         and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Paiements enregistres par la comptabilite"
  on fee_payments for insert to authenticated
  with check (private.can_write_money()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Paiements corriges par la comptabilite"
  on fee_payments for update to authenticated
  using (private.can_write_money()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.can_write_money()
              and school_id in (select school_id from profiles where id = auth.uid()));

-- Un paiement effacé est une somme perdue pour la famille comme pour
-- l'école : seul l'admin peut le faire.
create policy "Paiements supprimes par l'admin"
  on fee_payments for delete to authenticated
  using (private.is_admin()
         and school_id in (select school_id from profiles where id = auth.uid()));

-- Les montants de référence par classe étaient lisibles par tous.
drop policy if exists "Users can view fee class defaults from their school" on fee_class_defaults;

create policy "Montants de reference lus par la comptabilite et le promoteur"
  on fee_class_defaults for select to authenticated
  using (private.can_see_money()
         and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 3. Les élèves
-- =====================================================================
-- L'enseignant ne voit que les élèves de ses classes. Le comptable les
-- voit tous, sans quoi il ne saurait pas qui a payé.

drop policy if exists "Users can view students from their school" on students;
drop policy if exists "Users can create students for their school" on students;
drop policy if exists "Users can update students from their school" on students;
drop policy if exists "Users can delete students from their school" on students;

create policy "Eleves visibles selon le role"
  on students for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or private.can_see_money()
      or (private.is_direction_scoped() and private.student_in_my_direction(id))
      or private.teaches_student(id)
    ));

create policy "Encadrement inscrit les eleves"
  on students for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Encadrement modifie les eleves"
  on students for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped() or private.student_in_my_direction(id)))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale supprime les eleves"
  on students for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can view student enrollments from their school" on student_class_enrollments;
drop policy if exists "Users can create student enrollments for their school" on student_class_enrollments;
drop policy if exists "Users can update student enrollments from their school" on student_class_enrollments;
drop policy if exists "Users can delete student enrollments from their school" on student_class_enrollments;

create policy "Inscriptions visibles selon le role"
  on student_class_enrollments for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or private.can_see_money()
      or (private.is_direction_scoped()
          and private.class_direction_id(class_id) = private.current_direction_id())
      or private.teaches_class(class_id)
    ));

create policy "Encadrement inscrit en classe"
  on student_class_enrollments for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid())
              and (not private.is_direction_scoped()
                   or private.class_direction_id(class_id) = private.current_direction_id()));

create policy "Encadrement modifie les inscriptions"
  on student_class_enrollments for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped()
              or private.class_direction_id(class_id) = private.current_direction_id()))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Encadrement retire les inscriptions"
  on student_class_enrollments for delete to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped()
              or private.class_direction_id(class_id) = private.current_direction_id()));


-- =====================================================================
-- 4. Les classes et la structure
-- =====================================================================

drop policy if exists "Users can view classes from their school" on classes;
drop policy if exists "Users can create classes for their school" on classes;
drop policy if exists "Users can update classes from their school" on classes;
drop policy if exists "Users can delete classes from their school" on classes;

create policy "Classes visibles selon le role"
  on classes for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or private.can_see_money()
      or (private.is_direction_scoped() and direction_id = private.current_direction_id())
      or private.teaches_class(id)
    ));

create policy "Encadrement cree les classes"
  on classes for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid())
              and (not private.is_direction_scoped()
                   or direction_id = private.current_direction_id()));

create policy "Encadrement modifie les classes"
  on classes for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped()
              or direction_id = private.current_direction_id()))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid())
              and (not private.is_direction_scoped()
                   or direction_id = private.current_direction_id()));

create policy "Direction generale supprime les classes"
  on classes for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can create subjects for their school" on subjects;
drop policy if exists "Users can update subjects from their school" on subjects;
drop policy if exists "Users can delete subjects from their school" on subjects;

create policy "Direction generale cree les matieres"
  on subjects for insert to authenticated
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale modifie les matieres"
  on subjects for update to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale supprime les matieres"
  on subjects for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can create class subjects for their school" on class_subjects;
drop policy if exists "Users can update class subjects from their school" on class_subjects;
drop policy if exists "Users can delete class subjects from their school" on class_subjects;

create policy "Encadrement affecte les matieres aux classes"
  on class_subjects for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid())
              and (not private.is_direction_scoped()
                   or private.class_direction_id(class_id) = private.current_direction_id()));

create policy "Encadrement modifie les affectations"
  on class_subjects for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped()
              or private.class_direction_id(class_id) = private.current_direction_id()))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Encadrement retire les affectations"
  on class_subjects for delete to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid())
         and (not private.is_direction_scoped()
              or private.class_direction_id(class_id) = private.current_direction_id()));

drop policy if exists "Users can create teachers for their school" on teachers;
drop policy if exists "Users can update teachers from their school" on teachers;
drop policy if exists "Users can delete teachers from their school" on teachers;

create policy "Encadrement cree les enseignants"
  on teachers for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Encadrement modifie les enseignants"
  on teachers for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale supprime les enseignants"
  on teachers for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can create academic years for their school" on academic_years;
drop policy if exists "Users can update academic years from their school" on academic_years;
drop policy if exists "Users can delete academic years from their school" on academic_years;

create policy "Direction generale cree les annees scolaires"
  on academic_years for insert to authenticated
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale modifie les annees scolaires"
  on academic_years for update to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale supprime les annees scolaires"
  on academic_years for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can create academic periods for their school" on academic_periods;
drop policy if exists "Users can update academic periods from their school" on academic_periods;
drop policy if exists "Users can delete academic periods from their school" on academic_periods;

create policy "Direction generale cree les periodes"
  on academic_periods for insert to authenticated
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale modifie les periodes"
  on academic_periods for update to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.is_direction_generale()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Direction generale supprime les periodes"
  on academic_periods for delete to authenticated
  using (private.is_direction_generale()
         and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 5. Évaluations et notes
-- =====================================================================
-- La note appartient à l'enseignant qui l'a donnée. Personne d'autre ne
-- la modifie — ni le directeur, ni le directeur général, ni le
-- promoteur. Tous la lisent et l'impriment.
--
-- L'admin fait exception : c'est le compte qui répare, et une note
-- fausse doit pouvoir être corrigée même si l'enseignant est parti.

drop policy if exists "Users can view assessments from their school" on assessments;
drop policy if exists "Users can create assessments for their school" on assessments;
drop policy if exists "Users can update assessments from their school" on assessments;
drop policy if exists "Users can delete assessments from their school" on assessments;

create policy "Evaluations visibles selon le role"
  on assessments for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or (private.is_direction_scoped()
          and private.class_direction_id(class_id) = private.current_direction_id())
      or private.teaches_class(class_id)
    ));

create policy "Evaluations creees par l'enseignant ou l'encadrement"
  on assessments for insert to authenticated
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id()));

create policy "Evaluations modifiees par l'enseignant ou l'encadrement"
  on assessments for update to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id()))
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Evaluations supprimees par l'enseignant ou l'encadrement"
  on assessments for delete to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.class_direction_id(class_id) = private.current_direction_id()));

drop policy if exists "Users can view grades from their school" on grades;
drop policy if exists "Users can create grades for their school" on grades;
drop policy if exists "Users can update grades from their school" on grades;
drop policy if exists "Users can delete grades from their school" on grades;

create policy "Notes visibles selon le role"
  on grades for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or (private.is_direction_scoped()
          and private.assessment_direction_id(assessment_id) = private.current_direction_id())
      or private.teaches_assessment(assessment_id)
    ));

create policy "Notes saisies par l'enseignant de la classe"
  on grades for insert to authenticated
  with check (
    (private.is_admin() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Notes corrigees par l'enseignant de la classe"
  on grades for update to authenticated
  using (
    (private.is_admin() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid()))
  with check (
    (private.is_admin() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Notes supprimees par l'enseignant de la classe"
  on grades for delete to authenticated
  using (
    (private.is_admin() or private.teaches_assessment(assessment_id))
    and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 6. Présences, emploi du temps, SMS
-- =====================================================================
-- Ces policies visaient le rôle « public » et non « authenticated ».
-- Sans effet pratique, mais l'incohérence entretenait le doute.

drop policy if exists "Users can view attendance from their school" on attendance;
drop policy if exists "Users can create attendance for their school" on attendance;
drop policy if exists "Users can update attendance from their school" on attendance;
drop policy if exists "Users can delete attendance from their school" on attendance;

create policy "Presences visibles selon le role"
  on attendance for select to authenticated
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    and (
      private.is_direction_generale()
      or (private.is_direction_scoped()
          and private.class_direction_id(class_id) = private.current_direction_id())
      or private.teaches_class(class_id)
    ));

create policy "Presences saisies par l'enseignant ou l'encadrement"
  on attendance for insert to authenticated
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Presences corrigees par l'enseignant ou l'encadrement"
  on attendance for update to authenticated
  using (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid()))
  with check (
    (private.is_encadrement() or private.teaches_class(class_id))
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Presences supprimees par l'encadrement"
  on attendance for delete to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can view timetable slots from their school" on timetable_slots;
drop policy if exists "Users can create timetable slots for their school" on timetable_slots;
drop policy if exists "Users can update timetable slots from their school" on timetable_slots;
drop policy if exists "Users can delete timetable slots from their school" on timetable_slots;

create policy "Emploi du temps lu dans son ecole"
  on timetable_slots for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid()));

create policy "Emploi du temps compose par l'encadrement"
  on timetable_slots for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Emploi du temps modifie par l'encadrement"
  on timetable_slots for update to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid()))
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Emploi du temps allege par l'encadrement"
  on timetable_slots for delete to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid()));

drop policy if exists "Users can view sms logs from their school" on sms_logs;
drop policy if exists "Users can create sms logs for their school" on sms_logs;

create policy "Journal SMS lu par l'encadrement"
  on sms_logs for select to authenticated
  using (private.is_encadrement()
         and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Journal SMS alimente par l'encadrement"
  on sms_logs for insert to authenticated
  with check (private.is_encadrement()
              and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 7. Le journal d'activité du promoteur
-- =====================================================================
-- Le promoteur est le seul à devoir savoir ce qui se passe sur la
-- plateforme. Les lignes sont écrites par des déclencheurs en SECURITY
-- DEFINER : personne ne peut donc en insérer, en modifier ni en
-- supprimer depuis l'application — un journal que l'on peut retoucher
-- ne vaut rien.

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,
  actor_role text,
  action text not null,
  entity text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_school_date_idx
  on activity_log (school_id, created_at desc);

alter table activity_log enable row level security;

drop policy if exists "Journal d'activite lu par le promoteur" on activity_log;

create policy "Journal d'activite lu par le promoteur"
  on activity_log for select to authenticated
  using ((private.is_promoteur() or private.is_admin())
         and school_id in (select school_id from profiles where id = auth.uid()));

create or replace function private.record_activity()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  ligne record;
  qui record;
  libelle text;
  quoi text;
  quand_action text;
begin
  -- Pas de « case » ici : PL/pgSQL refuse d'unifier OLD et NEW dans une
  -- même expression, ils n'ont pas le même type au moment de l'analyse.
  if tg_op = 'DELETE' then
    ligne := old;
  else
    ligne := new;
  end if;

  select p.first_name, p.last_name, p.role, p.school_id
    into qui
  from profiles p where p.id = auth.uid();

  -- Écrit hors session applicative (migration, service role) : rien à
  -- journaliser, on ne saurait pas au nom de qui.
  if qui.school_id is null then
    return ligne;
  end if;

  quand_action := case tg_op
    when 'INSERT' then 'creation'
    when 'UPDATE' then 'modification'
    else 'suppression' end;

  case tg_table_name
    when 'grades' then
      quoi := 'note';
      select 'Note de ' || s.last_name || ' ' || s.first_name
             || ' : ' || coalesce(ligne.score::text, '—')
        into libelle
      from students s where s.id = ligne.student_id;
    when 'fee_payments' then
      quoi := 'paiement';
      libelle := 'Paiement de ' || coalesce(ligne.amount_paid::text, '0') || ' F';
    when 'fee_assessments' then
      quoi := 'frais';
      libelle := 'Frais de ' || coalesce(ligne.amount_due::text, '0') || ' F';
    when 'students' then
      quoi := 'eleve';
      libelle := 'Eleve ' || coalesce(ligne.last_name, '') || ' ' || coalesce(ligne.first_name, '');
    when 'student_class_enrollments' then
      quoi := 'inscription';
      select 'Inscription en ' || c.name into libelle
      from classes c where c.id = ligne.class_id;
    when 'assessments' then
      quoi := 'evaluation';
      libelle := 'Evaluation ' || coalesce(ligne.title, '');
    else
      quoi := tg_table_name;
      libelle := tg_table_name;
  end case;

  insert into activity_log (school_id, actor_id, actor_name, actor_role, action, entity, summary)
  values (
    ligne.school_id,
    auth.uid(),
    -- nullif : un profil sans nom donnerait une chaîne vide, que
    -- l'affichage prendrait pour un nom. Mieux vaut rien, et retomber
    -- sur le rôle.
    nullif(trim(coalesce(qui.first_name, '') || ' ' || coalesce(qui.last_name, '')), ''),
    qui.role,
    quand_action,
    quoi,
    coalesce(libelle, quoi)
  );

  return ligne;
end;
$$;

drop trigger if exists log_grades on grades;
create trigger log_grades after insert or update or delete on grades
  for each row execute function private.record_activity();

drop trigger if exists log_fee_payments on fee_payments;
create trigger log_fee_payments after insert or update or delete on fee_payments
  for each row execute function private.record_activity();

drop trigger if exists log_fee_assessments on fee_assessments;
create trigger log_fee_assessments after insert or update or delete on fee_assessments
  for each row execute function private.record_activity();

drop trigger if exists log_students on students;
create trigger log_students after insert or update or delete on students
  for each row execute function private.record_activity();

drop trigger if exists log_enrollments on student_class_enrollments;
create trigger log_enrollments after insert or update or delete on student_class_enrollments
  for each row execute function private.record_activity();

drop trigger if exists log_assessments on assessments;
create trigger log_assessments after insert or update or delete on assessments
  for each row execute function private.record_activity();


-- =====================================================================
-- 8. Alignement de la dernière policy sur « authenticated »
-- =====================================================================
-- Élargir qui peut renommer un établissement relèverait de votre
-- gouvernance, pas d'un correctif de sécurité : la restriction à
-- « admin » est reconduite à l'identique.

drop policy if exists "Admins can update their school" on schools;

create policy "Admins can update their school"
  on schools for update to authenticated
  using (id in (select school_id from profiles where id = auth.uid() and role = 'admin'))
  with check (id in (select school_id from profiles where id = auth.uid() and role = 'admin'));

commit;
