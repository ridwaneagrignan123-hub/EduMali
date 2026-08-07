-- =====================================================================
-- LE DIRECTEUR CRÉE LES MATIÈRES DE SA FILIÈRE — FRANCO-ARABE
-- =====================================================================
--
-- Signalé du terrain : « impossible de créer une matière, la table est
-- invisible. Et sans matière, impossible d'affecter un enseignant. »
--
-- Mesuré avant correction :
--
--   directeur général ....... crée une matière : OUI
--   directeur de direction .. refusé par le RLS, et l'entrée « Matières »
--                             n'apparaissait même pas dans son menu
--
-- Ce n'était pas une régression : `subjects` réservait l'écriture à
-- private.dg_ecrit() depuis toujours, et le menu suivait. C'était
-- cohérent tant que les matières appartenaient à l'établissement.
--
-- CE QUI A CHANGÉ, C'EST LE MODÈLE
--
-- L'école a posé la règle : les deux directions d'un couple ne partagent
-- PAS leurs matières. Le programme arabe est celui du directeur arabe.
-- Le lui fermer l'obligeait à passer par le directeur général pour
-- chaque matière — et donc à ne jamais pouvoir affecter un enseignant,
-- puisque l'affectation part de la matière.
--
-- LA LIMITE EXACTE
--
-- Le directeur écrit les matières de SA filière, et rien d'autre :
--
--   `private.ma_filiere() is not null` réserve ces deux policies aux
--   écoles franco-arabes de fait. En école classique un directeur n'a
--   pas de filière : les policies ne mordent jamais, et il consulte la
--   liste sans pouvoir y écrire — exactement comme avant.
--
--   `filiere is not distinct from private.ma_filiere()` interdit de
--   créer une matière de l'autre programme, et interdit aussi de créer
--   une matière SANS programme : une telle matière n'est visible
--   d'aucun directeur de filière — private.mon_programme() la rejette —
--   et serait donc un objet mort dès sa création.
--
-- Les policies du directeur général sont laissées intactes : lui garde
-- le droit d'en créer sans filière, pour les écoles classiques et pour
-- les matières communes.
--
-- MESURE, sous JWT réel, transactions annulées :
--   Amidou (arabe) crée une matière ARABE ...... acceptée
--   Amidou (arabe) crée une matière FRANÇAISE .. refusée
--   directeur général ......................... inchangé
-- =====================================================================

create policy "Directeur cree les matieres de sa filiere"
  on public.subjects for insert to authenticated
  with check (
    private.is_direction_scoped()
    and private.ma_filiere() is not null
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and filiere is not distinct from private.ma_filiere()
  );

create policy "Directeur modifie les matieres de sa filiere"
  on public.subjects for update to authenticated
  using (
    private.is_direction_scoped()
    and private.ma_filiere() is not null
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and filiere is not distinct from private.ma_filiere()
  )
  with check (
    private.is_direction_scoped()
    and private.ma_filiere() is not null
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and filiere is not distinct from private.ma_filiere()
  );

/*
 * La SUPPRESSION n'est pas ouverte. Une matière supprimée emporte ses
 * affectations, ses évaluations et les notes qui en dépendent : ce geste
 * reste au directeur général, qui voit l'établissement entier.
 */
