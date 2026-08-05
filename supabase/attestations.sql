-- =====================================================================
-- Ridwane — les attestations et certificats
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-05. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- CE QU'UNE ATTESTATION EST, ET CE QUI EN DÉCOULE
--
-- Ce n'est pas une vue sur les données de l'école : c'est un DOCUMENT
-- REMIS À QUELQU'UN, qui sortira de l'établissement et qu'une banque, un
-- lycée ou une ambassade lira sans jamais pouvoir appeler l'école.
--
-- Tout le reste de cette table découle de cette phrase.
--
-- ---------------------------------------------------------------------
-- LES FAITS SONT FIGÉS, PAS RELUS
--
-- Chaque attestation porte une PHOTOGRAPHIE de ce qu'elle certifie :
-- le nom, la classe, l'année, les dates, jusqu'au nom de l'école et à
-- celui du signataire. Aucun de ces libellés n'est relu depuis les
-- tables vivantes au moment de l'impression.
--
-- La raison tient en un cas : un élève change de classe en janvier, ou
-- son nom est corrigé après une faute de saisie. Si l'attestation
-- n'avait qu'une clé étrangère, une réimpression dirait autre chose que
-- le papier déjà remis à la famille — et deux documents portant le même
-- numéro et disant des choses différentes, c'est la définition d'un
-- faux. Le lien vers l'élève reste, mais comme COMMODITÉ de navigation ;
-- ce qui fait foi est la photographie.
--
-- C'est le même raisonnement que `timetable_checkins.teacher_id`, déjà
-- dénormalisé ici pour que la dette reste envers qui a assuré l'heure.
--
-- Corollaire : `student_id` et `teacher_id` sont en ON DELETE SET NULL.
-- Un élève supprimé emporte sa fiche, jamais l'attestation qu'on lui a
-- remise. `subject_type` porte alors seul l'identité du document.
--
-- ---------------------------------------------------------------------
-- LE NUMÉRO EST CE QUI REND LE DOCUMENT VÉRIFIABLE
--
-- Sans numéro, une attestation n'est qu'un papier à en-tête. Il est
-- attribué comme les numéros de reçu — verrou consultatif par école,
-- puis max + 1 — parce que deux émissions simultanées portant le même
-- numéro détruiraient précisément ce que le numéro sert à établir.
--
-- Il est MONOTONE et ne repart pas à zéro chaque année : la référence
-- affiche l'année pour la lisibilité, mais c'est le numéro qui garantit
-- l'unicité. Une remise à zéro annuelle ajouterait un risque de doublon
-- pour un gain cosmétique.
--
-- ---------------------------------------------------------------------
-- ÉMIS PAR LE DIRECTEUR GÉNÉRAL, ET PAR LUI SEUL
--
-- Le promoteur LIT le registre et réimprime, il n'émet pas. Ce n'est pas
-- un oubli : le modèle de rôles de cette application dit qu'il voit tout
-- et n'écrit rien, hors nominations, et les deux fonctions jumelles
-- `private.encadrement_ecrit()` et `private.dg_ecrit()` existent pour
-- qu'aucune écriture ne le nomme par inadvertance. Signer au nom de
-- l'établissement est un acte de direction.
--
-- ---------------------------------------------------------------------
-- UN DOCUMENT ÉMIS NE SE RÉÉCRIT PLUS, ET NE S'EFFACE PAS
--
-- Aucune policy DELETE, et un déclencheur qui refuse toute modification
-- des faits après l'émission. Seule l'ANNULATION est permise, avec un
-- motif obligatoire — c'est la seule opération qui se conteste : on
-- demandera pourquoi une attestation a été retirée, jamais pourquoi elle
-- a été imprimée deux fois.
--
-- Effacer une attestation serait pire qu'inutile : le papier, lui,
-- continue de circuler. Ce qu'il faut pouvoir dire, c'est « ce numéro a
-- été annulé le tant, pour ce motif ».

begin;

