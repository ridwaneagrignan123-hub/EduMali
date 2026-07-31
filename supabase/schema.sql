-- =====================================================================
-- Ridwane — état de référence de la base
-- =====================================================================
-- OBTENU PAR INTROSPECTION de pg_catalog le 2026-07-30.
-- Ni écrit de mémoire, ni recopié des scripts du dossier : c'est ce qui
-- fait sa valeur, et ce qui a manqué les fois où il a divergé.
--
-- ⚠️  NE JAMAIS EXÉCUTER CE FICHIER SUR LA PRODUCTION.
-- Il sert à recréer une base VIERGE — environnement local, base de test,
-- reprise après sinistre. Sur une base existante il échouera, les objets
-- existant déjà, et masquerait un écart réel.
--
-- ⚠️  TOUT CHANGEMENT DE SCHÉMA RÉGÉNÈRE CE FICHIER DANS LE MÊME COMMIT.
--     Voir supabase/README.md. C'est la quatrième fois que cet écart
--     réapparaît.
--
-- La section 5 est nouvelle : les droits par colonne. Le RLS travaille
-- par ligne et ne masque pas une colonne — sans ce bloc, une base
-- recréée depuis ce fichier rouvrirait la lecture des salaires à tout
-- le personnel.
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

-- Titulaire d'une classe de premier cycle. `filiere` ne sert qu'en ecole
-- franco-arabe, ou la classe a DEUX titulaires. Voir
-- supabase/cycles-et-titulaires.sql.
create table class_head_teachers (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  class_id uuid not null,
  teacher_id uuid not null,
  filiere text,
  constraint class_head_teachers_pkey PRIMARY KEY (id),
  constraint class_head_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  constraint class_head_teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint class_head_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE,
  constraint class_head_teachers_filiere_check CHECK (((filiere IS NULL) OR (filiere = ANY (ARRAY['francais'::text, 'arabe'::text]))))
);

create table classes (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  name text not null,
  level text,
  academic_year text,
  direction_id uuid,
  -- Colonne structuree, et NON `level` qui est un texte libre : c'est
  -- elle qui decide du mode d'affectation des enseignants.
  cycle text,
  constraint classes_cycle_check CHECK (((cycle IS NULL) OR (cycle = ANY (ARRAY['premier_cycle'::text, 'second_cycle'::text, 'lycee'::text])))),
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
  receipt_number integer not null,
  recorded_by uuid,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text,
  constraint fee_payments_receipt_unique UNIQUE (school_id, receipt_number),
  constraint fee_payments_pkey PRIMARY KEY (id),
  constraint fee_payments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- RESTRICT et non CASCADE : supprimer un frais effacait sinon tous les
  -- paiements portes, recus et annulations compris. Voir
  -- supabase/suppression-frais-payes.sql.
  constraint fee_payments_fee_assessment_id_fkey FOREIGN KEY (fee_assessment_id) REFERENCES public.fee_assessments(id) ON DELETE RESTRICT,
  constraint fee_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint fee_payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint fee_payments_amount_paid_check CHECK ((amount_paid > (0)::numeric)),
  constraint fee_payments_cancellation_coherente CHECK ((((cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancellation_reason IS NULL)) OR ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND (cancellation_reason IS NOT NULL) AND (length(btrim(cancellation_reason)) >= 3)))),
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

-- Cloture mensuelle de la paie : fige les pointages d'un mois, comme
-- l'etat de caisse fige la journee. Voir supabase/paie-au-pointage.sql.
create table payroll_closings (
  id uuid default gen_random_uuid() not null,
  school_id uuid not null,
  year integer not null,
  month integer not null,
  closed_at timestamp with time zone default now() not null,
  closed_by uuid,
  constraint payroll_closings_unique UNIQUE (school_id, year, month),
  constraint payroll_closings_pkey PRIMARY KEY (id),
  constraint payroll_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint payroll_closings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint payroll_closings_month_check CHECK (((month >= 1) AND (month <= 12))),
  constraint payroll_closings_year_check CHECK (((year >= 2000) AND (year <= 2200)))
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
  -- Filiere d'un directeur de direction, ecole franco-arabe. Elle NOMME
  -- la responsabilite et ne restreint AUCUN perimetre RLS : voir la note
  -- de supabase/franco-arabe.sql.
  filiere text,
  constraint profiles_filiere_check CHECK (((filiere IS NULL) OR (filiere = ANY (ARRAY['francais'::text, 'arabe'::text])))),
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_direction_id_fkey FOREIGN KEY (direction_id) REFERENCES public.directions(id) ON DELETE SET NULL,
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id),
  constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'teacher'::text, 'promoteur'::text, 'directeur_general'::text, 'directeur_direction'::text, 'comptable'::text, 'surveillant'::text])))
);

