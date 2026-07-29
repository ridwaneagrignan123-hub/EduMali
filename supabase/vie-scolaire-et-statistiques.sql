-- =====================================================================
-- Ridwane — vie scolaire et statistiques
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-29. Ce fichier en est la trace, pas la
-- source : le rejouer sur la production échouerait, les objets existant
-- déjà. Il sert à recréer une base vierge et à relire ce qui a été fait.
--
-- Il complète supabase/rls-roles.sql, qui pose le cloisonnement par rôle.
-- =====================================================================

begin;

-- =====================================================================
-- 1. Le rôle « surveillant »
-- =====================================================================
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role = any (array[
    'admin','teacher','promoteur','directeur_general',
    'directeur_direction','comptable','surveillant'
  ]));

create or replace function private.is_surveillant()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce((select p.role = 'surveillant' from profiles p where p.id = auth.uid()), false); $$;
revoke execute on function private.is_surveillant() from public;
grant execute on function private.is_surveillant() to authenticated;

-- Le surveillant tient la vie scolaire : il lui faut les classes et les
-- enseignants, rien des notes ni de l'argent. Mesuré après application :
-- 3 classes, 3 enseignants, 0 note, 0 paiement, 0 élève.
drop policy if exists "Classes visibles selon le role" on classes;
create policy "Classes visibles selon le role" on classes for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid())
    and (private.is_direction_generale() or private.can_see_money()
         or private.is_surveillant()
         or (private.is_direction_scoped() and direction_id = private.current_direction_id())
         or private.teaches_class(id)));


-- =====================================================================
-- 2. Retards et absences des enseignants
-- =====================================================================
create table if not exists teacher_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  occurred_on date not null default current_date,
  status text not null check (status in ('retard','absence','absence_excusee')),
  minutes_late integer check (minutes_late is null or minutes_late >= 0),
  note text,
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Un même motif ne se relève qu'une fois par jour et par enseignant.
  unique (teacher_id, occurred_on, status)
);
create index if not exists teacher_attendance_school_date_idx
  on teacher_attendance (school_id, occurred_on desc);
alter table teacher_attendance enable row level security;

-- L'enseignant voit SES propres retards — c'est le principe même de
-- l'avertissement — mais pas ceux de ses collègues. Mesuré : sur deux
-- relevés dans son école, il n'en voit qu'un.
create policy "Retards enseignants visibles" on teacher_attendance for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid())
    and (private.is_surveillant() or private.is_encadrement()
         or teacher_id in (select t.id from teachers t where t.profile_id = auth.uid())));

create policy "Retards enseignants saisis par la vie scolaire" on teacher_attendance for insert to authenticated
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Retards enseignants corriges par la vie scolaire" on teacher_attendance for update to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()))
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Retards enseignants effaces par la vie scolaire" on teacher_attendance for delete to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 3. Thèmes au rang
-- =====================================================================
-- Une ligne = un enseignant, un jour, le thème qu'il débattra au rang
-- avant d'entrer en classe. Le surveillant remplit la grille sur la
-- période qu'il choisit.
create table if not exists lineup_themes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  scheduled_on date not null,
  theme text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, scheduled_on)
);
create index if not exists lineup_themes_school_date_idx
  on lineup_themes (school_id, scheduled_on);
alter table lineup_themes enable row level security;

-- Lisible par tout le personnel : l'enseignant concerné doit connaître
-- son thème avant de se présenter au rang.
create policy "Themes au rang lus dans son ecole" on lineup_themes for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid()));

create policy "Themes au rang ecrits par la vie scolaire" on lineup_themes for insert to authenticated
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Themes au rang modifies par la vie scolaire" on lineup_themes for update to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()))
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Themes au rang effaces par la vie scolaire" on lineup_themes for delete to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create trigger lineup_themes_set_updated_at
  before update on lineup_themes
  for each row execute function set_updated_at();


-- =====================================================================
-- 4. Rappels journaliers
-- =====================================================================
create table if not exists daily_reminders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  reminder_date date not null default current_date,
  message text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists daily_reminders_school_date_idx
  on daily_reminders (school_id, reminder_date desc);
alter table daily_reminders enable row level security;

create policy "Rappels lus dans son ecole" on daily_reminders for select to authenticated
  using (school_id in (select school_id from profiles where id = auth.uid()));

create policy "Rappels ecrits par la vie scolaire" on daily_reminders for insert to authenticated
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Rappels modifies par la vie scolaire" on daily_reminders for update to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()))
  with check ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));

create policy "Rappels effaces par la vie scolaire" on daily_reminders for delete to authenticated
  using ((private.is_surveillant() or private.is_encadrement())
    and school_id in (select school_id from profiles where id = auth.uid()));


