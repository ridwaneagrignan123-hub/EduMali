-- =====================================================================
-- Ridwane — le logo de l'établissement, importé plutôt que collé
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-05. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- POURQUOI UN BUCKET, ALORS QU'UN CHAMP URL EXISTAIT DÉJÀ
--
-- Demander une URL supposait que le directeur ait déjà hébergé son logo
-- quelque part — ce qui, en pratique, veut dire savoir ce qu'est un
-- hébergeur d'images. Le fichier est sur son téléphone ou sur la clé USB
-- de l'imprimeur. Il doit pouvoir le déposer directement.
--
-- Le champ URL RESTE dans l'écran : certaines écoles hébergent déjà leur
-- logo sur leur propre site, et le retirer casserait ce qui fonctionne
-- chez elles aujourd'hui.
--
-- ---------------------------------------------------------------------
-- CE BUCKET EST PLUS FERMÉ QUE CELUI DES PHOTOS D'ÉLÈVES
--
-- Les photos d'élèves s'écrivent par tout membre de l'école ; le premier
-- segment du chemin doit seulement correspondre à son `school_id`.
--
-- Le logo exige EN PLUS `private.dg_ecrit()`. Un logo n'est pas une
-- photo parmi d'autres : c'est le PAPIER À EN-TÊTE de l'établissement.
-- Il paraît sur les bulletins et, depuis peu, sur les attestations et
-- les certificats. Le laisser au premier enseignant venu reviendrait à
-- laisser réécrire l'en-tête des documents officiels de l'école.
--
-- ---------------------------------------------------------------------
-- LE CHEMIN NE CHANGE JAMAIS
--
-- `<school_id>/logo`, sans extension, quel que soit le format déposé.
-- Deux conséquences voulues : un nouveau dépôt REMPLACE l'ancien au lieu
-- d'accumuler des fichiers orphelins, et il ne peut jamais exister deux
-- logos pour une même école. Le type MIME voyage dans les métadonnées de
-- l'objet, l'extension n'y ajouterait rien.
--
-- Le revers est le cache du navigateur : l'URL étant stable, l'ancien
-- logo resterait affiché. L'écran ajoute donc `?v=<horodatage>` au
-- moment d'enregistrer — même procédé que les photos d'élèves.
--
-- ---------------------------------------------------------------------
-- LE SVG EST REFUSÉ, ET C'EST L'ÉCRAN QUI LE REFUSE
--
-- Un SVG est un document, pas une image : il peut porter du script, qui
-- s'exécuterait pour qui ouvre l'URL du fichier directement. Le bucket
-- étant public — il le faut, le logo s'imprime — cette URL est
-- atteignable par n'importe qui.
--
-- Le contrôle est côté écran, ce qui est une BARRIÈRE FAIBLE : un appel
-- direct au Storage la contourne. Elle est acceptée telle quelle parce
-- que seul le directeur général peut écrire ici, et qu'une école qui
-- attaque son propre en-tête n'attaque qu'elle-même. Si ce bucket
-- s'ouvrait un jour plus largement, il faudrait déplacer le contrôle
-- dans une route serveur.

begin;

insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Deposer un logo - directeur general" on storage.objects;

create policy "Deposer un logo - directeur general"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-logos'
    and private.dg_ecrit()
    and (storage.foldername(name))[1] = (
      select p.school_id::text from profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "Remplacer un logo - directeur general" on storage.objects;

create policy "Remplacer un logo - directeur general"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'school-logos'
    and private.dg_ecrit()
    and (storage.foldername(name))[1] = (
      select p.school_id::text from profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "Retirer un logo - directeur general" on storage.objects;

create policy "Retirer un logo - directeur general"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-logos'
    and private.dg_ecrit()
    and (storage.foldername(name))[1] = (
      select p.school_id::text from profiles p where p.id = auth.uid()
    )
  );

commit;


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-05)
-- =====================================================================
-- Le prédicat de la policy, recopié verbatim, évalué sous de vraies
-- réclamations JWT :
--
--   le DG dépose dans SON dossier ............. autorisé
--   le DG dépose chez une AUTRE école ......... refusé
--   le promoteur dépose dans son école ........ refusé
--   bucket lisible publiquement ............... oui (le logo s'imprime)
--
-- MESURE PAR ÉVALUATION DU PRÉDICAT, non par insertion réelle :
-- `storage.objects` refuse la suppression directe (garde
-- `storage.protect_delete`), et l'on ne laisse pas derrière soi des
-- lignes de métadonnées pointant vers des fichiers inexistants dans une
-- base de production. Le prédicat testé est celui de la policy, mot pour
-- mot ; ce que cette mesure ne couvre pas est le chemin d'appel du
-- Storage lui-même.
