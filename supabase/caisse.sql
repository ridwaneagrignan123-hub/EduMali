-- =====================================================================
-- Ridwane — contrôle interne de la caisse
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier en est la trace et porte le
-- raisonnement ; `schema.sql` porte l'état. Le rejouer sur la production
-- échouerait, les objets existant déjà.
--
-- ---------------------------------------------------------------------
-- LE DÉFAUT CORRIGÉ
--
-- `fee_payments` n'avait ni numéro de reçu, ni trace de qui encaissait,
-- ni annulation. Un comptable pouvait enregistrer un paiement, le
-- supprimer, et garder l'argent sans laisser de trace. Ce n'était pas
-- une fonctionnalité manquante : c'était un défaut de contrôle interne.
-- ---------------------------------------------------------------------

begin;

alter table fee_payments
  add column if not exists receipt_number integer,
  add column if not exists recorded_by uuid references profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

-- Reprise des paiements antérieurs : numéros chronologiques par école
-- plutôt que `null`. Un carnet à reçus troué dès la première page se lit
-- comme un défaut de données, pas comme un choix — et un promoteur qui
-- voit un blanc se demande ce qu'on lui cache. Avec une seule ligne
-- existante au moment de la reprise, le risque était nul.
with numerotation as (
  select id, row_number() over (
    partition by school_id order by payment_date, created_at, id
  ) as numero
  from fee_payments
  where receipt_number is null
)
update fee_payments p
set receipt_number = n.numero
from numerotation n
where p.id = n.id;

alter table fee_payments alter column receipt_number set not null;

alter table fee_payments
  add constraint fee_payments_receipt_unique unique (school_id, receipt_number);

-- L'annulation est complète ou inexistante, et le motif doit dire
-- quelque chose : trois caractères au moins, sinon un espace suffirait à
-- contourner l'obligation.
alter table fee_payments
  add constraint fee_payments_cancellation_coherente check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (cancelled_at is not null and cancelled_by is not null
        and cancellation_reason is not null
        and length(btrim(cancellation_reason)) >= 3)
  );

create index if not exists fee_payments_school_date_idx
  on fee_payments (school_id, payment_date desc);


-- =====================================================================
-- Attribution du numéro de reçu
-- =====================================================================
-- ---------------------------------------------------------------------
-- POURQUOI UN VERROU CONSULTATIF, ET PAS UNE TABLE DE COMPTEURS
--
--   - Aucune ligne d'amorçage à créer pour une nouvelle école, donc
--     aucun cas « le compteur n'existe pas encore » à gérer.
--   - Le verrou est porté par le school_id : il ne sérialise que les
--     encaissements d'un même établissement. Deux écoles n'attendent
--     jamais l'une l'autre.
--   - Il se libère au commit, sans code de nettoyage ni risque de
--     verrou orphelin.
--
-- Une séquence Postgres par école aurait imposé du DDL dynamique, et
-- laisse des trous en cas de rollback — inacceptable pour un carnet à
-- reçus, où un numéro manquant est une question du contrôleur.
--
-- La contrainte d'unicité reste le garde-fou : si le verrou était un
-- jour contourné, l'insertion échouerait bruyamment au lieu de créer
-- deux reçus portant le même numéro.
--
-- SECURITY DEFINER : le max() doit voir TOUTES les lignes de l'école,
-- indépendamment de ce que le RLS montre à l'appelant.
-- ---------------------------------------------------------------------
create or replace function private.attribuer_numero_recu()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('fee_receipt:' || new.school_id::text));

  select coalesce(max(receipt_number), 0) + 1
    into new.receipt_number
  from fee_payments
  where school_id = new.school_id;

  /*
   * recorded_by est imposé ici, jamais accepté du client. Sans cet
   * écrasement, un utilisateur attribuerait son encaissement à un
   * collègue en envoyant simplement un autre identifiant — et la piste
   * d'audit désignerait un innocent.
   *
   * On ne l'écrase que s'il y a une session : les écritures en service
   * role (reprise, migration) n'ont pas d'auth.uid() et doivent pouvoir
   * renseigner le champ explicitement.
   */
  if auth.uid() is not null then
    new.recorded_by := auth.uid();
  end if;

  -- Un paiement ne naît jamais annulé.
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancellation_reason := null;

  return new;
