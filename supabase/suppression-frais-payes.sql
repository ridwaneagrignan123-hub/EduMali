-- =====================================================================
-- Ridwane — un frais qui porte des paiements ne se supprime plus
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.
--
-- ---------------------------------------------------------------------
-- LE DÉFAUT CORRIGÉ
--
-- fee_payments.fee_assessment_id référençait fee_assessments(id) en
-- ON DELETE CASCADE, et une policy « Frais supprimes par l'admin »
-- autorise la suppression d'un frais.
--
-- Un administrateur supprimant un frais effaçait donc, en une requête,
-- TOUS les paiements rattachés : montants encaissés, numéros de reçu,
-- annulations et leurs motifs, identité de l'encaisseur. Tout le
-- contrôle interne de la caisse — construit précisément pour qu'un
-- encaissement ne puisse pas disparaître sans laisser de trace —
-- tombait par cette seule porte.
--
-- L'interface n'expose pas cette suppression. Ce n'est pas une
-- protection : la clé anon est publique, et la requête part de la
-- console du navigateur en une ligne. Une garantie qui repose sur
-- l'absence de bouton n'est pas une garantie.
-- ---------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------
-- POURQUOI LES DEUX MESURES, ET POURQUOI CE N'EST PAS REDONDANT
--
-- Le choix demandé était entre ON DELETE RESTRICT et un refus applicatif
-- quand des paiements existent. Chacun seul laisse un manque :
--
--   RESTRICT seul garantit, mais ne s'explique pas. Il renvoie
--   « update or delete on table "fee_assessments" violates foreign key
--   constraint "fee_payments_fee_assessment_id_fkey" » — une phrase que
--   personne ne peut interpréter depuis une interface, alors que
--   l'écran affiche le message de Postgres tel quel.
--
--   Le déclencheur seul s'explique, mais ne garantit pas : il se
--   désactive (`alter table ... disable trigger`) et se supprime, là où
--   une clé étrangère tient tant qu'elle existe.
--
-- On garde donc RESTRICT comme garantie structurelle — elle vaut quel
-- que soit le chemin, API, console ou éditeur SQL — et le déclencheur
-- comme ce qui rend le refus LISIBLE. Le déclencheur s'exécutant avant
-- la vérification de la clé, c'est toujours sa phrase que l'on voit.
-- ---------------------------------------------------------------------
alter table fee_payments
  drop constraint fee_payments_fee_assessment_id_fkey;

alter table fee_payments
  add constraint fee_payments_fee_assessment_id_fkey
  foreign key (fee_assessment_id) references fee_assessments(id)
  on delete restrict;

-- Le message dit ce qu'il faut faire à la place : l'annulation motivée
-- existe déjà et conserve la trace, ce que la suppression détruisait.
create or replace function private.refuser_suppression_frais_paye()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
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
$$;

drop trigger if exists fee_assessments_refus_suppression on fee_assessments;
create trigger fee_assessments_refus_suppression
  before delete on fee_assessments
  for each row execute function private.refuser_suppression_frais_paye();

commit;


-- =====================================================================
-- CE QUI A ÉTÉ VÉRIFIÉ, PAS SUPPOSÉ
-- =====================================================================
-- Sous l'identité d'un administrateur réel, RLS actif, en transaction
-- annulée (2026-07-30) :
--
--   Supprimer un frais portant 3 paiements ....... REFUSÉE
--   Message rendu à l'appelant .................. « Ce frais porte 3
--       paiement(s), dont 1 annule(s) : il ne peut pas etre supprime… »
--   Paiements survivants ......................... 3, dont l'annulation
--                                                  et son motif
--   Supprimer un frais SANS paiement ............. AUTORISÉE
--
-- Ce dernier point compte autant que les autres : on ferme la
-- destruction de la caisse, pas la correction d'une saisie erronée.


-- =====================================================================
-- EFFET INDUIT, VOULU : la suppression d'un élève est couverte aussi
-- =====================================================================
-- fee_assessments.student_id référence students(id) en CASCADE. Avant ce
-- correctif, supprimer un ÉLÈVE effaçait ses frais, et la cascade se
-- propageait jusqu'à ses paiements — le même trou, par un chemin plus
-- long. La chaîne bute désormais sur RESTRICT, et comme le déclencheur
-- s'exécute sur le frais cascadé, c'est encore la phrase lisible qui
-- remonte. Vérifié : suppression d'un élève porteur d'un paiement
-- refusée avec « Ce frais porte 1 paiement(s)… ».
--
-- Il en va de même pour la suppression d'une ANNÉE SCOLAIRE
-- (fee_assessments.academic_year_id, CASCADE), seul de ces chemins à
-- être exposé dans l'interface — app/academic/page.tsx, qui affiche
-- `error.message` tel quel, donc la phrase lisible.


-- =====================================================================
-- AUTRES CLÉS EN CASCADE VERS LA CAISSE OU L'AUDIT — SIGNALÉES, NON
-- CORRIGÉES (hors du périmètre demandé)
-- =====================================================================
-- Relevé exhaustif des clés étrangères en ON DELETE CASCADE pointant
-- vers des données de caisse ou de traçabilité, 2026-07-30 :
--
--   activity_log.school_id -> schools ....................... CASCADE
--       Supprimer une école efface sa piste d'audit entière. C'est le
--       cas le plus proche du défaut corrigé : l'audit disparaît avec
--       ce qu'il servait à surveiller, au moment précis où l'on
--       voudrait pouvoir le relire.
--
--   fee_payments.school_id -> schools ....................... CASCADE
--       Même remarque pour la caisse. Aucune suppression d'école n'est
--       exposée dans l'interface, mais la policy de suppression sur
--       `schools` existe.
--
--   sms_logs.student_id / school_id ......................... CASCADE
--       Historique des messages envoyés aux familles.
--
--   teacher_attendance.teacher_id -> teachers ............... CASCADE
--       Retards et absences d'un enseignant s'effacent avec sa fiche —
--       or ce relevé peut fonder une décision qu'il faudra justifier.
--
-- Aucune n'a été modifiée : elles sortent du périmètre du correctif
-- demandé, et deux d'entre elles (les `school_id`) relèvent d'un choix
-- assumé — supprimer un établissement doit sans doute tout emporter.
-- Les deux autres méritent une décision explicite.