-- Autorisation nominative d'ouvrir un etablissement. Consommee par
-- /api/setup-school. RLS active et AUCUNE policy : voir section 3.
create table school_creation_grants (
  id uuid default gen_random_uuid() not null,
  email text not null,
  note text,
  granted_by uuid,
  created_at timestamp with time zone default now() not null,
  used_at timestamp with time zone,
  used_by uuid,
  constraint school_creation_grants_pkey PRIMARY KEY (id),
  constraint school_creation_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint school_creation_grants_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.profiles(id) ON DELETE SET NULL
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
  -- Les deux reglages payroll_* ont ete SUPPRIMES avec la paie au
  -- pointage : ils reglaient ce qu'on retire d'un planning paye
  -- d'avance, or plus rien n'est paye d'avance. Voir paie-au-pointage.sql.
  -- Pilote l'affichage : `franco_arabe` debloque l'axe filiere.
  school_type text default 'classique'::text not null,
  constraint schools_school_type_check CHECK ((school_type = ANY (ARRAY['classique'::text, 'franco_arabe'::text]))),
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
  -- Programme dont releve la matiere. Nulle hors ecole franco-arabe.
  filiere text,
  constraint subjects_filiere_check CHECK (((filiere IS NULL) OR (filiere = ANY (ARRAY['francais'::text, 'arabe'::text])))),
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
  contract_type text,
  hourly_rate numeric,
  monthly_salary numeric,
  constraint teachers_profile_id_unique UNIQUE (profile_id),
  constraint teachers_pkey PRIMARY KEY (id),
  constraint teachers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  constraint teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  constraint teachers_contract_type_check CHECK (((contract_type IS NULL) OR (contract_type = ANY (ARRAY['permanent'::text, 'vacataire'::text])))),
  constraint teachers_rates_check CHECK ((((hourly_rate IS NULL) OR (hourly_rate >= (0)::numeric)) AND ((monthly_salary IS NULL) OR (monthly_salary >= (0)::numeric))))
);

-- Pointage d'un creneau reellement assure. C'est ce qui fait entrer une
-- heure dans la paie d'un vacataire. Controle comme un recu de caisse :
-- auteur impose en base, pas de suppression, annulation motivee.
--
-- teacher_id est DENORMALISE depuis le creneau : celui-ci peut changer
-- de titulaire, la dette reste envers qui a assure l'heure.
create table timetable_checkins (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  school_id uuid not null,
  slot_id uuid not null,
  teacher_id uuid not null,
  occurred_on date not null,
  hours numeric not null,
  recorded_by uuid default auth.uid() not null,
  -- Distinct de occurred_on : c'est ce qui rend un pointage retroactif
  -- visible.
  recorded_at timestamp with time zone default now() not null,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text,
  constraint timetable_checkins_unique UNIQUE (slot_id, occurred_on),
  constraint timetable_checkins_pkey PRIMARY KEY (id),
  constraint timetable_checkins_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  constraint timetable_checkins_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id),
  constraint timetable_checkins_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE,
  -- RESTRICT : supprimer un creneau effacerait sinon des heures dues.
  constraint timetable_checkins_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.timetable_slots(id) ON DELETE RESTRICT,
  constraint timetable_checkins_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT,
  constraint timetable_checkins_annulation_coherente CHECK ((((cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancellation_reason IS NULL)) OR ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND (cancellation_reason IS NOT NULL) AND (length(btrim(cancellation_reason)) >= 3)))),
  constraint timetable_checkins_hours_check CHECK ((hours > (0)::numeric))
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
-- Un seul titulaire sans filiere (ecole classique)...
CREATE UNIQUE INDEX class_head_teachers_sans_filiere ON public.class_head_teachers USING btree (class_id) WHERE (filiere IS NULL);
-- ...et un seul par filiere (ecole franco-arabe).
CREATE UNIQUE INDEX class_head_teachers_par_filiere ON public.class_head_teachers USING btree (class_id, filiere) WHERE (filiere IS NOT NULL);
CREATE INDEX classes_direction_id_idx ON public.classes USING btree (direction_id);
CREATE INDEX daily_reminders_school_date_idx ON public.daily_reminders USING btree (school_id, reminder_date DESC);
CREATE INDEX fee_payments_school_date_idx ON public.fee_payments USING btree (school_id, payment_date DESC);
CREATE INDEX lineup_themes_school_date_idx ON public.lineup_themes USING btree (school_id, scheduled_on);
CREATE INDEX profiles_direction_id_idx ON public.profiles USING btree (direction_id);
-- Empeche DEUX directeurs de la MEME filiere sur une direction. Rien
-- n'interdisait deja deux directeurs : cet index n'ouvre rien, il ferme.
CREATE UNIQUE INDEX profiles_directeur_par_filiere ON public.profiles USING btree (direction_id, filiere) WHERE ((role = 'directeur_direction'::text) AND (direction_id IS NOT NULL) AND (filiere IS NOT NULL));
-- Une seule autorisation EN ATTENTE par adresse ; les consommees restent.
CREATE UNIQUE INDEX school_creation_grants_email_en_attente ON public.school_creation_grants USING btree (lower(email)) WHERE (used_at IS NULL);
CREATE INDEX sms_logs_student_event_idx ON public.sms_logs USING btree (student_id, event_type, created_at DESC);
CREATE INDEX teacher_attendance_school_date_idx ON public.teacher_attendance USING btree (school_id, occurred_on DESC);
CREATE INDEX timetable_checkins_school_date_idx ON public.timetable_checkins USING btree (school_id, occurred_on DESC);
CREATE INDEX timetable_checkins_teacher_date_idx ON public.timetable_checkins USING btree (teacher_id, occurred_on DESC);
CREATE INDEX timetable_slots_academic_year_idx ON public.timetable_slots USING btree (academic_year_id);
CREATE INDEX timetable_slots_class_day_idx ON public.timetable_slots USING btree (class_id, day_of_week);
CREATE INDEX timetable_slots_teacher_day_idx ON public.timetable_slots USING btree (teacher_id, day_of_week);


-- 3. ROW LEVEL SECURITY

