-- =====================================================================
-- LE DIRECTEUR DE DIRECTION NE POUVAIT CRÉER AUCUNE CLASSE
-- =====================================================================
--
-- Constaté en production le 6 août 2026 : cinq refus RLS sur `classes`
-- entre 15:41:40 et 15:42:24 UTC, tous du même compte — un directeur de
-- direction qui venait d'être créé. L'école concernée comptait encore
-- zéro classe.
--
-- LA CAUSE
--
-- La policy d'insertion dit :
--
--     private.encadrement_ecrit()
--     AND school_id IN (…)
--     AND (NOT private.is_direction_scoped()
--          OR direction_id = private.current_direction_id())
--
-- Pour un directeur de direction, is_direction_scoped() vaut vrai : il
-- faut donc que direction_id désigne SA direction. Or l'écran des
-- classes n'écrivait que school_id, name, level et cycle. direction_id
-- restait NULL, et « null = 'b7f4…' » ne vaut pas faux : il vaut NULL.
-- La condition n'était jamais VRAIE, l'insertion était refusée à chaque
-- fois. Cent pour cent des tentatives, sans exception.
--
-- Ce n'était pas une policy trop stricte : elle prévoyait explicitement
-- le cas. C'est la colonne qui n'était jamais remplie.
--
-- LE CHOIX DE LA CORRECTION
--
-- On aurait pu ajouter direction_id à l'insertion, dans l'écran. On
-- l'impose plutôt ici, pour la même raison que recorded_by dans sms_logs
-- ou que cancelled_by dans les attestations : ce qui décide d'un
-- cloisonnement ne se demande pas au navigateur. Un second écran, une
-- future importation en masse, une reprise de données — tous héritent de
-- la règle sans avoir à s'en souvenir.
--
-- CE QUE LE DÉCLENCHEUR NE FAIT PAS
--
--   • Il ne touche RIEN quand l'auteur n'est pas cloisonné. Un directeur
--     général crée une classe sans direction, puis la rattache depuis
--     l'écran des directions : ce parcours est inchangé.
--
--   • Il n'agit pas sur UPDATE. Un directeur de direction qui tenterait
--     de déplacer sa classe vers une autre direction doit être REFUSÉ,
--     pas corrigé en silence. La policy s'en charge déjà, et c'est la
--     bonne réponse : on ne donne pas sa classe à quelqu'un d'autre.
--
--   • Il ne masque pas le directeur SANS direction affectée. Dans ce
--     cas current_direction_id() vaut NULL, direction_id reste NULL et
--     l'insertion est de nouveau refusée — à juste titre : le périmètre
--     est vide. C'est ce que dit déjà <AvertissementDirection />.
-- =====================================================================

create or replace function private.rattacher_classe_a_la_direction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * Seul l'auteur cloisonné est concerné. Écraser la valeur pour un
   * directeur général lui retirerait le droit de rattacher une classe
   * à une direction au moment même de sa création.
   */
  if private.is_direction_scoped() then
    new.direction_id := private.current_direction_id();
  end if;

  return new;
end;
$$;

drop trigger if exists classes_rattachement_direction on public.classes;

create trigger classes_rattachement_direction
  before insert on public.classes
  for each row
  execute function private.rattacher_classe_a_la_direction();
