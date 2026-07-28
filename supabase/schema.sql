-- =====================================================================
-- Ridwane — état de référence du schéma
--
-- Généré par introspection de la base de production le 2026-07-27,
-- et non réécrit de mémoire : chaque contrainte, policy et fonction
-- ci-dessous a été lue dans pg_catalog.
--
-- ⚠️  NE PAS EXÉCUTER SUR LA BASE EXISTANTE.
--     Ce fichier sert à recréer une base VIERGE (environnement local,
--     base de test, reprise après sinistre). Sur la base de production
--     il échouerait, les objets existant déjà.
--
-- Voir supabase/README.md pour la marche à suivre et les limites.
-- =====================================================================

-- Schéma technique non exposé par PostgREST : il héberge les fonctions
-- utilisées par les policies, qui ne doivent pas être appelables via l'API.
create schema if not exists private;
grant usage on schema private to authenticated;


-- =====================================================================
-- 1. Tables
-- =====================================================================

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  address text,
  phone text,
  email text,
  logo_url text,
  -- Paramètres pédagogiques configurables par établissement.
  grading_scale numeric(5,2) not null default 20,
  appreciation_excellent numeric(5,2) not null default 18,
  appreciation_very_good numeric(5,2) not null default 16,
  appreciation_good numeric(5,2) not null default 14,
  appreciation_fair numeric(5,2) not null default 10,
  constraint schools_grading_scale_check
    check ((grading_scale > (0)::numeric) and (grading_scale <= (100)::numeric)),
  constraint schools_appreciation_order_check
    check ((appreciation_excellent > appreciation_very_good)
      and (appreciation_very_good > appreciation_good)
      and (appreciation_good > appreciation_fair)
      and (appreciation_fair >= (0)::numeric)
      and (appreciation_excellent <= grading_scale))
);

create table public.directions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  constraint directions_unique_name unique (school_id, name)
);

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  school_id uuid references public.schools(id),
  first_name text,
  last_name text,
  role text,
  phone text,
  is_active boolean not null default true,
  -- Renseigné uniquement pour le rôle directeur_direction.
  direction_id uuid references public.directions(id) on delete set null,
  constraint profiles_role_check check (role = any (array[
    'admin'::text, 'teacher'::text, 'promoteur'::text,
    'directeur_general'::text, 'directeur_direction'::text, 'comptable'::text
  ]))
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  student_number text,
  address text,
  parent_name text,
  parent_phone text,
  -- Colonne héritée, non utilisée par l'application (voir README).
  matricule text,
  /*
   * URL publique de la photo d'identité, servie par le bucket
   * « student-photos ». Le fichier est rangé sous {school_id}/{student_id}
   * — ce découpage n'est pas cosmétique : les policies du bucket
   * comparent le premier segment du chemin au school_id de l'appelant.
   */
  photo_url text
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  specialty text,
  hire_date date,
  status text not null default 'active'::text,
  profile_id uuid references public.profiles(id) on delete cascade,
  constraint teachers_profile_id_unique unique (profile_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  description text,
  coefficient numeric not null default 1
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  level text,
  -- Colonne texte héritée, distincte de la table academic_years.
  academic_year text,
  -- SET NULL et non CASCADE : supprimer une direction détache ses classes,
  -- elle ne doit jamais les détruire.
  direction_id uuid references public.directions(id) on delete set null
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  constraint academic_years_dates_check check (end_date > start_date),
  constraint academic_years_unique_name unique (school_id, name)
);

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  period_type text not null default 'trimester'::text,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  constraint academic_periods_dates_check check (end_date > start_date),
  constraint academic_periods_type_check
    check (period_type = any (array['trimester'::text, 'semester'::text, 'term'::text])),
  constraint academic_periods_unique_name unique (academic_year_id, name)
);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  coefficient numeric not null default 1,
  constraint class_subjects_unique_assignment unique (class_id, subject_id)
);