alter table academic_periods enable row level security;
alter table academic_years enable row level security;
alter table activity_log enable row level security;
alter table assessments enable row level security;
alter table attendance enable row level security;
alter table class_head_teachers enable row level security;
alter table class_subjects enable row level security;
alter table classes enable row level security;
alter table daily_reminders enable row level security;
alter table directions enable row level security;
alter table fee_assessments enable row level security;
alter table fee_class_defaults enable row level security;
alter table fee_payments enable row level security;
alter table grades enable row level security;
alter table lineup_themes enable row level security;
alter table payroll_closings enable row level security;
alter table profiles enable row level security;
-- ⚠️ school_creation_grants n'a AUCUNE policy, deliberement : RLS active
-- et zero policy ferme la table a `authenticated` depuis tout client.
-- Seule la cle service role y accede, ce qui en fait une voie de
-- confiance. Lui ajouter une policy de lecture revelerait qui est attendu.
alter table school_creation_grants enable row level security;
alter table school_holidays enable row level security;
alter table schools enable row level security;
alter table sms_logs enable row level security;
alter table student_class_enrollments enable row level security;
alter table students enable row level security;
alter table subjects enable row level security;
alter table teacher_attendance enable row level security;
alter table teachers enable row level security;
alter table timetable_checkins enable row level security;
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





create policy "Evaluations creees par l'enseignant ou l'encadrement" on assessments for insert to {authenticated}
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));
create policy "Evaluations modifiees par l'enseignant ou l'encadrement" on assessments for update to {authenticated}
  using (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))))
  with check (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
create policy "Evaluations supprimees par l'enseignant ou l'encadrement" on assessments for delete to {authenticated}
  using (((private.is_encadrement() OR private.teaches_class(class_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));
create policy "Evaluations visibles selon le role" on assessments for select to {authenticated}
  using (((school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (private.is_direction_generale() OR (private.is_direction_scoped() AND (private.class_direction_id(class_id) = private.current_direction_id()) AND private.mon_programme(subject_id)) OR private.teaches_class(class_id))));
create policy "Encadrement change les titulaires" on class_head_teachers for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND ((NOT private.is_direction_scoped()) OR (private.ma_filiere() IS NULL) OR (NOT (filiere IS DISTINCT FROM private.ma_filiere())))))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.ma_filiere() IS NULL) OR (NOT (filiere IS DISTINCT FROM private.ma_filiere())))));
create policy "Encadrement nomme les titulaires" on class_head_teachers for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND ((NOT private.is_direction_scoped()) OR (private.ma_filiere() IS NULL) OR (NOT (filiere IS DISTINCT FROM private.ma_filiere())))));
create policy "Encadrement retire les titulaires" on class_head_teachers for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND ((NOT private.is_direction_scoped()) OR (private.ma_filiere() IS NULL) OR (NOT (filiere IS DISTINCT FROM private.ma_filiere())))));
create policy "Titulaires lus dans son ecole" on class_head_teachers for select to {authenticated}
  using (((school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));
create policy "Encadrement affecte les matieres aux classes" on class_subjects for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)));
create policy "Encadrement modifie les affectations" on class_subjects for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND private.mon_programme(subject_id)));
create policy "Encadrement retire les affectations" on class_subjects for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)));
create policy "Users can view class subjects from their school" on class_subjects for select to {authenticated}
  using (((school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id()))));