-- =====================================================================
-- 5. Statistiques agrégées
-- =====================================================================
-- ---------------------------------------------------------------------
-- CES FONCTIONS CONTOURNENT LE RLS. C'EST VOULU.
--
-- Les statistiques doivent être ouvertes à tous, y compris à un
-- enseignant qui ne voit que sa classe ailleurs. SECURITY DEFINER le
-- permet — et n'est sans danger QUE parce qu'elles ne rendent jamais
-- autre chose qu'un agrégat : aucun nom d'élève, aucune note isolée.
--
-- Toute modification qui ferait sortir une colonne nominative de ces
-- fonctions ouvrirait le carnet de notes de toute l'école.
--
-- Elles filtrent sur l'école de l'appelant, et masquent toute classe
-- comptant moins de trois notes : en deçà, une « moyenne » est la note
-- d'un élève reconnaissable.
-- ---------------------------------------------------------------------

create or replace function public.stats_assessments()
returns table (id uuid, titre text, classe text, matiere text, date_eval date, periode text)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.title, c.name, s.name, a.assessment_date, ap.name
  from assessments a
  join classes c on c.id = a.class_id
  left join subjects s on s.id = a.subject_id
  left join academic_periods ap on ap.id = a.academic_period_id
  where a.school_id = (select p.school_id from profiles p where p.id = auth.uid())
  order by a.assessment_date desc nulls last, c.name;
$$;

