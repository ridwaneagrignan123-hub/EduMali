-- =====================================================================
-- Ridwane — la fiche enseignant se découple du compte de connexion
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.
--
-- ---------------------------------------------------------------------
-- LES DEUX DÉFAUTS CORRIGÉS, ET LEUR CAUSE COMMUNE
--
-- Le seul chemin d'enregistrement, /api/teachers/invite, appelait
-- inviteUserByEmail(). Créer un compte d'authentification impose un
-- email unique AU MONDE, d'où :
--
--   - impossible d'enregistrer un enseignant déjà présent dans une
--     autre école — or un vacataire tourne précisément entre écoles ;
--   - email obligatoire pour tous, alors que la plupart des vacataires
--     n'en ont pas et ne se connecteront jamais.
--
-- Une fiche enseignant est un enregistrement tenu par l'administration.
-- Elle ne touche plus du tout à l'authentification : POST /api/teachers
-- insère la fiche, `profile_id` reste nul. Ouvrir un accès est un geste
-- distinct et facultatif, /api/teachers/invite, seul endroit qui exige
-- encore un email.
--
-- La collision d'email disparaît d'elle-même : plus aucun compte n'est
-- créé à l'enregistrement.
-- ---------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------
-- LE NUMÉRO WHATSAPP : `phone` RÉUTILISÉE, PAS DE COLONNE NOUVELLE
--
-- `teachers.phone` est DÉJÀ le numéro WhatsApp dans les faits :
-- app/supervision/page.tsx construit `https://wa.me/…` à partir d'elle
-- pour écrire à un enseignant en retard. Ajouter une colonne `whatsapp`
-- aurait créé deux numéros là où le code n'en utilise qu'un, obligé à
-- migrer l'existant et à reprendre la supervision — pour renommer ce
-- qui portait déjà le bon sens.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- POURQUOI UN DÉCLENCHEUR ET NON UN INDEX UNIQUE
--
-- L'unicité voulue est (école, numéro), jamais globale : le même
-- enseignant doit pouvoir être enregistré dans plusieurs écoles.
--
-- Un index unique aurait été plus simple, mais il ne peut pas se créer :
-- deux fiches existantes partagent déjà un numéro dans la même école
-- (deux personnes distinctes, relevé le 2026-07-30). Les modifier ou
-- les supprimer pour faire passer une contrainte aurait détruit une
-- donnée que personne n'a demandé de détruire.
--
-- Ce déclencheur n'examine que la ligne ÉCRITE. L'existant reste tel
-- quel et reste modifiable — il ne se déclenche que sur INSERT ou sur
-- un UPDATE qui touche `phone`. Seule la ressaisie d'un numéro déjà
-- pris est refusée.
--
-- Il porte aussi l'obligation elle-même. La route serveur et le
-- formulaire exigent le numéro, mais un insert direct depuis la console
-- les contournerait tous les deux : la règle est donc posée là où rien
-- ne la contourne.
create or replace function private.refuser_whatsapp_deja_pris()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare v_normalise text; v_autre text;
begin
  v_normalise := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');

  if v_normalise = '' then
    raise exception
      'Le numero WhatsApp est obligatoire pour enregistrer un enseignant.'
      using errcode = 'P0001';
  end if;

  select t.first_name || ' ' || t.last_name into v_autre
  from teachers t
  where t.school_id = new.school_id
    and t.id is distinct from new.id
    and regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') = v_normalise
  limit 1;

  if v_autre is not null then
    raise exception
      'Le numero WhatsApp % est deja celui de % dans cet etablissement.',
      new.phone, v_autre using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists teachers_whatsapp_unique on teachers;
create trigger teachers_whatsapp_unique
  before insert or update of phone on teachers
  for each row execute function private.refuser_whatsapp_deja_pris();

commit;


-- =====================================================================
-- L'UNICITÉ RÉSIDUELLE NE GÊNE PAS — VÉRIFIÉ, PAS SUPPOSÉ
-- =====================================================================
-- `teachers_profile_id_unique UNIQUE (profile_id)` a été soupçonnée de
-- bloquer le multi-école. Elle ne le fait pas : relevé en base,
-- `indnullsnotdistinct = false`, donc Postgres traite les NULL comme
-- distincts et accepte autant de fiches sans compte qu'on veut. Elle
-- garde son utilité : un compte ne peut être rattaché qu'à une fiche.
--
-- Aucune unicité ne pèse sur `teachers.email`, ni sur `schools.email` ou
-- `schools.phone` — seule la clé primaire existe sur `schools`.
--
-- Vérifié sous l'identité d'admins réels, RLS actif :
--
--   Enregistrer sans email ...................... OK, profile_id nul
--   Enregistrer sans WhatsApp ................... refusé, message lisible
--   Même numéro deux fois dans une école ........ refusé, nomme l'autre
--   La même personne dans DEUX écoles ........... 2 fiches, 2 écoles
--   Emploi du temps, notes, paie, vie scolaire
--     avec une fiche sans compte ................ aucune erreur
--   Comptes utilisateurs ........................ absente, sans erreur


-- =====================================================================
-- LES TAUX NE PASSENT PAS PAR LA ROUTE D'ENREGISTREMENT
-- =====================================================================
-- « enseignants.gerer » appartient à tout l'encadrement, directeur
-- général compris — précisément le rôle écarté des finances. Écrire
-- hourly_rate ou monthly_salary depuis cette route lui aurait ouvert les
-- rémunérations par la bande.
--
-- Les colonnes de rémunération restent fermées au rôle `authenticated`
-- (droits par colonne, section 5 de schema.sql) et ne s'écrivent que par
-- set_teacher_compensation(), qui revérifie can_see_money() en base. Le
-- formulaire ne propose les taux qu'aux rôles qui voient les finances,
-- et appelle cette fonction après l'enregistrement.