create policy "Notes corrigees par l'enseignant de la classe" on grades for update to {authenticated}
  using (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))))
  with check (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
create policy "Notes saisies par l'enseignant de la classe" on grades for insert to {authenticated}
  with check (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
create policy "Notes supprimees par l'enseignant de la classe" on grades for delete to {authenticated}
  using (((private.is_admin() OR private.teaches_assessment(assessment_id)) AND (school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
create policy "Notes visibles selon le role" on grades for select to {authenticated}
  using (((school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (private.is_direction_generale() OR (private.is_direction_scoped() AND (private.assessment_direction_id(assessment_id) = private.current_direction_id()) AND private.mon_programme_evaluation(assessment_id)) OR private.teaches_assessment(assessment_id))));
create policy "Cloture lue par les roles financiers" on payroll_closings for select to {authenticated}
  using (((school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (private.can_see_money() OR private.is_encadrement() OR private.is_surveillant())));
create policy "Cloture posee par l'admin" on payroll_closings for insert to {authenticated}
  with check ((private.is_admin() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));
create policy "Pointage annule par la vie scolaire" on timetable_checkins for update to {authenticated}
  using (((private.is_encadrement() OR private.is_surveillant()) AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid())))))
  with check (((private.is_encadrement() OR private.is_surveillant()) AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));
create policy "Pointage pose par la vie scolaire" on timetable_checkins for insert to {authenticated}
  with check (((private.is_encadrement() OR private.is_surveillant()) AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));
create policy "Pointages lus par l'encadrement, la vie scolaire et la paie" on timetable_checkins for select to {authenticated}
  using (((school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (private.is_encadrement() OR private.is_surveillant() OR private.can_see_money() OR (EXISTS ( SELECT 1
   FROM teachers t
  WHERE ((t.id = timetable_checkins.teacher_id) AND (t.profile_id = auth.uid())))))));
create policy "Emploi du temps allege par l'encadrement" on timetable_slots for delete to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)));
create policy "Emploi du temps compose par l'encadrement" on timetable_slots for insert to {authenticated}
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)));
create policy "Emploi du temps lu dans son ecole" on timetable_slots for select to {authenticated}
  using ((school_id IN ( SELECT profiles.school_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
create policy "Emploi du temps modifie par l'encadrement" on timetable_slots for update to {authenticated}
  using ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((NOT private.is_direction_scoped()) OR (private.class_direction_id(class_id) = private.current_direction_id())) AND private.mon_programme(subject_id)))
  with check ((private.is_encadrement() AND (school_id IN ( SELECT p.school_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND private.mon_programme(subject_id)));


-- 5. DROITS PAR COLONNE
--
-- Le RLS travaille par ligne : il ne masque pas une colonne. Les
-- colonnes de remuneration de teachers sont donc fermees ici, en
-- retirant le droit de TABLE puis en le rendant colonne par
-- colonne. Un revoke par colonne seul n'aurait aucun effet.

revoke select, insert, update on teachers from authenticated;
revoke select, insert, update on teachers from anon;

grant insert (contract_type) on teachers to authenticated;
grant insert (created_at) on teachers to authenticated;
grant insert (email) on teachers to authenticated;
grant insert (first_name) on teachers to authenticated;
grant insert (hire_date) on teachers to authenticated;
grant insert (id) on teachers to authenticated;
grant insert (last_name) on teachers to authenticated;
grant insert (phone) on teachers to authenticated;
grant insert (profile_id) on teachers to authenticated;
grant insert (school_id) on teachers to authenticated;
grant insert (specialty) on teachers to authenticated;
grant insert (status) on teachers to authenticated;
grant select (contract_type) on teachers to authenticated;
grant select (created_at) on teachers to authenticated;
grant select (email) on teachers to authenticated;
grant select (first_name) on teachers to authenticated;
grant select (hire_date) on teachers to authenticated;
grant select (id) on teachers to authenticated;
grant select (last_name) on teachers to authenticated;
grant select (phone) on teachers to authenticated;
grant select (profile_id) on teachers to authenticated;
grant select (school_id) on teachers to authenticated;
grant select (specialty) on teachers to authenticated;
grant select (status) on teachers to authenticated;
grant update (contract_type) on teachers to authenticated;
grant update (email) on teachers to authenticated;
grant update (first_name) on teachers to authenticated;
grant update (hire_date) on teachers to authenticated;
grant update (last_name) on teachers to authenticated;
grant update (phone) on teachers to authenticated;
grant update (profile_id) on teachers to authenticated;
grant update (specialty) on teachers to authenticated;
grant update (status) on teachers to authenticated;


-- 6. FONCTIONS

CREATE OR REPLACE FUNCTION private.controler_annulation_pointage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.mois_est_cloture(old.school_id, old.occurred_on) then
    raise exception 'Le mois de % est cloture : ce pointage ne peut plus etre modifie.',
      to_char(old.occurred_on, 'MM/YYYY') using errcode = 'P0001';
  end if;

  -- Ce qui atteste de l'heure due est grave.
  if new.slot_id is distinct from old.slot_id
     or new.occurred_on is distinct from old.occurred_on
     or new.teacher_id is distinct from old.teacher_id
     or new.recorded_by is distinct from old.recorded_by
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'Le creneau, la date et l''auteur d''un pointage ne se modifient pas. Annulez-le et repointez.'
      using errcode = 'P0001';
  end if;

  if old.cancelled_at is not null then
    if new.cancelled_at is null then
      raise exception 'Une annulation ne peut pas etre levee.' using errcode = 'P0001';
    end if;

    if new.hours is distinct from old.hours then
      raise exception 'Un pointage annule ne se modifie plus.' using errcode = 'P0001';
    end if;
  end if;

  if old.cancelled_at is null and new.cancelled_at is not null then
    new.cancelled_at := now();

    if auth.uid() is not null then
      new.cancelled_by := auth.uid();
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.controler_bascule_franco_arabe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if new.school_type = 'franco_arabe' and old.school_type is distinct from 'franco_arabe' then
    select count(*) into n from subjects s
    where s.school_id = new.id and s.filiere is null;

    if n > 0 then
      raise exception
        '% matiere(s) n''ont pas de programme. Attribuez a chacune le programme francais ou arabe avant de basculer l''etablissement.', n
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.controler_pointage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record; v_duree numeric;
begin
  select ts.school_id, ts.teacher_id, ts.day_of_week, ts.start_time, ts.end_time,
         ts.academic_year_id, ay.start_date, ay.end_date
    into v
  from timetable_slots ts
  join academic_years ay on ay.id = ts.academic_year_id
  where ts.id = new.slot_id;

  if not found then
    raise exception 'Ce creneau n''existe pas ou n''a pas d''annee scolaire.'
      using errcode = 'P0001';
  end if;

  if v.school_id is distinct from new.school_id then
    raise exception 'Ce creneau appartient a un autre etablissement.'
      using errcode = 'P0001';
  end if;

  -- On ne pointe pas dans le futur : le pointage atteste d'une heure
  -- FAITE. Le retroactif reste possible, mais recorded_at le montre.
  if new.occurred_on > current_date then
    raise exception 'On ne peut pas pointer un creneau a venir (%).', new.occurred_on
      using errcode = 'P0001';
  end if;

  -- Le jour doit correspondre au jour de la semaine du creneau.
  if extract(isodow from new.occurred_on)::int is distinct from v.day_of_week then
    raise exception 'Ce creneau n''a pas lieu ce jour-la.'
      using errcode = 'P0001';
  end if;

  if new.occurred_on < v.start_date or new.occurred_on > v.end_date then
    raise exception 'Cette date est hors de l''annee scolaire du creneau.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from school_holidays h
             where h.school_id = new.school_id
               and new.occurred_on between h.start_date and h.end_date) then
    raise exception 'Ce jour est ferie ou en vacances : il n''y a pas cours.'
      using errcode = 'P0001';
  end if;

  if private.mois_est_cloture(new.school_id, new.occurred_on) then
    raise exception 'Le mois de % est cloture : aucun pointage ne peut plus y etre ajoute.',
      to_char(new.occurred_on, 'MM/YYYY') using errcode = 'P0001';
  end if;

  if v.teacher_id is null then
    raise exception 'Ce creneau n''a pas d''enseignant : rien a pointer.'
      using errcode = 'P0001';
  end if;

  -- L'enseignant vient du creneau, jamais du client.
  new.teacher_id := v.teacher_id;

  -- Duree du creneau : plafond de ce qui peut etre credite. Un creneau
  -- partiellement assure se pointe pour moins, jamais pour plus.
  v_duree := round(extract(epoch from (v.end_time - v.start_time)) / 3600.0, 2);

  if new.hours is null then
    new.hours := v_duree;
  end if;

  if new.hours > v_duree then
    raise exception 'Ce creneau dure % h : on ne peut pas en pointer %.', v_duree, new.hours
      using errcode = 'P0001';
  end if;

  -- Auteur et horodatage imposes, comme pour un recu de caisse.
  if auth.uid() is not null then
    new.recorded_by := auth.uid();
  end if;

  new.recorded_at := now();

  -- Un pointage ne nait jamais annule.
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancellation_reason := null;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.exiger_filiere_matiere()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.filiere is null
     and (select s.school_type from schools s where s.id = new.school_id) = 'franco_arabe' then
    raise exception
      'En ecole franco-arabe, chaque matiere doit relever du programme francais ou du programme arabe.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.imposer_titulaire_premier_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cycle text; v_filiere text; v_titulaire uuid; v_classe text; v_type text;
begin
  select s.school_type into v_type from schools s where s.id = new.school_id;

  if v_type is distinct from 'franco_arabe' then
    return new;
  end if;

  select c.cycle, c.name into v_cycle, v_classe from classes c where c.id = new.class_id;

  if v_cycle is distinct from 'premier_cycle' then
    return new;
  end if;

  select s.filiere into v_filiere from subjects s where s.id = new.subject_id;

  select h.teacher_id into v_titulaire
  from class_head_teachers h
  where h.class_id = new.class_id
    and h.filiere is not distinct from v_filiere;

  if v_titulaire is null then
    raise exception
      'La classe % est en premier cycle : nommez d''abord son titulaire % avant de lui composer un emploi du temps.',
      v_classe, coalesce(v_filiere, '(unique)')
      using errcode = 'P0001';
  end if;

  new.teacher_id := v_titulaire;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ma_filiere()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select p.filiere from profiles p where p.id = auth.uid(); $function$
;

CREATE OR REPLACE FUNCTION private.mois_est_cloture(p_school uuid, p_jour date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from payroll_closings c
    where c.school_id = p_school
      and c.year = extract(year from p_jour)::int
      and c.month = extract(month from p_jour)::int);
$function$
;

CREATE OR REPLACE FUNCTION private.mon_programme(target_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not private.is_direction_scoped() then true
    when private.ma_filiere() is null then true
    else coalesce(
      (select s.filiere from subjects s where s.id = target_subject_id) = private.ma_filiere(),
      false)
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.mon_programme_evaluation(target_assessment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.mon_programme(
    (select a.subject_id from assessments a where a.id = target_assessment_id));
$function$
;

CREATE OR REPLACE FUNCTION public.my_payroll_month(p_year integer, p_month integer)
 RETURNS TABLE(enseignant_id uuid, enseignant text, contrat text, taux_horaire numeric, salaire_mensuel numeric, heures_pointees numeric, nb_pointages integer, montant numeric, mois_cloture boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_debut date; v_fin date;
begin
  v_debut := make_date(p_year, p_month, 1);
  v_fin := (v_debut + interval '1 month - 1 day')::date;

  return query
  select
    t.id, t.last_name || ' ' || t.first_name, coalesce(t.contract_type, 'non defini'),
    t.hourly_rate, t.monthly_salary,
    round(coalesce(sum(c.hours), 0)::numeric, 2),
    count(c.id)::integer,
    case
      when t.contract_type = 'permanent' then coalesce(t.monthly_salary, 0)
      when t.contract_type = 'vacataire' then
        round(coalesce(sum(c.hours), 0)::numeric * coalesce(t.hourly_rate, 0), 0)
      else 0
    end,
    private.mois_est_cloture(t.school_id, v_debut)
  from teachers t
  left join timetable_checkins c on c.teacher_id = t.id
        and c.occurred_on between v_debut and v_fin
        and c.cancelled_at is null
  -- La borne : ses fiches a lui, dans toutes les ecoles ou il enseigne.
  where t.profile_id = auth.uid()
  group by t.id, t.last_name, t.first_name, t.contract_type,
           t.hourly_rate, t.monthly_salary, t.school_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.slots_a_pointer(p_date date)
 RETURNS TABLE(slot_id uuid, class_id uuid, classe text, matiere text, filiere text, teacher_id uuid, enseignant text, start_time time without time zone, end_time time without time zone, duree numeric, checkin_id uuid, heures_pointees numeric, pointe_par text, pointe_le timestamp with time zone, annule boolean, motif_annulation text, mois_cloture boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select
    ts.id, ts.class_id, c.name, s.name, s.filiere,
    ts.teacher_id, t.last_name || ' ' || t.first_name,
    ts.start_time, ts.end_time,
    round(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0, 2),
    ch.id, ch.hours,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    ch.recorded_at,
    ch.cancelled_at is not null, ch.cancellation_reason,
    private.mois_est_cloture(ts.school_id, p_date)
  from timetable_slots ts
  join classes c on c.id = ts.class_id
  join subjects s on s.id = ts.subject_id
  left join teachers t on t.id = ts.teacher_id
  join academic_years ay on ay.id = ts.academic_year_id
  left join timetable_checkins ch on ch.slot_id = ts.id and ch.occurred_on = p_date
  left join profiles p on p.id = ch.recorded_by
  where ts.day_of_week = extract(isodow from p_date)::int
    and p_date between ay.start_date and ay.end_date
    -- Un jour ferie ou de vacances ne propose aucun creneau.
    and not exists (select 1 from school_holidays h
                    where h.school_id = ts.school_id
                      and p_date between h.start_date and h.end_date)
  order by ts.start_time, c.name;
$function$
;

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

CREATE OR REPLACE FUNCTION private.attribuer_numero_recu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform pg_advisory_xact_lock(hashtext('fee_receipt:' || new.school_id::text));

  select coalesce(max(receipt_number), 0) + 1
    into new.receipt_number
  from fee_payments
  where school_id = new.school_id;

  /*
   * recorded_by est impose ici, jamais accepte du client. Sans cet
   * ecrasement, un utilisateur attribuerait son encaissement a un
   * collegue en envoyant simplement un autre identifiant.
   *
   * On ne l'ecrase que s'il y a une session : les ecritures en service
   * role (reprise, migration) n'ont pas d'auth.uid() et doivent pouvoir
   * renseigner le champ explicitement.
   */
  if auth.uid() is not null then
    new.recorded_by := auth.uid();
  end if;

  -- Un paiement ne nait jamais annule.
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancellation_reason := null;

  return new;
end;
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

CREATE OR REPLACE FUNCTION private.controler_annulation_paiement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Le numero de recu et l'auteur de l'encaissement sont graves.
  if new.receipt_number is distinct from old.receipt_number then
    raise exception 'Le numero de recu ne se modifie pas.';
  end if;

  if new.recorded_by is distinct from old.recorded_by then
    raise exception 'L''auteur de l''encaissement ne se modifie pas.';
  end if;

  -- Une annulation ne se leve pas, et une ligne annulee se fige alors
  -- definitivement : son montant ne bougera plus.
  if old.cancelled_at is not null then
    if new.cancelled_at is null then
      raise exception 'Une annulation ne peut pas etre levee.';
    end if;

    if new.amount_paid is distinct from old.amount_paid
       or new.fee_assessment_id is distinct from old.fee_assessment_id
       or new.payment_date is distinct from old.payment_date
       or new.payment_method is distinct from old.payment_method then
      raise exception 'Un paiement annule ne se modifie plus.';
    end if;
  end if;

  -- Passage a l'etat annule : l'auteur et l'heure sont imposes, comme a
  -- l'encaissement. On ne se fie pas a ce que le client envoie.
  if old.cancelled_at is null and new.cancelled_at is not null then
    new.cancelled_at := now();

    if auth.uid() is not null then
      new.cancelled_by := auth.uid();
    end if;
  end if;

  return new;
end;
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

-- Le numero WhatsApp est obligatoire et unique PAR ECOLE. Declencheur
-- et non index unique : deux fiches existantes partagent deja un numero
-- (deux personnes distinctes), et un index ne pourrait pas se creer sans
-- detruire cette donnee. Voir supabase/enseignants-sans-compte.sql.
CREATE OR REPLACE FUNCTION private.refuser_whatsapp_deja_pris()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_normalise text; v_autre text;
begin
  v_normalise := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');

  if v_normalise = '' then
    raise exception
      'Le numero WhatsApp est obligatoire pour enregistrer un enseignant.'
      using errcode = 'P0001';
  end if;

  select t.first_name || ' ' || t.last_name into v_autre
  from teachers t
  where t.school_id = new.school_id
    and t.id is distinct from new.id
    and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') = v_normalise
  limit 1;

  if v_autre is not null then
    raise exception
      'Le numero WhatsApp % est deja celui de % dans cet etablissement.',
      new.phone, v_autre using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

-- Rend LISIBLE le refus pose structurellement par la cle etrangere
-- fee_payments_fee_assessment_id_fkey (RESTRICT). Sans elle, l'interface
-- afficherait une violation de contrainte brute.
CREATE OR REPLACE FUNCTION private.refuser_suppression_frais_paye()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n_paiements integer; n_annules integer;
begin
  select count(*), count(*) filter (where cancelled_at is not null)
    into n_paiements, n_annules
  from fee_payments where fee_assessment_id = old.id;

  if n_paiements > 0 then
    raise exception
      'Ce frais porte % paiement(s), dont % annule(s) : il ne peut pas etre supprime. Annulez les paiements avec un motif, ils resteront visibles dans l''etat de caisse.',
      n_paiements, n_annules
      using errcode = 'P0001';
  end if;

  return old;
end;
$function$
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
      libelle := 'Recu n' || coalesce(ligne.receipt_number::text, '?')
                 || ' — ' || coalesce(ligne.amount_paid::text, '0') || ' F';

      -- « if » imbrique, pas « and » : sur INSERT, old n'existe pas et
      -- l'ordre d'evaluation d'un AND n'est pas garanti.
      if tg_op = 'UPDATE' then
        if old.cancelled_at is null and new.cancelled_at is not null then
          quoi := 'annulation';
          select 'Annulation du recu n' || new.receipt_number
                 || ' — ' || s.last_name || ' ' || s.first_name
                 || ' — ' || new.amount_paid || ' F — motif : '
                 || coalesce(new.cancellation_reason, '')
            into libelle
          from fee_assessments fa
          join students s on s.id = fa.student_id
          where fa.id = new.fee_assessment_id;
        end if;
      end if;
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

CREATE OR REPLACE FUNCTION public.cash_report_by_collector(p_date date)
 RETURNS TABLE(encaisseur text, role_encaisseur text, nombre bigint, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la caisse.';
  end if;

  return query
  select
    coalesce(nullif(trim(coalesce(pr.first_name,'') || ' ' || coalesce(pr.last_name,'')), ''),
             'Compte sans nom'),
    coalesce(pr.role, 'inconnu'),
    count(*), sum(p.amount_paid)
  from fee_payments p
  left join profiles pr on pr.id = p.recorded_by
  where p.school_id = (select x.school_id from profiles x where x.id = auth.uid())
    and p.payment_date = p_date
    and p.cancelled_at is null
  group by 1, 2
  order by 4 desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cash_report_by_method(p_date date)
 RETURNS TABLE(mode text, nombre bigint, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la caisse.';
  end if;

  return query
  select coalesce(p.payment_method, 'non precise'), count(*), sum(p.amount_paid)
  from fee_payments p
  where p.school_id = (select pr.school_id from profiles pr where pr.id = auth.uid())
    and p.payment_date = p_date
    and p.cancelled_at is null
  group by coalesce(p.payment_method, 'non precise')
  order by 3 desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cash_report_payments(p_date date)
 RETURNS TABLE(recu integer, eleve text, montant numeric, mode text, encaisseur text, annule_le timestamp with time zone, annule_par text, motif text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la caisse.';
  end if;

  return query
  select
    p.receipt_number,
    s.last_name || ' ' || s.first_name,
    p.amount_paid,
    coalesce(p.payment_method, 'non precise'),
    coalesce(nullif(trim(coalesce(pr.first_name,'') || ' ' || coalesce(pr.last_name,'')), ''), 'Compte sans nom'),
    p.cancelled_at,
    nullif(trim(coalesce(pa.first_name,'') || ' ' || coalesce(pa.last_name,'')), ''),
    p.cancellation_reason
  from fee_payments p
  join fee_assessments fa on fa.id = p.fee_assessment_id
  join students s on s.id = fa.student_id
  left join profiles pr on pr.id = p.recorded_by
  left join profiles pa on pa.id = p.cancelled_by
  where p.school_id = (select x.school_id from profiles x where x.id = auth.uid())
    and p.payment_date = p_date
  order by p.receipt_number;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cash_report_totals(p_date date)
 RETURNS TABLE(encaisse numeric, nombre bigint, annule numeric, nombre_annule bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la caisse.';
  end if;

  return query
  select
    coalesce(sum(p.amount_paid) filter (where p.cancelled_at is null), 0),
    count(*) filter (where p.cancelled_at is null),
    coalesce(sum(p.amount_paid) filter (where p.cancelled_at is not null), 0),
    count(*) filter (where p.cancelled_at is not null)
  from fee_payments p
  where p.school_id = (select pr.school_id from profiles pr where pr.id = auth.uid())
    and p.payment_date = p_date;
end;
$function$
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

CREATE OR REPLACE FUNCTION public.payroll_month(p_year integer, p_month integer)
 RETURNS TABLE(enseignant_id uuid, enseignant text, contrat text, statut text, taux_horaire numeric, salaire_mensuel numeric, creneaux integer, heures_planifiees numeric, heures_pointees numeric, heures_non_assurees numeric, heures_payees numeric, jours_absence integer, jours_absence_excusee integer, jours_retard integer, minutes_retard integer, montant numeric, mois_cloture boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ecole uuid;
  v_debut date;
  v_fin date;
  v_cloture boolean;
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la paie.';
  end if;

  select pr.school_id into v_ecole from profiles pr where pr.id = auth.uid();

  v_debut := make_date(p_year, p_month, 1);
  v_fin := (v_debut + interval '1 month - 1 day')::date;
  v_cloture := private.mois_est_cloture(v_ecole, v_debut);

  return query
  with jours as (
    -- On deroule les jours REELS du mois : un forfait de 4 ou 4,33
    -- semaines se tromperait chaque mois. Vacances et feries exclus,
    -- sans quoi les heures planifiees seraient surevaluees.
    select d::date as jour
    from generate_series(v_debut, v_fin, interval '1 day') d
    where not exists (
      select 1 from school_holidays h
      where h.school_id = v_ecole
        and d::date between h.start_date and h.end_date)
  ),
  planifie as (
    select t.id as tid, j.jour,
           sum(extract(epoch from (ts.end_time - ts.start_time)) / 3600.0) as heures
    from jours j
    join timetable_slots ts on ts.day_of_week = extract(isodow from j.jour)
    join academic_years ay on ay.id = ts.academic_year_id
                          and j.jour between ay.start_date and ay.end_date
    join teachers t on t.id = ts.teacher_id
    where ts.school_id = v_ecole
    group by t.id, j.jour
  ),
  /*
   * LE POINTAGE EST LA SOURCE UNIQUE DES HEURES PAYEES D'UN VACATAIRE.
   * Les annules sont exclus ici, et nulle part ailleurs : le total
   * decoule de cette seule ligne.
   */
  pointe as (
    select c.teacher_id as tid, sum(c.hours) as heures, count(*)::integer as nb
    from timetable_checkins c
    where c.school_id = v_ecole
      and c.occurred_on between v_debut and v_fin
      and c.cancelled_at is null
    group by c.teacher_id
  ),
  -- teacher_attendance garde son role DISCIPLINAIRE : il informe, il ne
  -- pilote plus la paie. Une absence est desormais l'absence de pointage.
  releves as (
    select ta.teacher_id as tid,
           count(*) filter (where ta.status = 'absence')::integer as n_abs,
           count(*) filter (where ta.status = 'absence_excusee')::integer as n_exc,
           count(*) filter (where ta.status = 'retard')::integer as n_ret,
           coalesce(sum(case when ta.status = 'retard'
                        then coalesce(ta.minutes_late, 0) else 0 end), 0)::integer as m_ret
    from teacher_attendance ta
    where ta.school_id = v_ecole and ta.occurred_on between v_debut and v_fin
    group by ta.teacher_id
  ),
  agrege as (
    select p.tid, count(distinct p.jour)::integer as nb_creneaux,
           sum(p.heures) as h_planifiees
    from planifie p group by p.tid
  )
  select
    t.id,
    t.last_name || ' ' || t.first_name,
    coalesce(t.contract_type, 'non defini'),
    t.status,
    t.hourly_rate,
    t.monthly_salary,
    coalesce(a.nb_creneaux, 0),
    round(coalesce(a.h_planifiees, 0)::numeric, 2),
    round(coalesce(po.heures, 0)::numeric, 2),
    -- L'ECART entre planifie et pointe : ce que le promoteur surveille.
    round(greatest(coalesce(a.h_planifiees, 0) - coalesce(po.heures, 0), 0)::numeric, 2),
    case
      when t.contract_type = 'vacataire' then round(coalesce(po.heures, 0)::numeric, 2)
      else round(coalesce(a.h_planifiees, 0)::numeric, 2)
    end,
    coalesce(r.n_abs, 0), coalesce(r.n_exc, 0), coalesce(r.n_ret, 0), coalesce(r.m_ret, 0),
    /*
     * Un permanent est mensualise : lui appliquer le calcul horaire le
     * ferait payer a l'heure, ce qui n'est pas son contrat. Un vacataire
     * est paye sur ses heures CONFIRMEES, jamais sur son planning.
     */
    case
      when t.contract_type = 'permanent' then coalesce(t.monthly_salary, 0)
      when t.contract_type = 'vacataire' then
        round(coalesce(po.heures, 0)::numeric * coalesce(t.hourly_rate, 0), 0)
      else 0
    end,
    v_cloture
  from teachers t
  left join agrege a on a.tid = t.id
  left join pointe po on po.tid = t.id
  left join releves r on r.tid = t.id
  where t.school_id = v_ecole
  order by t.last_name, t.first_name;
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

CREATE OR REPLACE FUNCTION public.set_teacher_compensation(p_teacher_id uuid, p_contract_type text, p_hourly_rate numeric, p_monthly_salary numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ecole uuid;
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne permet pas de fixer une remuneration.';
  end if;

  select pr.school_id into v_ecole from profiles pr where pr.id = auth.uid();

  if p_contract_type is not null
     and p_contract_type not in ('permanent', 'vacataire') then
    raise exception 'Type de contrat invalide : % (permanent ou vacataire).', p_contract_type;
  end if;

  update teachers
  set contract_type = p_contract_type,
      hourly_rate = p_hourly_rate,
      monthly_salary = p_monthly_salary
  where id = p_teacher_id
    -- L'ecole de l'appelant est la frontiere : la cle service role du
    -- SECURITY DEFINER contourne le RLS, ce filtre le remplace.
    and school_id = v_ecole;

  if not found then
    raise exception 'Enseignant introuvable dans votre etablissement.';
  end if;
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


-- 7. DECLENCHEURS

CREATE TRIGGER log_academic_periods AFTER INSERT OR DELETE OR UPDATE ON public.academic_periods FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_academic_years AFTER INSERT OR DELETE OR UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_assessments AFTER INSERT OR DELETE OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_attendance AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_class_subjects AFTER INSERT OR DELETE OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_classes AFTER INSERT OR DELETE OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_daily_reminders AFTER INSERT OR DELETE OR UPDATE ON public.daily_reminders FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER directions_set_updated_at BEFORE UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_directions AFTER INSERT OR DELETE OR UPDATE ON public.directions FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER fee_assessments_refus_suppression BEFORE DELETE ON public.fee_assessments FOR EACH ROW EXECUTE FUNCTION private.refuser_suppression_frais_paye();
CREATE TRIGGER log_fee_assessments AFTER INSERT OR DELETE OR UPDATE ON public.fee_assessments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_fee_class_defaults AFTER INSERT OR DELETE OR UPDATE ON public.fee_class_defaults FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER fee_payments_controle_annulation BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION private.controler_annulation_paiement();
CREATE TRIGGER fee_payments_numero_recu BEFORE INSERT ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION private.attribuer_numero_recu();
CREATE TRIGGER log_fee_payments AFTER INSERT OR DELETE OR UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_grades AFTER INSERT OR DELETE OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER lineup_themes_set_updated_at BEFORE UPDATE ON public.lineup_themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER log_lineup_themes AFTER INSERT OR DELETE OR UPDATE ON public.lineup_themes FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_payroll_closings AFTER INSERT OR DELETE OR UPDATE ON public.payroll_closings FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_profiles AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER schools_controle_bascule BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION private.controler_bascule_franco_arabe();
CREATE TRIGGER profiles_prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
CREATE TRIGGER log_enrollments AFTER INSERT OR DELETE OR UPDATE ON public.student_class_enrollments FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER subjects_exiger_filiere BEFORE INSERT OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION private.exiger_filiere_matiere();
CREATE TRIGGER log_subjects AFTER INSERT OR DELETE OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_teacher_attendance AFTER INSERT OR DELETE OR UPDATE ON public.teacher_attendance FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_class_head_teachers AFTER INSERT OR DELETE OR UPDATE ON public.class_head_teachers FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER log_teachers AFTER INSERT OR DELETE OR UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER teachers_whatsapp_unique BEFORE INSERT OR UPDATE OF phone ON public.teachers FOR EACH ROW EXECUTE FUNCTION private.refuser_whatsapp_deja_pris();
CREATE TRIGGER timetable_checkins_controle BEFORE INSERT ON public.timetable_checkins FOR EACH ROW EXECUTE FUNCTION private.controler_pointage();
CREATE TRIGGER timetable_checkins_controle_annulation BEFORE UPDATE ON public.timetable_checkins FOR EACH ROW EXECUTE FUNCTION private.controler_annulation_pointage();
CREATE TRIGGER log_timetable_checkins AFTER INSERT OR DELETE OR UPDATE ON public.timetable_checkins FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER timetable_slots_titulaire BEFORE INSERT OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.imposer_titulaire_premier_cycle();
CREATE TRIGGER log_timetable_slots AFTER INSERT OR DELETE OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.record_activity();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