end;
$$;

create trigger fee_payments_numero_recu
  before insert on fee_payments
  for each row execute function private.attribuer_numero_recu();


-- =====================================================================
-- Annulation : la seule façon de défaire un encaissement
-- =====================================================================
create or replace function private.controler_annulation_paiement()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  -- Le numéro de reçu et l'auteur de l'encaissement sont gravés.
  if new.receipt_number is distinct from old.receipt_number then
    raise exception 'Le numero de recu ne se modifie pas.';
  end if;

  if new.recorded_by is distinct from old.recorded_by then
    raise exception 'L''auteur de l''encaissement ne se modifie pas.';
  end if;

  -- Une annulation ne se lève pas, et une ligne annulée se fige alors
  -- définitivement : son montant ne bougera plus.
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

  -- Passage à l'état annulé : l'auteur et l'heure sont imposés, comme à
  -- l'encaissement. On ne se fie pas à ce que le client envoie.
  if old.cancelled_at is null and new.cancelled_at is not null then
    new.cancelled_at := now();

    if auth.uid() is not null then
      new.cancelled_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create trigger fee_payments_controle_annulation
  before update on fee_payments
  for each row execute function private.controler_annulation_paiement();

-- Sans policy DELETE et avec le RLS actif, toute suppression est
-- refusée. C'est tout l'intérêt du dispositif : la ligne annulée reste
-- visible, motif compris.
drop policy if exists "Paiements supprimes par l'admin" on fee_payments;

-- Le journal : `private.record_activity()` gagne un cas « annulation »
-- pour `fee_payments`, avec reçu, élève, montant et motif. Une
-- annulation ne doit pas se lire « modification d'un paiement » : c'est
-- l'événement que le promoteur cherchera. Voir la version en base, trop
-- longue pour être recopiée ici sans risque de divergence.


-- =====================================================================
-- État de caisse journalier
-- =====================================================================
-- SECURITY DEFINER pour deux raisons : lire le nom des encaisseurs, que
-- la policy de `profiles` réserve à leur propriétaire, et agréger sans
-- dépendre de ce que le RLS laisse voir.
--
-- ⚠️  Le contournement du RLS impose de REFAIRE le contrôle d'accès dans
--     chaque fonction. Sans le `raise`, n'importe quel compte
--     authentifié lirait la caisse de son école.
create or replace function public.cash_report_totals(p_date date)
returns table (encaisse numeric, nombre bigint, annule numeric, nombre_annule bigint)
language plpgsql stable security definer set search_path to 'public'
as $$
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
$$;

-- cash_report_by_method(date), cash_report_by_collector(date) et
-- cash_report_payments(date) suivent le même modèle : même garde, même
-- filtre sur l'école de l'appelant. Voir la version en base.

revoke execute on function public.cash_report_totals(date) from public;
grant execute on function public.cash_report_totals(date) to authenticated;

commit;

-- =====================================================================
-- Mesuré après application, avec une session de comptable
-- =====================================================================
--   1. Numéros de reçu ............ 1 puis 2, incrémentation OK
--   2. recorded_by ................ l'encaisseur lui-même
--   3. Falsifier recorded_by ...... écrasée par le déclencheur
--   4. Supprimer un paiement ...... refusée, 0 ligne
--   5. Annuler sans motif ......... refusée par la contrainte
--   6. Annuler avec motif ......... acceptée
--   7. Ligne annulée .............. toujours présente
--   8. Journal .................... « Annulation du recu n1 —
--      DIARRA Mahmoud — 25000.00 F — motif : Erreur de saisie »
--
-- État de caisse : 30 000 F encaissés sur 1 reçu, 25 000 F annulés sur
-- 1 ; l'annulation sort du total mais reste listée avec son motif. Un
-- compte « enseignant » se voit refuser l'accès aux quatre fonctions.
