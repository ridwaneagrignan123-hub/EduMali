-- =====================================================================
-- Ridwane — état de référence de la base
-- =====================================================================
-- OBTENU PAR INTROSPECTION de pg_catalog le 2026-07-29.
-- Ni écrit de mémoire, ni recopié des scripts du dossier : c'est ce qui
-- fait sa valeur, et ce qui a manqué les fois où il a divergé.
--
-- ⚠️  NE JAMAIS EXÉCUTER CE FICHIER SUR LA PRODUCTION.
-- Il sert à recréer une base VIERGE — environnement local, base de test,
-- reprise après sinistre. Sur une base existante il échouera, les objets
-- existant déjà, et masquerait un écart réel.
--
-- ⚠️  TOUT CHANGEMENT DE SCHÉMA DOIT RÉGÉNÉRER CE FICHIER DANS LE MÊME
--     COMMIT. Voir supabase/README.md.
-- =====================================================================

-- 1. TABLES

create table academic_periods (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  period_type text default 'trimester'::text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false not null,
  constraint academic_periods_unique_name UNIQUE (academic_year_id, name),
  constraint academic_periods_pkey PRIMARY KEY (id),
  constraint academic_periods_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE,
  constraint academic_periods_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint academic_periods_dates_check CHECK ((end_date > start_date)),
  constraint academic_periods_type_check CHECK ((period_type = ANY (ARRAY['trimester'::text, 'semester'::text, 'term'::text])))
);

create table academic_years (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false not null,
  constraint academic_years_unique_name UNIQUE (school_id, name),
  constraint academic_years_pkey PRIMARY KEY (id),
  constraint academic_years_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint academic_years_dates_check CHECK ((end_date > start_date))
);

create table activity_log (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  entity text not null,
  summary text not null,
  created_at timestamp with time zone default now() not null,
  constraint activity_log_pkey PRIMARY KEY (id),
  constraint activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint activity_log_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table assessments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  academic_period_id uuid not null,
  title text not null,
  assessment_type text default 'test'::text not null,
  max_score numeric default 20 not null,
  coefficient numeric default 1 not null,
  assessment_date date not null,
  constraint assessments_pkey PRIMARY KEY (id),
  constraint assessments_academic_period_id_fkey FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  constraint assessments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint assessments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint assessments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE,
  constraint assessments_coefficient_check CHECK ((coefficient > (0)::numeric)),
  constraint assessments_max_score_check CHECK ((max_score > (0)::numeric)),
  constraint assessments_type_check CHECK ((assessment_type = ANY (ARRAY['test'::text, 'homework'::text, 'exam'::text, 'composition'::text, 'other'::text])))
);

create table attendance (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  attendance_date date not null,
  status text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint attendance_student_id_attendance_date_key UNIQUE (student_id, attendance_date),
  constraint attendance_pkey PRIMARY KEY (id),
  constraint attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint attendance_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  constraint attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])))
);

create table class_subjects (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid,
  coefficient numeric default 1 not null,
  constraint class_subjects_unique_assignment UNIQUE (class_id, subject_id),
  constraint class_subjects_pkey PRIMARY KEY (id),
  constraint class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint class_subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint class_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE,
  constraint class_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL
);

