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

-- =====================================================================
-- ET LE CYCLE AVEC : UNE DIRECTION LE PORTE DÉJÀ
-- =====================================================================
--
-- Deuxième constat, le 7 août : l'écran demandait encore son cycle à un
-- directeur nommé sur le PREMIER CYCLE par le directeur général. La
-- question n'avait pas de réponse légitime — et pire, elle en avait une
-- fausse : rien n'empêchait de créer une classe de lycée à l'intérieur
-- d'une direction du premier cycle.
--
-- Le cycle décide du mode de saisie des présences (à la journée au
-- premier cycle, leçon par leçon ensuite) et du mode d'affectation des
-- enseignants. Une classe qui se contredit avec sa direction déraille
-- donc partout en aval.
--
-- La direction porte déjà `cycle`. Le déclencheur, qui sait quelle
-- direction s'applique, en tire le cycle plutôt que de le croire sur
-- parole. Si la direction n'en porte pas, le choix du directeur tient :
-- on n'invente pas une contrainte là où l'école n'en a pas posé.
-- =====================================================================

-- =====================================================================
-- ET LE RATTACHEMENT APRÈS COUP, QUI ÉCHAPPAIT À TOUT
-- =====================================================================
--
-- Le déclencheur n'agissait qu'à l'INSERTION. Il restait donc un chemin
-- entier non couvert : depuis /directions, le directeur général rattache
-- une classe DÉJÀ CRÉÉE à une direction, par un simple UPDATE de
-- direction_id. Rien ne comparait les deux cycles. Une classe de lycée
-- pouvait ainsi entrer dans une direction du premier cycle par la porte
-- de derrière, alors même qu'on venait de fermer la porte de devant.
--
-- LE CHOIX : REFUSER, PAS CORRIGER EN SILENCE
--
-- Aligner d'autorité le cycle de la classe sur celui de la direction
-- serait tentant et serait un piège. Le cycle décide du mode de saisie
-- des présences : basculer une classe de « lycée » à « premier cycle »
-- fait passer ses relevés de lesson_attendance à attendance, et les
-- lignes déjà écrites perdent leur sens. Ce n'est pas une conséquence
-- qu'un déclencheur doit provoquer dans le dos de qui a cliqué.
--
-- La base refuse donc, avec une phrase lisible. C'est l'ÉCRAN qui
-- propose l'alignement, l'annonce, et n'envoie le nouveau cycle qu'après
-- confirmation explicite. Le directeur général garde ainsi une sortie —
-- indispensable, puisqu'aucun écran ne permet de modifier le cycle d'une
-- classe existante.
--
-- ON NE TOUCHE À RIEN QUAND RIEN NE BOUGE
--
-- Le contrôle ne s'applique qu'aux écritures qui déplacent la classe ou
-- changent son cycle. Sans cette réserve, un réglage sans rapport —
-- « qui saisit les notes », par exemple — irait remplir au passage le
-- cycle d'une classe qui n'en avait pas. Un effet de bord silencieux
-- reste un effet de bord silencieux, même quand il va dans le bon sens.
-- =====================================================================

create or replace function private.rattacher_classe_a_la_direction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_direction text;
  nom_direction   text;
begin
  /*
   * Ni le rattachement ni le cycle ne bougent : cette écriture ne nous
   * regarde pas.
   */
  if tg_op = 'UPDATE'
     and new.direction_id is not distinct from old.direction_id
     and new.cycle is not distinct from old.cycle then
    return new;
  end if;

  /*
   * À la création, l'auteur cloisonné n'a pas le choix de sa direction :
   * on la lui impose plutôt que de la lui demander. Le directeur général
   * garde la sienne — y compris nulle, pour ses classes de lycée qui ne
   * dépendent d'aucune direction.
   */
  if tg_op = 'INSERT' and private.is_direction_scoped() then
    new.direction_id := private.current_direction_id();
  end if;

  if new.direction_id is null then
    return new;
  end if;

  select d.cycle, d.name into cycle_direction, nom_direction
  from directions d
  where d.id = new.direction_id;

  -- Une direction sans cycle n'impose rien : l'école n'a pas tranché.
  if cycle_direction is null then
    return new;
  end if;

  /*
   * Le directeur de direction ne choisit pas : l'écran ne lui pose même
   * plus la question, et la base dit la même chose que l'écran.
   */
  if tg_op = 'INSERT' and private.is_direction_scoped() then
    new.cycle := cycle_direction;
    return new;
  end if;

  -- Rien à contredire : on complète.
  if new.cycle is null then
    new.cycle := cycle_direction;
    return new;
  end if;

  if new.cycle <> cycle_direction then
    raise exception
      'La classe « % » est en % alors que la direction « % » est en %.',
      new.name, new.cycle, nom_direction, cycle_direction
      using hint =
        'Rattachez-la à une direction du même cycle, ou alignez son cycle sur celui de la direction.';
  end if;

  return new;
end;
$$;

drop trigger if exists classes_rattachement_direction on public.classes;

create trigger classes_rattachement_direction
  before insert or update on public.classes
  for each row
  execute function private.rattacher_classe_a_la_direction();