create table if not exists public.attestations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references public.schools(id) on delete cascade,

  /*
   * Le type de document. `certificat_*` clôt quelque chose — une
   * scolarité, un contrat — là où `attestation_*` constate un état en
   * cours. La distinction n'est pas cosmétique : on ne remet pas un
   * certificat de travail à quelqu'un qui est encore en poste.
   */
  kind text not null check (kind in (
    'attestation_scolarite',
    'attestation_travail',
    'certificat_scolarite',
    'certificat_travail'
  )),

  /*
   * L'identité du document, indépendante des tables vivantes. Elle
   * survit à la suppression de la fiche de l'intéressé.
   */
  subject_type text not null check (subject_type in ('eleve', 'enseignant')),

  /* Commodité de navigation, jamais source de vérité. Voir l'entête. */
  student_id uuid references public.students(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,

  /* Le numéro, attribué par déclencheur. Jamais accepté du client. */
  number integer not null,
  reference text not null,

  -- ---------------- la photographie des faits, figée ----------------
  school_name text not null,
  subject_full_name text not null,
  subject_birth_date date,
  subject_birth_place text,
  subject_matricule text,

  /* Élève : sa classe et l'année certifiée. */
  class_label text,
  academic_year_label text,

  /* Enseignant : sa fonction et le début de son service. */
  role_label text,
  start_date date,

  /* Les certificats closent : ils portent une fin. */
  end_date date,

  /* « Pour servir et valoir ce que de droit », ou le motif énoncé. */
  purpose text,

  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles(id) on delete set null,
  signatory_name text not null,

  -- ------------------------- annulation -----------------------------
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,

  constraint attestations_reference_unique UNIQUE (school_id, reference),
  constraint attestations_number_unique UNIQUE (school_id, number),

  /*
   * Le type de document et la nature de l'intéressé doivent s'accorder.
   * Sans cette contrainte, une « attestation de travail » pourrait viser
   * un élève — et personne ne s'en apercevrait avant que la famille ne
   * la présente quelque part.
   */
  constraint attestations_kind_accorde CHECK (
    (kind in ('attestation_scolarite', 'certificat_scolarite')
      and subject_type = 'eleve')
    or
    (kind in ('attestation_travail', 'certificat_travail')
      and subject_type = 'enseignant')
  ),

  /* Un certificat sans date de fin ne clôt rien : c'est une attestation. */
  constraint attestations_certificat_date_fin CHECK (
    kind not in ('certificat_scolarite', 'certificat_travail')
    or end_date is not null
  ),

  /*
   * Le motif d'annulation est OBLIGATOIRE ici, contrairement aux notes
   * ou aux présences. Une attestation retirée se conteste — on demandera
   * pourquoi — là où une note se corrige tous les jours.
   */
  /*
   * `cancellation_reason is not null` N'EST PAS REDONDANT avec le
   * `length()` qui suit. Un CHECK ne rejette que sur FALSE, jamais sur
   * NULL : sans ce test, `length(btrim(null)) >= 3` vaut NULL, la
   * disjonction entière vaut NULL, et la contrainte LAISSE PASSER.
   *
   * Écrite sans lui, cette contrainte a effectivement accepté une
   * annulation sans motif à la première mesure. Les autres tables de
   * l'application portaient déjà la forme correcte.
   */
  constraint attestations_annulation_coherente CHECK (
    (cancelled_at is null and cancelled_by is null
      and cancellation_reason is null)
    or
    (cancelled_at is not null and cancelled_by is not null
      and cancellation_reason is not null
      and length(btrim(cancellation_reason)) >= 3)
  )
);

create index if not exists attestations_school_lookup
  on public.attestations (school_id, issued_at desc);

create index if not exists attestations_student_lookup
  on public.attestations (student_id) where student_id is not null;

create index if not exists attestations_teacher_lookup
  on public.attestations (teacher_id) where teacher_id is not null;


-- =====================================================================
-- LE NUMÉRO, L'AUTEUR ET L'HEURE SONT IMPOSÉS
-- =====================================================================
-- Repris de `private.attribuer_numero_recu()`, y compris le verrou
-- consultatif par école : deux émissions simultanées dans deux écoles
-- différentes ne se gênent pas, deux dans la même s'attendent.

create or replace function private.attribuer_numero_attestation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nom text;
begin
  perform pg_advisory_xact_lock(hashtext('attestation:' || new.school_id::text));

  select coalesce(max(number), 0) + 1
    into new.number
  from attestations
  where school_id = new.school_id;

  new.reference := 'ATT-' || to_char(now(), 'YYYY') || '-'
                   || lpad(new.number::text, 4, '0');

  /*
   * L'auteur est imposé, jamais accepté du client : sans cet écrasement,
   * on signerait au nom d'un collègue en envoyant simplement un autre
   * identifiant. On ne l'écrase que s'il y a une session — les écritures
   * en service role (reprise, migration) doivent pouvoir le renseigner.
   */
  if auth.uid() is not null then
    new.issued_by := auth.uid();

    select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      into nom
    from profiles p
    where p.id = auth.uid();

    /*
     * Le nom du signataire est FIGÉ ici. Le relire à l'impression ferait
     * changer le signataire d'un document déjà remis le jour où le
     * directeur général est remplacé.
     */
    if nom is not null and nom <> '' then
      new.signatory_name := nom;
    end if;
  end if;

  new.issued_at := now();

  -- Une attestation ne naît jamais annulée.
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancellation_reason := null;

  return new;
end $$;

drop trigger if exists attestations_numero on public.attestations;

create trigger attestations_numero
  before insert on public.attestations
  for each row execute function private.attribuer_numero_attestation();


-- =====================================================================
-- APRÈS L'ÉMISSION, PLUS RIEN NE BOUGE SAUF L'ANNULATION
-- =====================================================================
-- C'est la garantie centrale de cette table. Sans elle, le registre
-- resterait modifiable et le numéro ne prouverait rien : on pourrait
-- réécrire les faits sous une référence déjà remise.

