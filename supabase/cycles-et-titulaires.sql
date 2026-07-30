-- =====================================================================
-- Ridwane — cycles maliens et modèles d'affectation
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

begin;

-- ---------------------------------------------------------------------
-- POURQUOI UNE COLONNE ET NON `level`
--
-- `classes.level` est un texte libre : « 6eme », « 6e » et « Sixième »
-- y coexistent. Une règle d'affectation ne peut pas s'appuyer là-dessus
-- sans se tromper au premier synonyme.
--
-- Nullable, et sans reprise de l'existant : les classes créées avant
-- cette colonne n'ont pas de cycle, et le deviner à leur place serait
-- inventer. Sans cycle, l'écran retombe sur le mode par matière —
-- c'est-à-dire le comportement actuel, inchangé.
-- ---------------------------------------------------------------------
alter table classes add column if not exists cycle text;
alter table classes drop constraint if exists classes_cycle_check;
alter table classes add constraint classes_cycle_check
  check (cycle is null or cycle in ('premier_cycle', 'second_cycle', 'lycee'));

-- ---------------------------------------------------------------------
-- LE TITULAIRE EST PORTÉ PAR LA CLASSE, PAS PAR LES MATIÈRES
--
-- Au premier cycle, un enseignant tient TOUTE la classe. On aurait pu
-- le déduire de class_subjects — « le même enseignant sur toutes les
-- lignes » — mais cette lecture ment dès qu'une matière manque ou vient
-- d'être créée : la classe paraîtrait alors sans titulaire.
--
-- class_subjects reste utilisé pour les coefficients. Les deux tables ne
-- se recouvrent pas : l'une dit QUI tient la classe, l'autre ce qui y
-- est enseigné et avec quel poids.
--
-- Second cycle et lycée n'ont PAS de titulaire : class_subjects gère
-- déjà un enseignant par couple (classe, matière), avec
-- UNIQUE (class_id, subject_id). Un enseignant peut donc porter
-- plusieurs matières dans une classe et dans plusieurs classes — ce
-- modèle n'a pas été touché.
-- ---------------------------------------------------------------------
create table if not exists class_head_teachers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  filiere text,
  constraint class_head_teachers_filiere_check
    check (filiere is null or filiere in ('francais', 'arabe'))
);

-- DEUX index partiels plutôt qu'une seule contrainte : ils disent les
-- deux règles distinctes sans forcer une filière factice en école
-- classique, où l'axe n'existe pas et doit rester invisible.
create unique index if not exists class_head_teachers_sans_filiere
  on class_head_teachers (class_id) where filiere is null;

create unique index if not exists class_head_teachers_par_filiere
  on class_head_teachers (class_id, filiere) where filiere is not null;

alter table class_head_teachers enable row level security;

-- Policies calquées sur celles de class_subjects, cloisonnement par
-- direction compris : un directeur de direction ne titularise que chez
-- lui.
create policy "Titulaires lus dans son ecole" on class_head_teachers
  for select to authenticated
  using (school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and ((not private.is_direction_scoped())
      or private.class_direction_id(class_id) = private.current_direction_id()));

create policy "Encadrement nomme les titulaires" on class_head_teachers
  for insert to authenticated
  with check (private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and ((not private.is_direction_scoped())
      or private.class_direction_id(class_id) = private.current_direction_id()));

create policy "Encadrement change les titulaires" on class_head_teachers
  for update to authenticated
  using (private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and ((not private.is_direction_scoped())
      or private.class_direction_id(class_id) = private.current_direction_id()))
  with check (private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid()));

create policy "Encadrement retire les titulaires" on class_head_teachers
  for delete to authenticated
  using (private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and ((not private.is_direction_scoped())
      or private.class_direction_id(class_id) = private.current_direction_id()));

-- ---------------------------------------------------------------------
-- LA FILIÈRE D'UNE MATIÈRE
--
-- Nécessaire dès ici : sans elle, « affecter le titulaire à toutes les
-- matières » ne saurait pas s'arrêter au programme du titulaire, et
-- donnerait le Coran au titulaire français.
--
-- Nulle partout par défaut. En école classique elle reste nulle et
-- n'apparaît nulle part.
-- ---------------------------------------------------------------------
alter table subjects add column if not exists filiere text;
alter table subjects drop constraint if exists subjects_filiere_check;
alter table subjects add constraint subjects_filiere_check
  check (filiere is null or filiere in ('francais', 'arabe'));

commit;


-- =====================================================================
-- VÉRIFIÉ SOUS L'IDENTITÉ D'UN ADMIN, RLS ACTIF (2026-07-30)
-- =====================================================================
--   Titulaire unique sans filière .................. OK
--   Un second sans filière ......................... refusé
--   Deux titulaires, un par filière ................ OK, 2 titulaires
--   Un second titulaire arabe ...................... refusé
--   Filière « anglais » ............................ refusée
--   Extension aux matières du programme arabe ...... 1 matière
--   Extension aux matières du programme français ... 1 matière
--   Croisement des programmes ...................... aucun
