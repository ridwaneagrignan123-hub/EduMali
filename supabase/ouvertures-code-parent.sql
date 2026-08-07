-- =====================================================================
-- COMBIEN DE FOIS, ET DEPUIS COMBIEN DE TEMPS
-- =====================================================================
--
-- `last_used_at` répondait déjà à « cette famille s'en sert-elle ? ».
-- Il lui manquait de quoi répondre aux deux questions que le secrétariat
-- pose juste après :
--
--   « elle a ouvert UNE fois, ou elle s'en sert ? »
--       Une famille qui a ouvert le jour de la remise puis plus jamais
--       n'est pas une famille équipée : c'est une famille qui a essayé.
--       Une date seule ne les distingue pas.
--
--   « ça fait combien de temps que ce papier est parti ? »
--       Un code remis hier et jamais ouvert, c'est normal. Le même code
--       remis il y a deux mois et jamais ouvert, c'est un papier qui
--       n'est jamais arrivé — et c'est un coup de téléphone à passer.
--       `created_at` existait déjà ; c'est l'écran qui n'en tirait rien.
--
-- On n'ajoute donc qu'UNE colonne : le compteur. Le reste se calcule.
--
-- POURQUOI UNE FONCTION PLUTÔT QU'UN UPDATE
--
-- Incrémenter depuis l'application demanderait de lire la valeur, puis
-- d'écrire l'ancienne plus un. Deux parents qui ouvrent en même temps
-- écriraient alors la même valeur, et une ouverture serait perdue. Ici
-- l'incrément se fait dans la même instruction que la lecture, donc il
-- ne peut pas se perdre.
--
-- La fonction est en schéma `public` parce que PostgREST n'expose pas
-- `private` — mais son droit d'exécution est RETIRÉ à anon et à
-- authenticated. Seule la clé de service l'appelle, depuis la route
-- serveur qui vient de valider le code. Sans cela, n'importe qui
-- pourrait faire grimper le compteur d'un code qu'il ne détient pas et
-- faire croire au secrétariat qu'une famille consulte.
-- =====================================================================

alter table public.student_access_codes
  add column if not exists opened_count integer not null default 0;

create or replace function public.marquer_ouverture_code(code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update student_access_codes
  set last_used_at = now(),
      opened_count = opened_count + 1
  where id = code_id
    and revoked_at is null;
$$;

revoke execute on function public.marquer_ouverture_code(uuid) from public;
revoke execute on function public.marquer_ouverture_code(uuid) from anon;
revoke execute on function public.marquer_ouverture_code(uuid) from authenticated;
grant  execute on function public.marquer_ouverture_code(uuid) to service_role;
