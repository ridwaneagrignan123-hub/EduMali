-- =====================================================================
-- Ridwane — spécificités franco-arabe : l'axe filière
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.
--
-- L'axe filière (français / arabe) n'existe QUE si
-- schools.school_type = 'franco_arabe'. En école classique toutes ces
-- colonnes restent nulles et n'apparaissent nulle part.

begin;

-- ---------------------------------------------------------------------
-- UNE FILIÈRE PORTÉE PAR LE LIEN, PLUTÔT QUE DES DIRECTIONS DUPLIQUÉES
--
-- L'autre modélisation possible était de créer deux directions —
-- « 6e français » et « 6e arabe ». Elle a été écartée : les classes sont
-- rattachées à UNE direction (classes.direction_id), et un élève
-- franco-arabe suit les deux programmes dans la même classe. Dupliquer
-- les directions aurait forcé à dupliquer les classes, donc les
-- inscriptions, donc les bulletins.
-- ---------------------------------------------------------------------
alter table profiles add column if not exists filiere text;
alter table profiles drop constraint if exists profiles_filiere_check;
alter table profiles add constraint profiles_filiere_check
  check (filiere is null or filiere in ('francais', 'arabe'));

-- ---------------------------------------------------------------------
-- CE QUE L'INDEX OUVRE, ET CE QU'IL FERME
--
-- Contrairement à ce qu'on pouvait croire, RIEN n'empêchait déjà deux
-- `directeur_direction` sur une même direction : profiles.direction_id
-- ne porte aucune unicité. Vérifié en base avant d'écrire.
--
-- Ce qui manquait n'était donc pas la possibilité, mais le moyen de
-- savoir LEQUEL répond de quel programme. Cet index n'ouvre rien : il
-- ferme le cas absurde de deux directeurs de la MÊME filière sur la même
-- direction.
--
-- Partiel sur `filiere is not null` : en école classique la filière
-- reste nulle et rien n'est contraint — le comportement d'avant.
-- ---------------------------------------------------------------------
create unique index if not exists profiles_directeur_par_filiere
  on profiles (direction_id, filiere)
  where role = 'directeur_direction' and direction_id is not null
    and filiere is not null;

commit;


-- =====================================================================
-- « VOIR SA DIRECTION » QUAND DEUX DIRECTEURS LA PARTAGENT
-- =====================================================================
-- DÉCISION : la filière NOMME la responsabilité, elle ne PARTITIONNE
-- PAS le périmètre RLS. Les deux directeurs voient la même direction,
-- exactement comme aujourd'hui. Aucune policy n'a été touchée.
--
-- Ce n'est pas un renoncement, c'est ce que la donnée impose :
--
--   1. Une classe franco-arabe n'est ni française ni arabe. Elle a deux
--      titulaires et un seul effectif. Il n'existe pas de « classe
--      arabe » à montrer au directeur arabe.
--
--   2. L'élève est unique. Son bulletin porte les deux programmes, ses
--      absences et ses frais ne relèvent d'aucune filière. Restreindre
--      par filière cacherait à chaque directeur la moitié du dossier
--      des élèves dont il répond — y compris le bulletin qu'il signe.
--
--   3. Seules les notes seraient techniquement filtrables, par la
--      filière de la matière. Filtrer là et nulle part ailleurs
--      donnerait un périmètre incohérent : il verrait l'élève, ses
--      absences, ses frais, mais pas ses notes d'arabe.
--
-- La filière sert donc à : distinguer les deux nominations, savoir à qui
-- s'adresser, et cantonner l'affectation groupée du titulaire aux
-- matières de son propre programme (voir cycles-et-titulaires.sql).
--
-- Si un jour le cloisonnement par filière devenait souhaitable, il
-- faudrait d'abord porter la filière sur l'ÉLÈVE ou sur l'INSCRIPTION,
-- pas sur le directeur — et ce serait un autre chantier.


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-07-30)
-- =====================================================================
-- Deux comptes réels promus directeurs de la même direction, RLS actif :
--
--   Deux directeurs, filières distinctes ........... acceptés
--   Un SECOND directeur français ................... refusé (index)
--   Classes vues par le directeur français ......... 3
--   Classes vues par le directeur arabe ............ 3
--   Élèves vus par le directeur français ........... 5
--   Élèves vus par le directeur arabe .............. 5
--
-- Périmètres identiques : le cloisonnement par direction fonctionne
-- toujours, et la filière ne l'a pas entamé.
