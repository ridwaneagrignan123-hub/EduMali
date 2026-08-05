-- =====================================================================
-- Ridwane — les annales et les exercices corrigés
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-05. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- UNE TABLE QUI NE TOUCHE À RIEN
--
-- Aucune clé étrangère, ni vers `schools`, ni vers `students`, ni vers
-- quoi que ce soit. C'est délibéré : un sujet du BAC 2019 n'appartient à
-- aucune école et ne concerne aucun élève inscrit. Le rattacher à une
-- école le rendrait invisible aux autres ; le rattacher à un élève
-- créerait un compte là où il n'en faut aucun.
--
-- La conséquence tient en une phrase : cette table se lit SANS ÊTRE
-- CONNECTÉ. Un élève ouvre /annales sur le téléphone d'un camarade,
-- révise, et repart sans avoir laissé de trace. C'est le seul endroit de
-- l'application où l'anonymat est la fonctionnalité, pas un défaut.
--
-- ---------------------------------------------------------------------
-- DEUX FAÇONS DE PORTER UN DOCUMENT, ET POURQUOI LES DEUX
--
--   file_url ... un PDF déposé dans le bucket `annales`
--   link_url ... un lien vers une source extérieure
--
-- Le lien est de PLEIN DROIT, pas un pis-aller. Recopier chez soi les
-- fichiers compilés par un autre site, c'est reprendre son travail ; et
-- l'exploitant n'a pas les droits de diffusion sur tout ce qui existe.
-- Pointer vers une source libre est légitime et immédiat — le catalogue
-- se remplit dès le premier jour, sans rien héberger d'autrui.
--
-- La contrainte `porte_un_document` impose qu'une entrée mène QUELQUE
-- PART : une ligne sans fichier ni lien est un titre qui ne s'ouvre pas,
-- c'est-à-dire une déception à chaque clic.
--
-- ---------------------------------------------------------------------
-- PERSONNE N'ÉCRIT ICI, SAUF L'EXPLOITANT
--
-- Aucune policy INSERT, UPDATE ou DELETE. Pas une seule. Les écritures
-- passent par la route serveur, sous la clé service role, derrière le
-- garde `platform_operators` — le même que les demandes d'accès.
--
-- Ce n'est pas de la méfiance envers les écoles : c'est qu'un catalogue
-- public partagé par toute la région ne peut pas avoir mille auteurs.
-- Un sujet faux déposé par une école se lirait comme une annale
-- officielle dans quinze pays.
--
-- ---------------------------------------------------------------------
-- LE PAYS EST FACULTATIF
--
-- `country` nul veut dire « toute la région ». Un exercice corrigé sur
-- les équations du second degré n'est pas malien : le forcer à choisir
-- un pays le cacherait à quinze autres. En revanche une annale du DEF
-- 2019 est datée ET située — elle porte son pays.

begin;

create table if not exists public.exam_resources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  /*
   * `annale` : un sujet d'examen réellement tombé, avec son année.
   * `exercice` : un exercice d'entraînement, sans année.
   * La distinction compte pour l'élève — on ne révise pas un sujet
   * officiel comme une feuille d'exercices.
   */
  kind text not null check (kind in ('annale', 'exercice')),

  /*
   * Les examens de la région. La liste est fermée à dessein : en texte
   * libre, le même examen s'écrirait « DEF », « D.E.F », « Def » et se
   * chercherait trois fois. En ajouter un est une migration d'une ligne.
   */
  exam text not null check (exam in ('DEF', 'BEPC', 'BAC', 'CEP')),

  /* Code ISO-3, ou nul pour « toute l'Afrique de l'Ouest ». */
  country text check (country in (
    'MLI', 'SEN', 'BFA', 'CIV', 'NER', 'TGO', 'BEN', 'GIN',
    'GNB', 'SLE', 'LBR', 'GHA', 'NGA', 'GMB', 'CPV', 'MRT'
  )),

  /* La série du BAC (« TSE », « SES », « LL »…). Nulle ailleurs. */
  serie text,

  subject text not null,
  year integer check (year between 1960 and 2100),
  title text not null,

  /* Le PDF hébergé, et/ou le lien sortant. Au moins l'un des deux. */
  file_url text,
  correction_file_url text,
  link_url text,

  /* D'où vient le document. Affiché à l'élève : une source se cite. */
  source_name text,

  /*
   * Retirer du catalogue sans effacer. Un lien mort se désactive le
   * temps de le remplacer ; le titre et la source restent pour savoir
   * ce qu'on cherchait.
   */
  is_active boolean not null default true,

  constraint porte_un_document check (
    file_url is not null or link_url is not null
  ),

  /*
   * Une annale sans année ne se range pas, et un exercice avec année
   * fait croire à un sujet tombé. La contrainte dit la différence.
   */
  constraint annale_datee check (kind <> 'annale' or year is not null)
);

/*
 * L'index sert la seule requête que fait la page : les entrées actives
 * d'un examen, les plus récentes d'abord.
 */
create index if not exists exam_resources_lookup
  on public.exam_resources (exam, subject, year desc)
  where is_active;

alter table public.exam_resources enable row level security;

/*
 * LECTURE PUBLIQUE, ET SEULEMENT DES ENTRÉES ACTIVES.
 *
 * `anon` est le rôle du visiteur sans compte : c'est lui qui porte tout
 * l'intérêt de cette table. `authenticated` est ajouté pour qu'un
 * enseignant déjà connecté n'ait pas à se déconnecter pour lire.
 *
 * Le filtre `is_active` est DANS la policy, pas seulement dans la
 * requête : une entrée désactivée ne doit pas se retrouver en tapant
 * l'URL de l'API à la main.
 */
drop policy if exists exam_resources_public_read on public.exam_resources;

create policy exam_resources_public_read
  on public.exam_resources
  for select
  to anon, authenticated
  using (is_active);

-- Aucune policy d'écriture. Voir l'entête : c'est volontaire.

commit;


-- =====================================================================
-- LE BUCKET DES FICHIERS
-- =====================================================================
-- À créer dans Tableau de bord → Storage : un bucket PUBLIC nommé
-- `annales`. Public parce que le catalogue l'est : une URL signée qui
-- expire au bout d'une heure casserait le lien qu'un élève a partagé à
-- sa classe.
--
-- Le dépôt passe par la route serveur sous clé service role, comme les
-- lignes : le navigateur ne téléverse rien ici directement.


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-05)
-- =====================================================================
-- Sous le rôle `anon` — celui du visiteur sans compte, qui est ici le
-- cas normal et non le cas limite. Deux entrées posées, l'une active,
-- l'autre désactivée, puis effacées :
--
--   LECTURE
--     lire une entrée active .................... 1 ligne
--     lire une entrée désactivée ................ 0 ligne
--
--   ÉCRITURE (jugée aux lignes écrites, pas à l'absence d'erreur)
--     insérer ................................... refusé
--     modifier .................................. 0 ligne
--     supprimer ................................. 0 ligne
--
--   CONTRAINTES
--     entrée sans fichier ni lien ............... refusée
--     annale sans année ......................... refusée
--
-- Le contraste entre « refusé » et « 0 ligne » n'est pas une nuance :
-- sans policy INSERT, PostgreSQL lève ; sans policy UPDATE ou DELETE, il
-- filtre en silence et ne touche rien. Les deux ferment la porte, mais
-- seule la seconde le fait sans le dire — d'où le comptage des lignes.
