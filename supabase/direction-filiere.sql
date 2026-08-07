-- =====================================================================
-- UNE DIRECTION SAIT DE QUELLE FILIÈRE ELLE EST — ÉCOLE FRANCO-ARABE
-- =====================================================================
--
-- Constaté : le directeur général n'avait aucun choix de cycle au moment
-- de NOMMER un directeur. L'écran des comptes ne propose qu'une liste de
-- noms de directions ; comme les deux seules existantes étaient en
-- premier cycle, Mahmoud Diarra — destiné au second cycle — s'y est
-- retrouvé enfermé.
--
-- Le choix du cycle existe pourtant, mais sur un AUTRE écran : celui des
-- directions, qui propose bien les trois. Le geste et l'option étaient
-- séparés.
--
-- Pour offrir le couple (filière, cycle) là où la nomination se fait, il
-- faut que la direction sache de quelle filière elle relève. La colonne
-- n'existait pas : le nom seul la portait, et un nom ne se lit pas par
-- programme.
--
-- LA REPRISE NE DEVINE RIEN
--
-- Elle ne lit pas les noms — « Direction Français A » aurait pu
-- s'appeler autrement. Elle lit la filière du DIRECTEUR déjà rattaché,
-- qui est une donnée saisie :
--
--   Direction arabe A ...... amidousanogo102 (arabe)   -> arabe
--   Direction Français A ... dmahmoud58     (francais) -> francais
--
-- Une direction sans directeur, ou dont les directeurs se contredisent,
-- reste à NULL : on ne tranche pas à sa place.
--
-- SEULEMENT LES ÉCOLES FRANCO-ARABES
--
-- L'axe filière n'existe pas ailleurs — hasFiliere() le dit côté écran,
-- la contrainte le dit ici. Une école classique garde `filiere` à NULL
-- sur toutes ses directions, et ses écrans ne changent pas.
-- =====================================================================

alter table public.directions
  add column if not exists filiere text;

alter table public.directions
  drop constraint if exists directions_filiere_check;

alter table public.directions
  add constraint directions_filiere_check
  check (filiere is null or filiere in ('francais', 'arabe'));

/*
 * Reprise : la filière du directeur rattaché, et seulement quand elle
 * est unique. `count(distinct …) = 1` écarte le cas d'une direction qui
 * porterait déjà deux directeurs de filières différentes — celle-là
 * relève d'une décision humaine, pas d'une migration.
 */
update public.directions d
set filiere = sous.filiere
from (
  select p.direction_id, min(p.filiere) as filiere
  from profiles p
  join schools s on s.id = p.school_id
  where p.role = 'directeur_direction'
    and p.direction_id is not null
    and p.filiere is not null
    and s.school_type = 'franco_arabe'
  group by p.direction_id
  having count(distinct p.filiere) = 1
) as sous
where d.id = sous.direction_id
  and d.filiere is null;

/*
 * Un index unique sur (école, cycle, filière) empêcherait deux
 * directions concurrentes pour le même couple — mais il n'est PAS posé
 * ici. Les écoles existantes n'ont pas été bâties sous cette règle, et
 * une contrainte qui refuse des données déjà en place bloque la
 * migration au lieu d'aider. On y reviendra si le besoin se confirme.
 */