create table public.student_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  -- Un élève n'appartient qu'à une classe par année scolaire.
  constraint student_class_enrollments_unique unique (student_id, academic_year_id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  academic_period_id uuid not null references public.academic_periods(id) on delete cascade,
  title text not null,
  assessment_type text not null default 'test'::text,
  max_score numeric not null default 20,
  coefficient numeric not null default 1,
  assessment_date date not null,
  constraint assessments_max_score_check check (max_score > (0)::numeric),
  constraint assessments_coefficient_check check (coefficient > (0)::numeric),
  constraint assessments_type_check check (assessment_type = any (array[
    'test'::text, 'homework'::text, 'exam'::text, 'composition'::text, 'other'::text
  ]))
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric not null,
  constraint grades_score_check check (score >= (0)::numeric),
  -- Une seule note par élève et par évaluation : c'est sur cette contrainte
  -- que s'appuie la reprise de la file d'attente hors ligne.
  constraint grades_unique_student_assessment unique (assessment_id, student_id)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  attendance_date date not null,
  status text not null,
  note text,
  constraint attendance_status_check check (status = any (array[
    'present'::text, 'absent'::text, 'late'::text, 'excused'::text
  ])),
  constraint attendance_student_id_attendance_date_key unique (student_id, attendance_date)
);

create table public.fee_assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  amount_due numeric(12,2) not null,
  constraint fee_assessments_amount_due_check check (amount_due >= (0)::numeric),
  constraint fee_assessments_student_id_academic_year_id_key
    unique (student_id, academic_year_id)
);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  fee_assessment_id uuid not null references public.fee_assessments(id) on delete cascade,
  amount_paid numeric(12,2) not null,
  payment_date date not null default CURRENT_DATE,
  payment_method text,
  note text,
  constraint fee_payments_amount_paid_check check (amount_paid > (0)::numeric),
  constraint fee_payments_payment_method_check check (payment_method = any (array[
    'cash'::text, 'mobile_money'::text, 'bank_transfer'::text, 'cheque'::text
  ]))
);

create table public.fee_class_defaults (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  default_amount numeric not null,
  constraint fee_class_defaults_amount_check check (default_amount >= (0)::numeric),
  constraint fee_class_defaults_unique unique (class_id, academic_year_id)
);

create table public.school_holidays (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  -- >= et non > : un jour férié isolé a la même date de début et de fin.
  constraint school_holidays_dates_check check (end_date >= start_date)
);

create table public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  event_type text not null,
  related_id uuid,
  phone text not null,
  message text not null,
  status text not null,
  provider_message_id text,
  error_message text,
  constraint sms_logs_event_type_check check (event_type = any (array[
    'absence'::text, 'report_card'::text, 'fee_overdue'::text
  ])),
  constraint sms_logs_status_check check (status = any (array['sent'::text, 'failed'::text]))
);

create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  day_of_week smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  constraint timetable_slots_day_of_week_check check ((day_of_week >= 1) and (day_of_week <= 6)),
  constraint timetable_slots_time_check check (end_time > start_time)
);


-- =====================================================================
-- 2. Index
-- =====================================================================

create index classes_direction_id_idx on public.classes using btree (direction_id);
create index profiles_direction_id_idx on public.profiles using btree (direction_id);
create index sms_logs_student_event_idx on public.sms_logs using btree (student_id, event_type, created_at desc);
create index timetable_slots_academic_year_idx on public.timetable_slots using btree (academic_year_id);
create index timetable_slots_class_day_idx on public.timetable_slots using btree (class_id, day_of_week);
create index timetable_slots_teacher_day_idx on public.timetable_slots using btree (teacher_id, day_of_week);


-- =====================================================================
-- 3. Fonctions et déclencheurs
-- =====================================================================

/*
 * Création automatique du profil à l'inscription.
 *
 * L'EXECUTE a été révoqué à PUBLIC : la fonction n'est pas une API et
 * n'a rien à faire derrière /rest/v1/rpc/. Le déclencheur continue de
 * fonctionner, Postgres ne vérifiant pas EXECUTE au moment où il se
 * déclenche.
 */
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public
as $function$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$function$;

revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger directions_set_updated_at
  before update on public.directions
  for each row execute function public.set_updated_at();