create table classes (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  level text,
  academic_year text,
  direction_id uuid,
  constraint classes_pkey PRIMARY KEY (id),
  constraint classes_direction_id_fkey FOREIGN KEY (direction_id) REFERENCES public.directions(id) ON DELETE SET NULL,
  constraint classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table daily_reminders (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  reminder_date date default CURRENT_DATE not null,
  message text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint daily_reminders_pkey PRIMARY KEY (id),
  constraint daily_reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint daily_reminders_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table directions (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  constraint directions_unique_name UNIQUE (school_id, name),
  constraint directions_pkey PRIMARY KEY (id),
  constraint directions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table fee_assessments (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  amount_due numeric(12,2) not null,
  created_at timestamp with time zone default now() not null,
  constraint fee_assessments_student_id_academic_year_id_key UNIQUE (student_id, academic_year_id),
  constraint fee_assessments_pkey PRIMARY KEY (id),
  constraint fee_assessments_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE,
  constraint fee_assessments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint fee_assessments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  constraint fee_assessments_amount_due_check CHECK ((amount_due >= (0)::numeric))
);

create table fee_class_defaults (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  default_amount numeric not null,
  constraint fee_class_defaults_unique UNIQUE (class_id, academic_year_id),
  constraint fee_class_defaults_pkey PRIMARY KEY (id),
  constraint fee_class_defaults_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE,
  constraint fee_class_defaults_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint fee_class_defaults_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint fee_class_defaults_amount_check CHECK ((default_amount >= (0)::numeric))
);

create table fee_payments (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  fee_assessment_id uuid not null,
  amount_paid numeric(12,2) not null,
  payment_date date default CURRENT_DATE not null,
  payment_method text,
  note text,
  created_at timestamp with time zone default now() not null,
  constraint fee_payments_pkey PRIMARY KEY (id),
  constraint fee_payments_fee_assessment_id_fkey FOREIGN KEY (fee_assessment_id) REFERENCES public.fee_assessments(id) ON DELETE CASCADE,
  constraint fee_payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint fee_payments_amount_paid_check CHECK ((amount_paid > (0)::numeric)),
  constraint fee_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'mobile_money'::text, 'bank_transfer'::text, 'cheque'::text])))
);

create table grades (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  assessment_id uuid not null,
  student_id uuid not null,
  score numeric not null,
  constraint grades_unique_student_assessment UNIQUE (assessment_id, student_id),
  constraint grades_pkey PRIMARY KEY (id),
  constraint grades_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE,
  constraint grades_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  constraint grades_score_check CHECK ((score >= (0)::numeric))
);

create table lineup_themes (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  teacher_id uuid not null,
  scheduled_on date not null,
  theme text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint lineup_themes_teacher_id_scheduled_on_key UNIQUE (teacher_id, scheduled_on),
  constraint lineup_themes_pkey PRIMARY KEY (id),
  constraint lineup_themes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint lineup_themes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint lineup_themes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE
);

create table profiles (
  id uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid,
  first_name text,
  last_name text,
  role text,
  phone text,
  is_active boolean default true not null,
  direction_id uuid,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_direction_id_fkey FOREIGN KEY (direction_id) REFERENCES public.directions(id) ON DELETE SET NULL,
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id),
  constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'teacher'::text, 'promoteur'::text, 'directeur_general'::text, 'directeur_direction'::text, 'comptable'::text, 'surveillant'::text])))
);

create table school_holidays (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  constraint school_holidays_pkey PRIMARY KEY (id),
  constraint school_holidays_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint school_holidays_dates_check CHECK ((end_date >= start_date))
);

create table schools (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  name text,
  address text,
  phone text,
  email text,
  logo_url text,
  grading_scale numeric(5,2) default 20 not null,
  appreciation_excellent numeric(5,2) default 18 not null,
  appreciation_very_good numeric(5,2) default 16 not null,
  appreciation_good numeric(5,2) default 14 not null,
  appreciation_fair numeric(5,2) default 10 not null,
  constraint schools_pkey PRIMARY KEY (id),
  constraint schools_appreciation_order_check CHECK (((appreciation_excellent > appreciation_very_good) AND (appreciation_very_good > appreciation_good) AND (appreciation_good > appreciation_fair) AND (appreciation_fair >= (0)::numeric) AND (appreciation_excellent <= grading_scale))),
  constraint schools_grading_scale_check CHECK (((grading_scale > (0)::numeric) AND (grading_scale <= (100)::numeric)))
);

create table sms_logs (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  student_id uuid not null,
  event_type text not null,
  related_id uuid,
  phone text not null,
  message text not null,
  status text not null,
  provider_message_id text,
  error_message text,
  created_at timestamp with time zone default now() not null,
  constraint sms_logs_pkey PRIMARY KEY (id),
  constraint sms_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint sms_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  constraint sms_logs_event_type_check CHECK ((event_type = ANY (ARRAY['absence'::text, 'report_card'::text, 'fee_overdue'::text]))),
  constraint sms_logs_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);