create or replace function public.stats_classes(p_period_id uuid default null)
returns table (
  classe_id uuid, classe text, direction text,
  eleves bigint, moyenne numeric, taux_reussite numeric,
  note_min numeric, note_max numeric, masque boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with notes as (
    select c.id as cid, c.name as cnom, d.name as dnom, g.student_id,
           -- Ramené sur 20 : sans cela on comparerait un devoir sur 10
           -- à une composition sur 20.
           g.score / nullif(a.max_score, 0) * 20 as note20
    from grades g
    join assessments a on a.id = g.assessment_id
    join classes c on c.id = a.class_id
    left join directions d on d.id = c.direction_id
    where g.school_id = (select p.school_id from profiles p where p.id = auth.uid())
      and (p_period_id is null or a.academic_period_id = p_period_id)
  )
  select cid, cnom, dnom,
    count(distinct student_id),
    case when count(*) >= 3 then round(avg(note20)::numeric, 2) end,
    case when count(*) >= 3 then round(100.0 * count(*) filter (where note20 >= 10) / count(*), 1) end,
    case when count(*) >= 3 then round(min(note20)::numeric, 2) end,
    case when count(*) >= 3 then round(max(note20)::numeric, 2) end,
    count(*) < 3
  from notes
  group by cid, cnom, dnom
  order by cnom;
$$;

create or replace function public.stats_compare_assessments(p_a uuid, p_b uuid)
returns table (
  classe text, eleves_communs bigint,
  moyenne_a numeric, moyenne_b numeric, ecart numeric,
  progressions bigint, regressions bigint, stables bigint, masque boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with mon_ecole as (select p.school_id as sid from profiles p where p.id = auth.uid()),
  paire as (
    select c.name as classe, ga.student_id,
           ga.score / nullif(aa.max_score, 0) * 20 as na,
           gb.score / nullif(ab.max_score, 0) * 20 as nb
    from grades ga
    join assessments aa on aa.id = ga.assessment_id and aa.id = p_a
    join grades gb on gb.student_id = ga.student_id
    join assessments ab on ab.id = gb.assessment_id and ab.id = p_b
    join classes c on c.id = aa.class_id
    where ga.school_id = (select sid from mon_ecole)
      and gb.school_id = (select sid from mon_ecole)
  )
  select classe, count(*),
    case when count(*) >= 3 then round(avg(na)::numeric, 2) end,
    case when count(*) >= 3 then round(avg(nb)::numeric, 2) end,
    case when count(*) >= 3 then round((avg(nb) - avg(na))::numeric, 2) end,
    count(*) filter (where nb > na),
    count(*) filter (where nb < na),
    count(*) filter (where nb = na),
    count(*) < 3
  from paire
  group by classe
  order by classe;
$$;

revoke execute on function public.stats_assessments() from public;
revoke execute on function public.stats_classes(uuid) from public;
revoke execute on function public.stats_compare_assessments(uuid, uuid) from public;
grant execute on function public.stats_assessments() to authenticated;
grant execute on function public.stats_classes(uuid) to authenticated;
grant execute on function public.stats_compare_assessments(uuid, uuid) to authenticated;

commit;


-- =====================================================================
-- 6. Rapport par matière (ajouté après retour d'usage)
-- =====================================================================
-- Le premier jet comptait des NOTES ; le rapport demandé compte des
-- ÉLÈVES ayant la moyenne dans chaque matière. On calcule donc d'abord
-- la moyenne de chaque élève dans chaque matière, pondérée par le
-- coefficient de chaque évaluation, avant de compter ceux qui
-- atteignent 10.

create or replace function public.stats_subjects(
  p_period_id uuid default null,
  p_class_id uuid default null
)
returns table (
  matiere text, eleves bigint, moyenne numeric,
  admis bigint, non_admis bigint, taux_admis numeric, masque boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select coalesce(s.name, 'Sans matiere') as matiere, g.student_id,
           sum(g.score / nullif(a.max_score, 0) * 20 * coalesce(a.coefficient, 1))
             / nullif(sum(coalesce(a.coefficient, 1)), 0) as moy
    from grades g
    join assessments a on a.id = g.assessment_id
    join classes c on c.id = a.class_id
    left join subjects s on s.id = a.subject_id
    where g.school_id = (select p.school_id from profiles p where p.id = auth.uid())
      and (p_period_id is null or a.academic_period_id = p_period_id)
      and (p_class_id is null or c.id = p_class_id)
    group by coalesce(s.name, 'Sans matiere'), g.student_id
  )
  select matiere, count(*),
    case when count(*) >= 3 then round(avg(moy)::numeric, 2) end,
    count(*) filter (where moy >= 10),
    count(*) filter (where moy < 10),
    case when count(*) >= 3 then round(100.0 * count(*) filter (where moy >= 10) / count(*), 1) end,
    count(*) < 3
  from base group by matiere order by matiere;
$$;

create or replace function public.stats_summary(
  p_period_id uuid default null,
  p_class_id uuid default null
)
returns table (
  eleves bigint, moyenne_generale numeric,
  admis bigint, non_admis bigint, taux_admis numeric,
  meilleure numeric, plus_basse numeric, masque boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with par_matiere as (
    select g.student_id, coalesce(s.name, 'Sans matiere') as matiere,
           sum(g.score / nullif(a.max_score, 0) * 20 * coalesce(a.coefficient, 1))
             / nullif(sum(coalesce(a.coefficient, 1)), 0) as moy
    from grades g
    join assessments a on a.id = g.assessment_id
    join classes c on c.id = a.class_id
    left join subjects s on s.id = a.subject_id
    where g.school_id = (select p.school_id from profiles p where p.id = auth.uid())
      and (p_period_id is null or a.academic_period_id = p_period_id)
      and (p_class_id is null or c.id = p_class_id)
    group by g.student_id, coalesce(s.name, 'Sans matiere')
  ),
  par_eleve as (select student_id, avg(moy) as moy_gen from par_matiere group by student_id)
  select count(*),
    case when count(*) >= 3 then round(avg(moy_gen)::numeric, 2) end,
    count(*) filter (where moy_gen >= 10),
    count(*) filter (where moy_gen < 10),
    case when count(*) >= 3 then round(100.0 * count(*) filter (where moy_gen >= 10) / count(*), 1) end,
    case when count(*) >= 3 then round(max(moy_gen)::numeric, 2) end,
    case when count(*) >= 3 then round(min(moy_gen)::numeric, 2) end,
    count(*) < 3
  from par_eleve;
$$;

-- Comparaison de deux périodes, matière par matière, même principe.
create or replace function public.stats_compare_periods(
  p_a uuid, p_b uuid, p_class_id uuid default null
)
returns table (
  matiere text,
  eleves_a bigint, admis_a bigint, non_admis_a bigint, taux_a numeric, moyenne_a numeric,
  eleves_b bigint, admis_b bigint, non_admis_b bigint, taux_b numeric, moyenne_b numeric,
  ecart_taux numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select a.academic_period_id as periode, coalesce(s.name, 'Sans matiere') as matiere,
           g.student_id,
           sum(g.score / nullif(a.max_score, 0) * 20 * coalesce(a.coefficient, 1))
             / nullif(sum(coalesce(a.coefficient, 1)), 0) as moy
    from grades g
    join assessments a on a.id = g.assessment_id
    join classes c on c.id = a.class_id
    left join subjects s on s.id = a.subject_id
    where g.school_id = (select p.school_id from profiles p where p.id = auth.uid())
      and a.academic_period_id in (p_a, p_b)
      and (p_class_id is null or c.id = p_class_id)
    group by a.academic_period_id, coalesce(s.name, 'Sans matiere'), g.student_id
  ),
  agrege as (
    select matiere, periode, count(*) as eleves,
      count(*) filter (where moy >= 10) as admis,
      count(*) filter (where moy < 10) as non_admis,
      case when count(*) >= 3 then round(100.0 * count(*) filter (where moy >= 10) / count(*), 1) end as taux,
      case when count(*) >= 3 then round(avg(moy)::numeric, 2) end as moyenne
    from base group by matiere, periode
  )
  select coalesce(a.matiere, b.matiere),
    coalesce(a.eleves, 0), coalesce(a.admis, 0), coalesce(a.non_admis, 0), a.taux, a.moyenne,
    coalesce(b.eleves, 0), coalesce(b.admis, 0), coalesce(b.non_admis, 0), b.taux, b.moyenne,
    case when a.taux is not null and b.taux is not null then round(b.taux - a.taux, 1) end
  from (select * from agrege where periode = p_a) a
  full outer join (select * from agrege where periode = p_b) b on b.matiere = a.matiere
  order by 1;
$$;

revoke execute on function public.stats_subjects(uuid, uuid) from public;
revoke execute on function public.stats_summary(uuid, uuid) from public;
revoke execute on function public.stats_compare_periods(uuid, uuid, uuid) from public;
grant execute on function public.stats_subjects(uuid, uuid) to authenticated;
grant execute on function public.stats_summary(uuid, uuid) to authenticated;
grant execute on function public.stats_compare_periods(uuid, uuid, uuid) to authenticated;