/*
 * Garde-fou contre l'élévation de privilège.
 *
 * La policy « Users can update their own profile » laisse chacun modifier
 * sa propre ligne — nom, prénom, téléphone. Sans ce déclencheur, elle
 * laisserait aussi passer un UPDATE sur role : n'importe quel enseignant
 * pourrait se promouvoir administrateur depuis la console du navigateur.
 *
 * Les routes serveur (service role) restent libres : ce sont elles qui
 * gèrent légitimement les rôles, les rattachements d'école et les
 * désactivations, après avoir vérifié que l'appelant est administrateur.
 */
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql
set search_path = public
as $function$
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::json ->> 'role', ''
     ) = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.school_id is distinct from old.school_id
     or new.is_active is distinct from old.is_active then
    raise exception
      'Le rôle, l''établissement et le statut ne peuvent être modifiés que par un administrateur.';
  end if;

  return new;
end;
$function$;

create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Cloisonnement par direction. SECURITY DEFINER est indispensable :
-- sans lui, une policy sur classes qui interroge classes provoquerait
-- une récursion RLS infinie.
create or replace function private.is_direction_scoped()
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    (select p.role = 'directeur_direction' from profiles p where p.id = auth.uid()),
    false
  );
$function$;

create or replace function private.current_direction_id()
returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select p.direction_id from profiles p where p.id = auth.uid();
$function$;

create or replace function private.class_direction_id(target_class_id uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select c.direction_id from classes c where c.id = target_class_id;
$function$;

create or replace function private.assessment_direction_id(target_assessment_id uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select c.direction_id
  from assessments a join classes c on c.id = a.class_id
  where a.id = target_assessment_id;
$function$;

revoke execute on function
  private.is_direction_scoped(), private.current_direction_id(),
  private.class_direction_id(uuid), private.assessment_direction_id(uuid)
  from public;

grant execute on function
  private.is_direction_scoped(), private.current_direction_id(),
  private.class_direction_id(uuid), private.assessment_direction_id(uuid)
  to authenticated;


-- =====================================================================
-- 4. Row Level Security
--
-- Motif général : school_id in (select school_id from profiles where id = auth.uid())
-- Cinq tables y ajoutent le cloisonnement par direction.
-- =====================================================================

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.directions enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.academic_years enable row level security;
alter table public.academic_periods enable row level security;
alter table public.class_subjects enable row level security;
alter table public.student_class_enrollments enable row level security;
alter table public.assessments enable row level security;
alter table public.grades enable row level security;
alter table public.attendance enable row level security;
alter table public.fee_assessments enable row level security;
alter table public.fee_payments enable row level security;
alter table public.fee_class_defaults enable row level security;
alter table public.school_holidays enable row level security;
alter table public.sms_logs enable row level security;
alter table public.timetable_slots enable row level security;

-- ---------- schools ----------
/*
 * La lecture était autrefois ouverte à tout compte authentifié
 * (using true), si bien qu'un utilisateur voyait le nom, l'adresse, le
 * téléphone et l'email de TOUTES les écoles du service. Mesuré avant
 * correction : un administrateur voyait 6 écoles au lieu d'une.
 *
 * Il n'y a volontairement PAS de policy INSERT : la création d'un
 * établissement passe par /api/setup-school en service role, qui
 * contourne le RLS et applique ses propres garde-fous. Une policy
 * ouverte ici laisserait n'importe quel compte créer des écoles.
 */
create policy "Users can read their own school"
  on public.schools for select to authenticated
  using (id in (select school_id from public.profiles where id = auth.uid()));
create policy "Admins can update their school"
  on public.schools for update
  using (id in (select school_id from public.profiles where id = auth.uid() and role = 'admin'))
  with check (id in (select school_id from public.profiles where id = auth.uid() and role = 'admin'));

-- ---------- profiles ----------
-- Volontairement limité au propre profil : une policy sur profiles qui
-- interroge profiles provoquerait une récursion. La lecture inter-comptes
-- passe par les routes serveur en service role (app/api/users).
create policy "Users can read their own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- directions ----------
create policy "Users can view directions from their school"
  on public.directions for select to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid()));