create table student_class_enrollments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  constraint student_class_enrollments_unique UNIQUE (student_id, academic_year_id),
  constraint student_class_enrollments_pkey PRIMARY KEY (id),
  constraint student_class_enrollments_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE,
  constraint student_class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint student_class_enrollments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint student_class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
);

create table students (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  student_number text,
  address text,
  parent_name text,
  parent_phone text,
  matricule text,
  photo_url text,
  constraint students_pkey PRIMARY KEY (id),
  constraint students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table subjects (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  code text,
  description text,
  coefficient numeric default 1 not null,
  constraint subjects_pkey PRIMARY KEY (id),
  constraint subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table teacher_attendance (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  teacher_id uuid not null,
  occurred_on date default CURRENT_DATE not null,
  status text not null,
  minutes_late integer,
  note text,
  recorded_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint teacher_attendance_teacher_id_occurred_on_status_key UNIQUE (teacher_id, occurred_on, status),
  constraint teacher_attendance_pkey PRIMARY KEY (id),
  constraint teacher_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint teacher_attendance_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint teacher_attendance_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE,
  constraint teacher_attendance_minutes_late_check CHECK (((minutes_late IS NULL) OR (minutes_late >= 0))),
  constraint teacher_attendance_status_check CHECK ((status = ANY (ARRAY['retard'::text, 'absence'::text, 'absence_excusee'::text])))
);

create table teachers (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  specialty text,
  hire_date date,
  status text default 'active'::text not null,
  profile_id uuid,
  constraint teachers_profile_id_unique UNIQUE (profile_id),
  constraint teachers_pkey PRIMARY KEY (id),
  constraint teachers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  constraint teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE
);

create table timetable_slots (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid,
  academic_year_id uuid not null,
  day_of_week smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  created_at timestamp with time zone default now() not null,
  constraint timetable_slots_pkey PRIMARY KEY (id),
  constraint timetable_slots_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE CASCADE,
  constraint timetable_slots_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint timetable_slots_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint timetable_slots_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE,
  constraint timetable_slots_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL,
  constraint timetable_slots_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 6))),
  constraint timetable_slots_time_check CHECK ((end_time > start_time))
);


-- 2. INDEX

CREATE INDEX activity_log_school_date_idx ON public.activity_log USING btree (school_id, created_at DESC);
CREATE INDEX classes_direction_id_idx ON public.classes USING btree (direction_id);
CREATE INDEX daily_reminders_school_date_idx ON public.daily_reminders USING btree (school_id, reminder_date DESC);
CREATE INDEX lineup_themes_school_date_idx ON public.lineup_themes USING btree (school_id, scheduled_on);
CREATE INDEX profiles_direction_id_idx ON public.profiles USING btree (direction_id);
CREATE INDEX sms_logs_student_event_idx ON public.sms_logs USING btree (student_id, event_type, created_at DESC);
CREATE INDEX teacher_attendance_school_date_idx ON public.teacher_attendance USING btree (school_id, occurred_on DESC);
CREATE INDEX timetable_slots_academic_year_idx ON public.timetable_slots USING btree (academic_year_id);
CREATE INDEX timetable_slots_class_day_idx ON public.timetable_slots USING btree (class_id, day_of_week);
CREATE INDEX timetable_slots_teacher_day_idx ON public.timetable_slots USING btree (teacher_id, day_of_week);


-- 3. ROW LEVEL SECURITY

alter table academic_periods enable row level security;
alter table academic_years enable row level security;
alter table activity_log enable row level security;
alter table assessments enable row level security;
alter table attendance enable row level security;
alter table class_subjects enable row level security;
alter table classes enable row level security;
alter table daily_reminders enable row level security;
alter table directions enable row level security;
alter table fee_assessments enable row level security;
alter table fee_class_defaults enable row level security;
alter table fee_payments enable row level security;
alter table grades enable row level security;
alter table lineup_themes enable row level security;
alter table profiles enable row level security;
alter table school_holidays enable row level security;
alter table schools enable row level security;
alter table sms_logs enable row level security;
alter table student_class_enrollments enable row level security;
alter table students enable row level security;
alter table subjects enable row level security;
alter table teacher_attendance enable row level security;
alter table teachers enable row level security;
alter table timetable_slots enable row level security;


