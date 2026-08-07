-- =====================================================================
-- LES DIRECTIONS MARCHENT EN COUPLE — ÉCOLE FRANCO-ARABE
-- =====================================================================
--
-- Règle donnée par l'école, mot pour mot :
--
--   « Les élèves de la direction Français A du premier cycle sont les
--     mêmes élèves que ceux de la direction Arabe A du premier cycle.
--     Attention aux lettres : il peut y avoir une Français B et une
--     Arabe B qui marchent également en couple. Mais ils ne partagent
--     que les ÉLÈVES — pas les matières, ni les notes, ni les moyennes,
--     ni les bulletins, ni les enseignants. »
--
-- Un couple est donc identifié par (école, CYCLE, LETTRE). La filière
-- distingue les deux directeurs à l'intérieur du couple.
--
-- CE QUI ÉTAIT FAUX
--
-- Une classe appartenait à UNE direction. Le directeur français d'un
-- couple voyait donc 0 classe, 0 élève, 0 enseignant — mesuré en
-- production sur EPP-Worgou — alors qu'il est le directeur des mêmes
-- enfants.
--
-- LE PARTAGE, ET SA LIMITE EXACTE
--
--   partagé par le couple ..... classes, élèves, inscriptions, codes
--                               d'accès des familles, présences
--                               journalières
--   propre à chaque direction .. matières de classe, titulaires,
--                               évaluations, notes, emploi du temps,
--                               devoirs, présences par leçon,
--                               enseignants
--
-- `attendance` est partagée par CONSTRUCTION et non par choix : la table
-- porte UNIQUE (student_id, attendance_date), une seule ligne par enfant
-- et par jour. Elle ne peut pas être doublée par filière sans changer le
-- schéma. On le dit plutôt que de laisser croire à un arbitrage.
--
-- LE PIÈGE QU'IL A FALLU DÉSAMORCER
--
-- Les règles « propres à chaque direction » testaient LA DIRECTION DE LA
-- CLASSE. La classe devenant partagée, ce test aurait empêché le
-- directeur français d'accrocher SES matières à la classe commune. Il
-- fallait donc, partout, remplacer ce test par deux :
--
--     la classe est dans mon couple   +   l'objet est de ma filière
--
-- Quatre règles n'avaient AUCUN test de filière et le réclamaient
-- désormais : la lecture des matières de classe, la lecture des
-- titulaires, la lecture de l'emploi du temps, et les trois écritures
-- d'évaluations. Sans elles, ouvrir la classe au couple aurait ouvert
-- les notes avec.
-- =====================================================================

/* Deux directions du même (école, cycle, lettre) forment un couple. */
create or replace function private.direction_de_mon_couple(target_direction_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from directions cible, profiles moi, directions mienne
    where cible.id = target_direction_id
      and moi.id = auth.uid()
      and mienne.id = moi.direction_id
      and cible.school_id = mienne.school_id
      and cible.cycle  is not distinct from mienne.cycle
      and cible.groupe is not distinct from mienne.groupe
  );
$$;

/*
 * `is not distinct from` et non `=` : une lettre nulle est une valeur,
 * celle du couple unique d'un cycle. Avec `=`, deux directions sans
 * lettre ne se reconnaîtraient jamais.
 */
create or replace function private.classe_de_mon_couple(target_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select private.direction_de_mon_couple(
    (select c.direction_id from classes c where c.id = target_class_id)
  );
$$;

create or replace function private.evaluation_de_mon_couple(target_assessment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select private.classe_de_mon_couple(
    (select a.class_id from assessments a where a.id = target_assessment_id)
  );
$$;

/*
 * L'élève suit la CLASSE, et la classe suit le couple. Le nom de la
 * fonction est conservé : il est câblé dans les policies de `students`
 * et de `student_access_codes`, qui n'ont donc pas à être réécrites.
 */
create or replace function private.student_in_my_direction(target_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from student_class_enrollments e
    where e.student_id = target_student_id
      and private.classe_de_mon_couple(e.class_id)
  );
$$;

/*
 * L'enseignant, lui, ne se partage PAS. On ouvre la classe au couple
 * mais on referme sur la filière : l'enseignant est le mien s'il tient
 * une matière de MON programme dans une classe du couple, ou s'il est
 * titulaire de MA filière. La salle d'attente nominative posée
 * précédemment (created_by) est conservée telle quelle.
 */
create or replace function private.enseignant_de_ma_direction(target_teacher_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when not private.is_direction_scoped() then true
    else
      exists (
        select 1 from class_subjects cs
        where cs.teacher_id = target_teacher_id
          and private.classe_de_mon_couple(cs.class_id)
          and private.mon_programme(cs.subject_id))
      or exists (
        select 1 from class_head_teachers h
        where h.teacher_id = target_teacher_id
          and private.classe_de_mon_couple(h.class_id)
          and (private.ma_filiere() is null
               or not (h.filiere is distinct from private.ma_filiere())))
      or (
        not exists (select 1 from class_subjects cs
                     where cs.teacher_id = target_teacher_id)
        and not exists (select 1 from class_head_teachers h
                         where h.teacher_id = target_teacher_id)
        and coalesce(
              (select p.direction_id from teachers t
                 join profiles p on p.id = t.created_by
                where t.id = target_teacher_id),
              private.current_direction_id())
            is not distinct from private.current_direction_id()
      )
  end;
$$;

-- =====================================================================
-- LES POLICIES RÉÉCRITES
-- =====================================================================
--
-- Appliquées par les migrations `couple_de_directions_partage_les_eleves`
-- et `couple_partage_les_eleves_pas_le_programme`. Le remplacement est
-- mécanique et tient en une ligne :
--
--     private.class_direction_id(class_id) = private.current_direction_id()
--   devient
--     private.classe_de_mon_couple(class_id)
--
-- avec, pour les tables de programme, l'ajout du test de filière quand
-- il manquait.
--
--   PARTAGÉES        classes(r) · attendance(r)
--                    student_class_enrollments(r,a,w,d)
--                    students et student_access_codes suivent la
--                    fonction student_in_my_direction ci-dessus
--
--   FILIÈRE AJOUTÉE  class_subjects(r) · class_head_teachers(r)
--                    timetable_slots(r) · assessments(a,w,d)
--
--   FILIÈRE GARDÉE   class_subjects(a,w,d) · class_head_teachers(a,w,d)
--                    timetable_slots(a,w,d) · assessments(r)
--                    grades(r) · homework(a) · lesson_attendance(r)
--
-- L'ÉCRITURE DE LA CLASSE ELLE-MÊME N'EST PAS PARTAGÉE : créer,
-- renommer ou supprimer une classe reste au directeur de la direction
-- qui la porte. Le couple la voit et s'en sert ; il ne la refait pas.
--
-- MESURE, sous JWT réel, transactions annulées :
--
--   Mahmoud (français A), avant ......... 0 classe, 0 élève, 0 enseignant
--   Mahmoud (français A), après ......... 6 classes, 17 élèves
--   les deux accrochent leur matière à la MÊME classe : accepté
--   Mahmoud voit .... sa matière seule, son enseignant seul
--   Amidou voit ..... « ZZ Coran », « ZZARABE » — pas les français
--   Mahmoud en SECOND cycle ............. 0 classe, 0 élève
-- =====================================================================