create policy "Admins can create directions for their school"
  on public.directions for insert to authenticated
  with check (school_id in (select school_id from public.profiles
    where id = auth.uid() and role = any (array['admin','promoteur','directeur_general'])));
create policy "Admins can update directions from their school"
  on public.directions for update to authenticated
  using (school_id in (select school_id from public.profiles
    where id = auth.uid() and role = any (array['admin','promoteur','directeur_general'])))
  with check (school_id in (select school_id from public.profiles
    where id = auth.uid() and role = any (array['admin','promoteur','directeur_general'])));
create policy "Admins can delete directions from their school"
  on public.directions for delete to authenticated
  using (school_id in (select school_id from public.profiles
    where id = auth.uid() and role = any (array['admin','promoteur','directeur_general'])));

-- ---------- Tables au périmètre école simple ----------
-- students, teachers, subjects, academic_years, academic_periods
do $$
declare t text;
begin
  foreach t in array array['students','teachers','subjects','academic_years','academic_periods']
  loop
    execute format($f$
      create policy "Users can view %1$s from their school" on public.%1$I
        for select to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can create %1$s for their school" on public.%1$I
        for insert to authenticated
        with check (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can update %1$s from their school" on public.%1$I
        for update to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid()))
        with check (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can delete %1$s from their school" on public.%1$I
        for delete to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid()));
    $f$, t);
  end loop;
end $$;

-- attendance, fee_assessments, fee_payments, sms_logs, timetable_slots
-- (rôle public, hérité des premières migrations)
do $$
declare t text;
begin
  foreach t in array array['attendance','fee_assessments','fee_payments','timetable_slots']
  loop
    execute format($f$
      create policy "Users can view %1$s from their school" on public.%1$I
        for select
        using (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can create %1$s for their school" on public.%1$I
        for insert
        with check (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can update %1$s from their school" on public.%1$I
        for update
        using (school_id in (select school_id from public.profiles where id = auth.uid()))
        with check (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Users can delete %1$s from their school" on public.%1$I
        for delete
        using (school_id in (select school_id from public.profiles where id = auth.uid()));
    $f$, t);
  end loop;
end $$;

create policy "Users can view sms logs from their school"
  on public.sms_logs for select
  using (school_id in (select school_id from public.profiles where id = auth.uid()));
create policy "Users can create sms logs for their school"
  on public.sms_logs for insert
  with check (school_id in (select school_id from public.profiles where id = auth.uid()));

-- ---------- Écriture réservée aux administrateurs ----------
do $$
declare t text;
begin
  foreach t in array array['fee_class_defaults','school_holidays']
  loop
    execute format($f$
      create policy "Users can view %1$s from their school" on public.%1$I
        for select to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid()));
      create policy "Admins can create %1$s for their school" on public.%1$I
        for insert to authenticated
        with check (school_id in (select school_id from public.profiles
          where id = auth.uid() and role = 'admin'));
      create policy "Admins can update %1$s from their school" on public.%1$I
        for update to authenticated
        using (school_id in (select school_id from public.profiles
          where id = auth.uid() and role = 'admin'))
        with check (school_id in (select school_id from public.profiles
          where id = auth.uid() and role = 'admin'));
      create policy "Admins can delete %1$s from their school" on public.%1$I
        for delete to authenticated
        using (school_id in (select school_id from public.profiles
          where id = auth.uid() and role = 'admin'));
    $f$, t);
  end loop;
end $$;

-- ---------- Cloisonnement par direction ----------
-- classes : la direction est une colonne de la ligne elle-même.
create policy "Users can view classes from their school"
  on public.classes for select to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped() or direction_id = private.current_direction_id()));
create policy "Users can create classes for their school"
  on public.classes for insert to authenticated
  with check (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped() or direction_id = private.current_direction_id()));
create policy "Users can update classes from their school"
  on public.classes for update to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped() or direction_id = private.current_direction_id()))
  with check (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped() or direction_id = private.current_direction_id()));