create or replace function private.figer_attestation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.number is distinct from old.number
     or new.reference is distinct from old.reference
     or new.kind is distinct from old.kind
     or new.subject_type is distinct from old.subject_type
     or new.school_name is distinct from old.school_name
     or new.subject_full_name is distinct from old.subject_full_name
     or new.subject_birth_date is distinct from old.subject_birth_date
     or new.subject_birth_place is distinct from old.subject_birth_place
     or new.subject_matricule is distinct from old.subject_matricule
     or new.class_label is distinct from old.class_label
     or new.academic_year_label is distinct from old.academic_year_label
     or new.role_label is distinct from old.role_label
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.purpose is distinct from old.purpose
     or new.issued_at is distinct from old.issued_at
     or new.issued_by is distinct from old.issued_by
     or new.signatory_name is distinct from old.signatory_name then
    raise exception 'Une attestation emise ne se modifie plus. Annulez-la et emettez-en une autre.';
  end if;

  /*
   * UNE ANNULATION SE FIGE ELLE AUSSI.
   *
   * Interdire de la lever ne suffisait pas : son auteur et son motif
   * restaient réécrivables après coup, et une trace qu'on peut réécrire
   * ne trace rien — on pourrait annuler, puis attribuer l'annulation à
   * un collègue et changer la raison.
   */
  if old.cancelled_at is not null then
    if new.cancelled_at is null then
      raise exception 'Une annulation ne peut pas etre levee.';
    end if;

    if new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancellation_reason is distinct from old.cancellation_reason then
      raise exception 'Une annulation ne se reecrit pas.';
    end if;
  end if;

  -- L'auteur et l'heure de l'annulation sont imposés, comme à l'émission.
  if old.cancelled_at is null and new.cancelled_at is not null then
    new.cancelled_at := now();

    if auth.uid() is not null then
      new.cancelled_by := auth.uid();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists attestations_figee on public.attestations;

create trigger attestations_figee
  before update on public.attestations
  for each row execute function private.figer_attestation();


-- =====================================================================
-- CLOISONNEMENT
-- =====================================================================

alter table public.attestations enable row level security;

/*
 * LECTURE : tout l'encadrement de l'école — promoteur compris. Le
 * registre des documents émis en son nom est exactement ce qu'un
 * propriétaire doit pouvoir consulter.
 */
drop policy if exists "Attestations lues par l'encadrement" on public.attestations;

create policy "Attestations lues par l'encadrement"
  on public.attestations for select to authenticated
  using (
    private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

/*
 * ÉMISSION : le directeur général seul. `private.dg_ecrit()` est la
 * fonction qui exclut le promoteur — voir l'entête.
 */
drop policy if exists "Attestations emises par le directeur general" on public.attestations;

create policy "Attestations emises par le directeur general"
  on public.attestations for insert to authenticated
  with check (
    private.dg_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

/*
 * ANNULATION : le directeur général seul également. La policy autorise
 * l'UPDATE ; c'est le déclencheur `attestations_figee` qui le réduit à
 * la seule annulation. Deux barrières distinctes, chacune à sa place —
 * le RLS dit QUI, le déclencheur dit QUOI.
 */
drop policy if exists "Attestations annulees par le directeur general" on public.attestations;

create policy "Attestations annulees par le directeur general"
  on public.attestations for update to authenticated
  using (
    private.dg_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

-- Aucune policy DELETE. Voir l'entête : le papier continue de circuler.

commit;


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-05)
-- =====================================================================
-- Sous de VRAIES réclamations JWT, avec les comptes réels d'EPP-Worgou :
-- un directeur général, un promoteur de la même école, et un promoteur
-- d'une autre école. Lignes de test effacées ensuite.
--
--   ÉMISSION
--     le DG émet ................................ 1 ligne
--     référence attribuée ....................... ATT-2026-0001
--     seconde émission .......................... ATT-2026-0002
--     nom du signataire envoyé par le client .... ignoré, remplacé par
--                                                 « Mahmoud DIARRA »
--     issued_by envoyé par le client ............ ignoré, remplacé par
--                                                 le DG lui-même
--
--   LE PROMOTEUR (règle du modèle de rôles)
--     émet ...................................... refusé
--     lit le registre ........................... 2 lignes
--     annule .................................... 0 ligne
--     supprime .................................. 0 ligne
--     promoteur d'une AUTRE école lit ........... 0 ligne
--
--   IMMUABILITÉ
--     le DG réécrit un fait ..................... refusé
--     le DG supprime ............................ 0 ligne
--
--   ANNULATION
--     sans motif ................................ refusé
--     avec motif ................................ 1 ligne
--     auteur envoyé par le client ............... ignoré, remplacé
--     heure envoyée par le client (2000-01-01) .. ignorée, remplacée
--     réécrire le motif après coup .............. refusé
--     lever l'annulation ........................ refusé
--
--   CONTRAINTES
--     attestation de TRAVAIL visant un ÉLÈVE .... refusée
--     certificat sans date de fin ............... refusé
--
-- DEUX DÉFAUTS ONT ÉTÉ TROUVÉS À LA PREMIÈRE MESURE, et corrigés :
-- l'annulation sans motif passait (NULL dans un CHECK), et une
-- annulation posée restait réécrivable. Les deux se lisaient « 1 ligne »
-- là où on attendait « refusé » — ce qu'aucune absence d'exception
-- n'aurait signalé.
