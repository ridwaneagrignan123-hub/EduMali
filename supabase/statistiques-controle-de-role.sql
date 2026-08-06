-- =====================================================================
-- Ridwane — les statistiques vérifient enfin le rôle
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-06. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- LE DÉFAUT : UNE CAPACITÉ ORPHELINE
--
-- Les six fonctions `stats_*` étaient en SECURITY DEFINER, appelables par
-- tout compte connecté, et ne filtraient que sur l'ÉCOLE — jamais sur le
-- rôle.
--
-- Or `src/lib/roles.ts` exclut explicitement le comptable du menu
-- Statistiques, avec le commentaire « le comptable, non ». Il lui
-- suffisait donc d'appeler `/rest/v1/rpc/stats_summary` pour obtenir les
-- moyennes de l'établissement : l'écran appliquait une règle que la base
-- ignorait.
--
-- La portée était limitée — ces fonctions ne rendent que des agrégats,
-- jamais une note nominative, et masquent tout en dessous de trois
-- élèves. Ce n'était pas une fuite de données ; c'était une règle qui ne
-- tenait qu'au menu, et un menu se contourne en tapant l'adresse.
--
-- ---------------------------------------------------------------------
-- POURQUOI LEVER UNE EXCEPTION PLUTÔT QUE RENDRE UN RÉSULTAT VIDE
--
-- Ajouter `and private.peut_voir_stats()` dans le WHERE aurait suffi à
-- fermer l'accès, sans changer le langage des fonctions. On ne l'a pas
-- fait : un écran vide se lit « il n'y a pas de données » et non « cette
-- page ne vous est pas ouverte ». On aurait remplacé une capacité
-- orpheline par un mensonge.
--
-- D'où le passage de `sql` à `plpgsql`, seul moyen de lever, et le même
-- message que celui qui protège déjà la caisse.
--
-- ---------------------------------------------------------------------
-- `#variable_conflict use_column`, ET POURQUOI IL EST INDISPENSABLE
--
-- En plpgsql, les colonnes déclarées dans RETURNS TABLE deviennent des
-- VARIABLES. Or plusieurs corps référencent une colonne du même nom
-- (`matiere` dans stats_subjects, `classe` dans stats_compare_assessments).
-- Sans cette directive, plpgsql lève une ambiguïté et la fonction ne
-- compile pas.
--
-- Avec elle, la colonne l'emporte — et les corps restent MOT POUR MOT
-- ceux d'avant. C'est ce qui a permis de vérifier l'absence de
-- régression par comparaison d'empreintes.
--
-- ---------------------------------------------------------------------
-- LA LISTE EST ÉCRITE EN TOUTES LETTRES
--
-- `private.peut_voir_stats()` n'est pas composée à partir de
-- `is_encadrement()` et `is_surveillant()`. C'est cette fonction qu'on
-- relira le jour où l'on se demandera « qui voit les statistiques ? », et
-- la réponse doit y tenir en une ligne, comme dans `roles.ts`. Le
-- comptable en est absent, et son absence doit se voir.

begin;

create or replace function private.peut_voir_stats()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select p.role in ('promoteur','directeur_general','directeur_direction',
                      'teacher','surveillant','surveillant_general')
    from profiles p where p.id = auth.uid()
  ), false);
$$;

-- Les six fonctions sont recréées à l'identique, en plpgsql, avec le
-- garde en tête. Voir `schema.sql` pour leur corps courant.

commit;


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-06)
-- =====================================================================
--
--   ABSENCE DE RÉGRESSION — la mesure qui comptait le plus
--     Empreinte MD5 du résultat complet de quatre fonctions, calculée
--     AVANT puis APRÈS, sous deux comptes réels (le directeur général
--     d'EPP-Worgou et le promoteur de Khadidjah) :
--
--       8 comparaisons ........................... 8 IDENTIQUES
--
--     Les corps n'ayant pas changé d'un caractère, c'est ce qu'on
--     attendait — mais une conversion sql → plpgsql peut changer le tri,
--     le typage ou la gestion des NULL sans prévenir. Mieux valait le
--     constater que l'espérer.
--
--   LE GARDE SE DÉCLENCHE
--     sans compte, stats_summary ................ refusé
--     promoteur, stats_summary .................. passe
--
--   LA LISTE
--     promoteur, directeur_general,
--     directeur_direction, teacher,
--     surveillant, surveillant_general .......... admis
--     comptable ................................. EXCLU
--
-- CE QUI N'A PAS PU ÊTRE MESURÉ : l'appel depuis un vrai compte
-- comptable. Il n'en existe aucun en base, et le déclencheur
-- `prevent_profile_privilege_escalation` REFUSE d'en fabriquer un, même
-- à la clé service role — « Le rôle, l'établissement et le statut ne
-- peuvent être modifiés que par un administrateur ». Cette impossibilité
-- est elle-même un bon résultat : elle vaut pour un attaquant comme pour
-- l'auditeur.