create policy "Users can delete classes from their school"
  on public.classes for delete to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped() or direction_id = private.current_direction_id()));

-- Tables filles : la direction se lit via class_id.
-- Une classe non rattachée (direction_id null) donne NULL = uuid, donc faux :
-- elle est invisible pour un directeur de direction, visible pour les autres.
do $$
declare t text;
begin
  foreach t in array array['student_class_enrollments','assessments','class_subjects']
  loop
    execute format($f$
      create policy "Users can view %1$s from their school" on public.%1$I
        for select to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid())
          and (not private.is_direction_scoped()
               or private.class_direction_id(class_id) = private.current_direction_id()));
      create policy "Users can create %1$s for their school" on public.%1$I
        for insert to authenticated
        with check (school_id in (select school_id from public.profiles where id = auth.uid())
          and (not private.is_direction_scoped()
               or private.class_direction_id(class_id) = private.current_direction_id()));
      create policy "Users can update %1$s from their school" on public.%1$I
        for update to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid())
          and (not private.is_direction_scoped()
               or private.class_direction_id(class_id) = private.current_direction_id()))
        with check (school_id in (select school_id from public.profiles where id = auth.uid())
          and (not private.is_direction_scoped()
               or private.class_direction_id(class_id) = private.current_direction_id()));
      create policy "Users can delete %1$s from their school" on public.%1$I
        for delete to authenticated
        using (school_id in (select school_id from public.profiles where id = auth.uid())
          and (not private.is_direction_scoped()
               or private.class_direction_id(class_id) = private.current_direction_id()));
    $f$, t);
  end loop;
end $$;

-- grades : la direction se lit via assessment_id.
create policy "Users can view grades from their school"
  on public.grades for select to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id()));
create policy "Users can create grades for their school"
  on public.grades for insert to authenticated
  with check (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id()));
create policy "Users can update grades from their school"
  on public.grades for update to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id()))
  with check (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id()));
create policy "Users can delete grades from their school"
  on public.grades for delete to authenticated
  using (school_id in (select school_id from public.profiles where id = auth.uid())
    and (not private.is_direction_scoped()
         or private.assessment_direction_id(assessment_id) = private.current_direction_id()));


-- =====================================================================
-- 5. Stockage de fichiers
-- =====================================================================

/*
 * Photos d'identité des élèves, utilisées par les cartes scolaires.
 *
 * Le bucket est public en LECTURE : une carte imprimée doit pouvoir
 * afficher la photo sans jeton, et l'URL contient deux UUID, donc elle
 * n'est pas devinable. En ÉCRITURE le cloisonnement est strict.
 *
 * Le chemin est {school_id}/{student_id}.{ext}. Ce n'est pas une
 * convention de rangement mais le mécanisme de sécurité lui-même : les
 * policies comparent storage.foldername(name)[1] au school_id de
 * l'appelant. Écrire ailleurs qu'à la racine de son école est refusé,
 * ce qui interdit d'écraser la photo d'un élève d'un autre
 * établissement.
 */
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true)
on conflict (id) do nothing;

/*
 * Il n'y a volontairement AUCUNE policy SELECT sur storage.objects pour
 * ce bucket.
 *
 * Un bucket public sert ses fichiers via /object/public/, qui contourne
 * le RLS : l'affichage des photos n'a donc besoin d'aucune policy. Une
 * policy SELECT n'ouvrirait que le LISTAGE — et celle qui existait
 * auparavant permettait à un visiteur NON connecté d'énumérer les photos
 * de tous les élèves de toutes les écoles. Vérifié après retrait :
 * 0 fichier listable, et la photo répond toujours en 200.
 */
create policy "Upload photos eleves - meme ecole"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (
      select school_id::text from public.profiles where id = auth.uid()
    )
  );

create policy "Modifier photos eleves - meme ecole"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (
      select school_id::text from public.profiles where id = auth.uid()
    )
  );

create policy "Supprimer photos eleves - meme ecole"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (
      select school_id::text from public.profiles where id = auth.uid()
    )
  );
