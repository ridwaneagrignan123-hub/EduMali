-- =====================================================================
-- Ridwane — les plafonds de l'assistant de révision
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-05. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- POURQUOI UN COMPTEUR, ET POURQUOI EN BASE
--
-- `/annales` est publique et sans compte — c'est tout son intérêt, et
-- c'est aussi ce qui fait que n'importe qui peut consommer les jetons de
-- l'exploitant. Sur une page ouverte, la facture est le premier bug, et
-- elle arrive sans prévenir.
--
-- Le compteur est EN BASE et non en mémoire parce que l'application
-- tourne en fonctions serverless : chaque requête peut atterrir sur une
-- instance neuve. Un compteur en mémoire y repartirait de zéro à
-- intervalles imprévisibles — c'est-à-dire un plafond qui ne plafonne
-- rien, tout en donnant l'impression du contraire.
--
-- ---------------------------------------------------------------------
-- DEUX PLAFONDS, ET UN SEUL EST SÉRIEUX
--
--   par visiteur ... empêche un élève de monopoliser l'assistant. Il se
--                    contourne trivialement — changer de réseau suffit —
--                    et ce n'est pas grave : ce n'est pas le garde-fou
--                    principal, c'est la règle de politesse.
--
--   @global ........ le vrai garde-fou. Quoi qu'il arrive, quel que soit
--                    le nombre de visiteurs ou d'adresses, la
--                    consommation d'une journée est bornée.
--
-- Le fournisseur est le palier GRATUIT de l'API Gemini : il n'y a donc
-- pas de facture à borner, mais un QUOTA À NE PAS ÉPUISER. Nos plafonds
-- sont réglés sous celui de Google, pour que l'élève reçoive une phrase
-- claire — « revenez demain » — plutôt que le refus brut d'un
-- fournisseur dont il n'a jamais entendu parler.
--
-- Les valeurs se règlent par l'environnement (ASSISTANT_LIMITE_VISITEUR,
-- ASSISTANT_LIMITE_JOUR), pas dans le code : Google a déjà réduit ses
-- quotas sans préavis, et il faut pouvoir suivre sans redéployer.
--
-- ---------------------------------------------------------------------
-- L'ADRESSE IP N'EST PAS STOCKÉE
--
-- `bucket` porte une EMPREINTE de l'adresse, pas l'adresse. On a besoin
-- de distinguer deux visiteurs, pas de savoir qui ils sont. Ce qu'on ne
-- conserve pas ne fuit pas.

begin;

create table if not exists public.assistant_quota (
  day date not null,
  bucket text not null,
  used integer not null default 0,
  primary key (day, bucket)
);

alter table public.assistant_quota enable row level security;

-- Aucune policy : seule la clé service role lit et écrit ce compteur.
-- Le navigateur n'a rien à y voir, et surtout rien à y écrire.

/*
 * INCRÉMENT ET LECTURE EN UNE SEULE INSTRUCTION.
 *
 * Lire puis écrire laisserait deux requêtes simultanées passer toutes
 * les deux le dernier jeton du plafond — c'est exactement le cas que le
 * plafond doit empêcher. `on conflict do update ... returning` rend le
 * compte d'après écriture, atomiquement.
 *
 * Le reste est rendu APRÈS consommation : négatif veut dire que l'appel
 * de trop vient d'être compté. Il est refusé, et le compteur garde la
 * trace de la tentative — une rafale se voit dans les chiffres.
 */
create or replace function public.assistant_consommer(
  p_bucket text,
  p_plafond integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  consomme integer;
begin
  insert into public.assistant_quota (day, bucket, used)
  values (current_date, p_bucket, 1)
  on conflict (day, bucket)
  do update set used = public.assistant_quota.used + 1
  returning used into consomme;

  return p_plafond - consomme;
end $$;

/*
 * SECURITY DEFINER sans révocation serait une porte ouverte : n'importe
 * quel visiteur pourrait appeler la fonction en boucle et épuiser le
 * plafond de tous les autres, sans jamais poser une seule question.
 */
revoke all on function public.assistant_consommer(text, integer)
  from public, anon, authenticated;

commit;


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-05)
-- =====================================================================
--   COMPTEUR, plafond fixé à 2
--     1er appel ................................. reste 1  (passe)
--     2e appel .................................. reste 0  (passe)
--     3e appel .................................. reste -1 (refusé)
--     `anon` appelle la fonction ................ refusé
--
--   BOUT EN BOUT, par la route, avec une clé volontairement fausse
--     (mesuré deux fois : sous Anthropic, puis sous Gemini après bascule)
--     question vide ............................. 400
--     rôle « system » glissé dans l'historique .. 400
--     question de 2100 caractères ............... 400
--     appels 1 et 2 (plafond visiteur à 2) ...... 502, aucun texte rendu
--     appel 3 ................................... 429
--     trois origines distinctes ................. trois compteurs, et le
--                                                 compteur global cumule
--
-- Le 502 est le point important : avec une clé fausse, la route rend une
-- ERREUR et pas une phrase. Un texte de repli se lirait comme une
-- réponse, et un élève réviserait une chose que personne n'a écrite.