-- 4. POLICIES

create policy "Direction generale supprime les periodes" on academic_periods for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale cree les periodes" on academic_periods for insert to {authenticated}
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Users can view academic periods from their school" on academic_periods for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Direction generale modifie les periodes" on academic_periods for update to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale supprime les annees scolaires" on academic_years for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale cree les annees scolaires" on academic_years for insert to {authenticated}
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Users can view academic years from their school" on academic_years for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Direction generale modifie les annees scolaires" on academic_years for update to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Journal d'activite lu par la direction" on activity_log for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_promoteur() OR private.is_admin() OR (private.is_direction_generale() AND (entity <> ALL (ARRAY['paiement'::text, 'frais'::text, 'montant_reference'::text]))))));

create policy "Evaluations supprimees par l'enseignant ou l'encadrement" on assessments for delete to {authenticated}
  using (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Evaluations creees par l'enseignant ou l'encadrement" on assessments for insert to {authenticated}
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Evaluations visibles selon le role" on assessments for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR (private.is_direction_scoped() AND (private.class_direction_id(class_id) = private.current_direction_id())) OR private.teaches_class(class_id))));

create policy "Evaluations modifiees par l'enseignant ou l'encadrement" on assessments for update to {authenticated}
  using (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))))
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Presences supprimees par l'encadrement" on attendance for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Presences saisies par l'enseignant ou l'encadrement" on attendance for insert to {authenticated}
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Presences visibles selon le role" on attendance for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR (private.is_direction_scoped() AND (private.class_direction_id(class_id) = private.current_direction_id())) OR private.teaches_class(class_id))));

create policy "Presences corrigees par l'enseignant ou l'encadrement" on attendance for update to {authenticated}
  using (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Encadrement retire les affectations" on class_subjects for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Encadrement affecte les matieres aux classes" on class_subjects for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Users can view class subjects from their school" on class_subjects for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Encadrement modifie les affectations" on class_subjects for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale supprime les classes" on classes for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Encadrement cree les classes" on classes for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (direction_id = private.current_direction_id()))));

create policy "Classes visibles selon le role" on classes for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR private.can_see_money() OR private.is_surveillant() OR (private.is_direction_scoped() AND (direction_id = private.current_direction_id())) OR private.teaches_class(id))));

create policy "Encadrement modifie les classes" on classes for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (direction_id = private.current_direction_id()))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (direction_id = private.current_direction_id()))));

create policy "Rappels effaces par la vie scolaire" on daily_reminders for delete to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Rappels ecrits par la vie scolaire" on daily_reminders for insert to {authenticated}
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Rappels lus dans son ecole" on daily_reminders for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Rappels modifies par la vie scolaire" on daily_reminders for update to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Admins can delete directions from their school" on directions for delete to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'promoteur'::text, 'directeur_general'::text]))))));

create policy "Admins can create directions for their school" on directions for insert to {authenticated}
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'promoteur'::text, 'directeur_general'::text]))))));

create policy "Users can view directions from their school" on directions for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Admins can update directions from their school" on directions for update to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'promoteur'::text, 'directeur_general'::text]))))))
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'promoteur'::text, 'directeur_general'::text]))))));

create policy "Frais supprimes par l'admin" on fee_assessments for delete to {authenticated}
  using ((private.is_admin() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Frais crees par la comptabilite" on fee_assessments for insert to {authenticated}
  with check ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Frais lus par la comptabilite et le promoteur" on fee_assessments for select to {authenticated}
  using ((private.can_see_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Frais modifies par la comptabilite" on fee_assessments for update to {authenticated}
  using ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Admins can delete fee class defaults from their school" on fee_class_defaults for delete to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can create fee class defaults for their school" on fee_class_defaults for insert to {authenticated}
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Montants de reference lus par la comptabilite et le promoteur" on fee_class_defaults for select to {authenticated}
  using ((private.can_see_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Admins can update fee class defaults from their school" on fee_class_defaults for update to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Paiements supprimes par l'admin" on fee_payments for delete to {authenticated}
  using ((private.is_admin() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Paiements enregistres par la comptabilite" on fee_payments for insert to {authenticated}
  with check ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Paiements lus par la comptabilite et le promoteur" on fee_payments for select to {authenticated}
  using ((private.can_see_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Paiements corriges par la comptabilite" on fee_payments for update to {authenticated}
  using ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.can_write_money() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Notes supprimees par l'enseignant de la classe" on grades for delete to {authenticated}
  using (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Notes saisies par l'enseignant de la classe" on grades for insert to {authenticated}
  with check (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Notes visibles selon le role" on grades for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR (private.is_direction_scoped() AND (private.assessment_direction_id(assessment_id) = private.current_direction_id())) OR private.teaches_assessment(assessment_id))));

create policy "Notes corrigees par l'enseignant de la classe" on grades for update to {authenticated}
  using (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Themes au rang effaces par la vie scolaire" on lineup_themes for delete to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Themes au rang ecrits par la vie scolaire" on lineup_themes for insert to {authenticated}
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Themes au rang lus dans son ecole" on lineup_themes for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Themes au rang modifies par la vie scolaire" on lineup_themes for update to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Users can read their own profile" on profiles for select to {authenticated}
  using ((auth.uid() = id));

create policy "Users can update their own profile" on profiles for update to {authenticated}
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

create policy "Admins can delete school holidays from their school" on school_holidays for delete to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can create school holidays for their school" on school_holidays for insert to {authenticated}
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Users can view school holidays from their school" on school_holidays for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Admins can update school holidays from their school" on school_holidays for update to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Users can read their own school" on schools for select to {authenticated}
  using ((id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Admins can update their school" on schools for update to {authenticated}
  using ((id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Journal SMS alimente par l'encadrement" on sms_logs for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Journal SMS lu par l'encadrement" on sms_logs for select to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Encadrement retire les inscriptions" on student_class_enrollments for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Encadrement inscrit en classe" on student_class_enrollments for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));

create policy "Inscriptions visibles selon le role" on student_class_enrollments for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR private.can_see_money() OR (private.is_direction_scoped() AND (private.class_direction_id(class_id) = private.current_direction_id())) OR private.teaches_class(class_id))));

create policy "Encadrement modifie les inscriptions" on student_class_enrollments for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale supprime les eleves" on students for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Encadrement inscrit les eleves" on students for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Eleves visibles selon le role" on students for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_direction_generale() OR private.can_see_money() OR (private.is_direction_scoped() AND private.student_in_my_direction(id)) OR private.teaches_student(id))));

create policy "Encadrement modifie les eleves" on students for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR private.student_in_my_direction(id))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale supprime les matieres" on subjects for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale cree les matieres" on subjects for insert to {authenticated}
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Users can view subjects from their school" on subjects for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Direction generale modifie les matieres" on subjects for update to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Retards enseignants effaces par la vie scolaire" on teacher_attendance for delete to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Retards enseignants saisis par la vie scolaire" on teacher_attendance for insert to {authenticated}
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Retards enseignants visibles" on teacher_attendance for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (private.is_surveillant() OR private.is_encadrement() OR (teacher_id IN ( SELECT t.id
   FROM public.teachers t
  WHERE (t.profile_id = auth.uid()))))));

create policy "Retards enseignants corriges par la vie scolaire" on teacher_attendance for update to {authenticated}
  using (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_surveillant() OR private.is_encadrement()) AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Direction generale supprime les enseignants" on teachers for delete to {authenticated}
  using ((private.is_direction_generale() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Encadrement cree les enseignants" on teachers for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Users can view teachers from their school" on teachers for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Encadrement modifie les enseignants" on teachers for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Emploi du temps allege par l'encadrement" on timetable_slots for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Emploi du temps compose par l'encadrement" on timetable_slots for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));

create policy "Emploi du temps lu dans son ecole" on timetable_slots for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));

create policy "Emploi du temps modifie par l'encadrement" on timetable_slots for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


-- 5. FONCTIONS

CREATE OR REPLACE FUNCTION private.assessment_direction_id(target_assessment_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.direction_id
  from assessments a join classes c on c.id = a.class_id
  where a.id = target_assessment_id;
$function$
;

CREATE OR REPLACE FUNCTION private.can_see_money()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role in ('admin','promoteur','comptable') from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.can_write_money()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role in ('admin','comptable') from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.class_direction_id(target_class_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.direction_id from classes c where c.id = target_class_id;
$function$
;

CREATE OR REPLACE FUNCTION private.current_direction_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.direction_id from profiles p where p.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role = 'admin' from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.is_direction_generale()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role in ('admin','promoteur','directeur_general') from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.is_direction_scoped()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select p.role = 'directeur_direction' from profiles p where p.id = auth.uid()),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_encadrement()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role in ('admin','promoteur','directeur_general','directeur_direction') from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.is_promoteur()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role = 'promoteur' from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.is_surveillant()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role = 'surveillant' from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select p.role = 'teacher' from profiles p where p.id = auth.uid()), false); $function$
;

CREATE OR REPLACE FUNCTION private.record_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ligne record; qui record; libelle text; quoi text; quand_action text;
begin
  if tg_op = 'DELETE' then ligne := old; else ligne := new; end if;

  select p.first_name, p.last_name, p.role, p.school_id into qui
  from profiles p where p.id = auth.uid();

  -- Ecrit hors session applicative (migration, service role) : on ne
  -- saurait pas au nom de qui journaliser.
  if qui.school_id is null then return ligne; end if;

  quand_action := case tg_op
    when 'INSERT' then 'creation'
    when 'UPDATE' then 'modification'
    else 'suppression' end;

  case tg_table_name
    when 'grades' then
      quoi := 'note';
      select 'Note de ' || s.last_name || ' ' || s.first_name || ' : ' || coalesce(ligne.score::text, '—')
        into libelle from students s where s.id = ligne.student_id;
    when 'fee_payments' then
      quoi := 'paiement';
      libelle := 'Paiement de ' || coalesce(ligne.amount_paid::text, '0') || ' F';
    when 'fee_assessments' then
      quoi := 'frais';
      libelle := 'Frais de ' || coalesce(ligne.amount_due::text, '0') || ' F';
    when 'fee_class_defaults' then
      quoi := 'montant_reference';
      libelle := 'Montant de reference : ' || coalesce(ligne.default_amount::text, '0') || ' F';
    when 'students' then
      quoi := 'eleve';
      libelle := 'Eleve ' || coalesce(ligne.last_name, '') || ' ' || coalesce(ligne.first_name, '');
    when 'student_class_enrollments' then
      quoi := 'inscription';
      select 'Inscription en ' || c.name into libelle from classes c where c.id = ligne.class_id;
    when 'assessments' then
      quoi := 'evaluation';
      libelle := 'Evaluation ' || coalesce(ligne.title, '');
    when 'classes' then
      quoi := 'classe';
      libelle := 'Classe ' || coalesce(ligne.name, '');
    when 'subjects' then
      quoi := 'matiere';
      libelle := 'Matiere ' || coalesce(ligne.name, '');
    when 'class_subjects' then
      quoi := 'affectation';
      select 'Affectation en ' || c.name into libelle from classes c where c.id = ligne.class_id;
    when 'teachers' then
      quoi := 'enseignant';
      libelle := 'Enseignant ' || coalesce(ligne.last_name, '') || ' ' || coalesce(ligne.first_name, '');
    when 'profiles' then
      quoi := 'compte';
      libelle := 'Compte ' || coalesce(ligne.last_name, '') || ' ' || coalesce(ligne.first_name, '')
                 || ' (' || coalesce(ligne.role, 'sans role') || ')';
    when 'attendance' then
      quoi := 'presence';
      libelle := 'Presence : ' || coalesce(ligne.status, '');
    when 'teacher_attendance' then
      quoi := 'retard';
      libelle := 'Enseignant note ' || coalesce(ligne.status, '');
    when 'lineup_themes' then
      quoi := 'theme';
      libelle := 'Theme au rang : ' || coalesce(ligne.theme, '');
    when 'daily_reminders' then
      quoi := 'rappel';
      libelle := 'Rappel : ' || left(coalesce(ligne.message, ''), 60);
    when 'timetable_slots' then
      quoi := 'emploi_du_temps';
      libelle := 'Creneau d''emploi du temps';
    when 'academic_years' then
      quoi := 'annee';
      libelle := 'Annee scolaire ' || coalesce(ligne.name, '');
    when 'academic_periods' then
      quoi := 'periode';
      libelle := 'Periode ' || coalesce(ligne.name, '');
    when 'directions' then
      quoi := 'direction';
      libelle := 'Direction ' || coalesce(ligne.name, '');
    else
      quoi := tg_table_name;
      libelle := tg_table_name;
  end case;

  insert into activity_log (school_id, actor_id, actor_name, actor_role, action, entity, summary)
  values (
    ligne.school_id, auth.uid(),
    nullif(trim(coalesce(qui.first_name, '') || ' ' || coalesce(qui.last_name, '')), ''),
    qui.role, quand_action, quoi, coalesce(libelle, quoi)
  );

  return ligne;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.student_in_my_direction(target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from student_class_enrollments e join classes c on c.id = e.class_id
                     where e.student_id = target_student_id
                       and c.direction_id = (select p.direction_id from profiles p where p.id = auth.uid())); $function$
;

CREATE OR REPLACE FUNCTION private.teaches_assessment(target_assessment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from assessments a
    join class_subjects cs on cs.class_id = a.class_id
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where a.id = target_assessment_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$function$
;

CREATE OR REPLACE FUNCTION private.teaches_class(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from class_subjects cs
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where cs.class_id = target_class_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$function$
;

CREATE OR REPLACE FUNCTION private.teaches_student(target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from student_class_enrollments e
    join class_subjects cs on cs.class_id = e.class_id
    join teachers t on t.id = cs.teacher_id
    join profiles p on p.id = t.profile_id
    where e.student_id = target_student_id
      and t.profile_id = auth.uid()
      and p.role = 'teacher');
$function$
;

CREATE OR REPLACE FUNCTION public.dump_schema_temporaire()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'private, public'
AS $function$ select contenu from private.schema_dump; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.stats_assessments()
 RETURNS TABLE(id uuid, titre text, classe text, matiere text, date_eval date, periode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.title, c.name, s.name, a.assessment_date, ap.name
  from assessments a
  join classes c on c.id = a.class_id
  left join subjects s on s.id = a.subject_id
  left join academic_periods ap on ap.id = a.academic_period_id
  where a.school_id = (select p.school_id from profiles p where p.id = auth.uid())
  order by a.assessment_date desc nulls last, c.name;
$function$
;

CREATE OR REPLACE FUNCTION public.stats_classes(p_period_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(classe_id uuid, classe text, direction text, eleves bigint, moyenne numeric, taux_reussite numeric, note_min numeric, note_max numeric, masque boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with notes as (
    select c.id as cid, c.name as cnom, d.name as dnom, g.student_id,
           -- ramene sur 20 : sans cela on comparerait un devoir sur 10
           -- a une composition sur 20.
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
$function$
;

CREATE OR REPLACE FUNCTION public.stats_compare_assessments(p_a uuid, p_b uuid)
 RETURNS TABLE(classe text, eleves_communs bigint, moyenne_a numeric, moyenne_b numeric, ecart numeric, progressions bigint, regressions bigint, stables bigint, masque boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.stats_compare_periods(p_a uuid, p_b uuid, p_class_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matiere text, eleves_a bigint, admis_a bigint, non_admis_a bigint, taux_a numeric, moyenne_a numeric, eleves_b bigint, admis_b bigint, non_admis_b bigint, taux_b numeric, moyenne_b numeric, ecart_taux numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select a.academic_period_id as periode,
           coalesce(s.name, 'Sans matiere') as matiere,
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
    select matiere, periode,
      count(*) as eleves,
      count(*) filter (where moy >= 10) as admis,
      count(*) filter (where moy < 10) as non_admis,
      case when count(*) >= 3 then round(100.0 * count(*) filter (where moy >= 10) / count(*), 1) end as taux,
      case when count(*) >= 3 then round(avg(moy)::numeric, 2) end as moyenne
    from base group by matiere, periode
  )
  select
    coalesce(a.matiere, b.matiere),
    coalesce(a.eleves, 0), coalesce(a.admis, 0), coalesce(a.non_admis, 0), a.taux, a.moyenne,
    coalesce(b.eleves, 0), coalesce(b.admis, 0), coalesce(b.non_admis, 0), b.taux, b.moyenne,
    case when a.taux is not null and b.taux is not null
         then round(b.taux - a.taux, 1) end
  from (select * from agrege where periode = p_a) a
  full outer join (select * from agrege where periode = p_b) b
    on b.matiere = a.matiere
  order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.stats_subjects(p_period_id uuid DEFAULT NULL::uuid, p_class_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matiere text, eleves bigint, moyenne numeric, admis bigint, non_admis bigint, taux_admis numeric, masque boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select matiere,
    count(*),
    case when count(*) >= 3 then round(avg(moy)::numeric, 2) end,
    count(*) filter (where moy >= 10),
    count(*) filter (where moy < 10),
    case when count(*) >= 3 then round(100.0 * count(*) filter (where moy >= 10) / count(*), 1) end,
    count(*) < 3
  from base
  group by matiere
  order by matiere;
$function$
;

CREATE OR REPLACE FUNCTION public.stats_summary(p_period_id uuid DEFAULT NULL::uuid, p_class_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(eleves bigint, moyenne_generale numeric, admis bigint, non_admis bigint, taux_admis numeric, meilleure numeric, plus_basse numeric, masque boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  par_eleve as (
    select student_id, avg(moy) as moy_gen from par_matiere group by student_id
  )
  select count(*),
    case when count(*) >= 3 then round(avg(moy_gen)::numeric, 2) end,
    count(*) filter (where moy_gen >= 10),
    count(*) filter (where moy_gen < 10),
    case when count(*) >= 3 then round(100.0 * count(*) filter (where moy_gen >= 10) / count(*), 1) end,
    case when count(*) >= 3 then round(max(moy_gen)::numeric, 2) end,
    case when count(*) >= 3 then round(min(moy_gen)::numeric, 2) end,
    count(*) < 3
  from par_eleve;
$function$
;


-- 6. DECLENCHEURS

CREATE TRIGGER log_academic_periods AFTER INSERT OR DELETE OR UPDATE ON public.academic_periods FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_academic_years AFTER INSERT OR DELETE OR UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_assessments AFTER INSERT OR DELETE OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_attendance AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_class_subjects AFTER INSERT OR DELETE OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_classes AFTER INSERT OR DELETE OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_daily_reminders AFTER INSERT OR DELETE OR UPDATE ON public.daily_reminders FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER directions_set_updated_at BEFORE UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_directions AFTER INSERT OR DELETE OR UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_fee_assessments AFTER INSERT OR DELETE OR UPDATE ON public.fee_assessments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_fee_class_defaults AFTER INSERT OR DELETE OR UPDATE ON public.fee_class_defaults FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_fee_payments AFTER INSERT OR DELETE OR UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_grades AFTER INSERT OR DELETE OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER lineup_themes_set_updated_at BEFORE UPDATE ON public.lineup_themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_lineup_themes AFTER INSERT OR DELETE OR UPDATE ON public.lineup_themes FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_profiles AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER profiles_prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
CREATE TRIGGER log_enrollments AFTER INSERT OR DELETE OR UPDATE ON public.student_class_enrollments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_subjects AFTER INSERT OR DELETE OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_teacher_attendance AFTER INSERT OR DELETE OR UPDATE ON public.teacher_attendance FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_teachers AFTER INSERT OR DELETE OR UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_timetable_slots AFTER INSERT OR DELETE OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
