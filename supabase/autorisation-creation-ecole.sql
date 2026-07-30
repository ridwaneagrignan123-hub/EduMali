-- =====================================================================
-- Ridwane — autorisation de créer un établissement
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.
--
-- ---------------------------------------------------------------------
-- LE DÉFAUT CORRIGÉ
--
-- Le contrôle qui rejetait un compte Google inconnu vivait dans
-- app/auth/callback/page.tsx — un fichier client. Or l'URL Supabase et
-- la clé anon sont publiques : on lance l'authentification Google depuis
-- son propre script, sans jamais charger cette page. Le signOut() de
-- rejet ne s'exécutait alors jamais.
--
-- Le porteur du jeton arrivait ensuite sur /api/setup-school, qui ne
-- vérifiait que trois choses : jeton valide, nom fourni, school_id vide.
-- Toutes réunies. Il créait son établissement et en devenait
-- administrateur. Le RLS l'enfermait chez lui — donc pas de fuite de
-- données — mais c'était la création illimitée d'écoles alors que
-- l'inscription publique est volontairement reportée.
-- ---------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------
-- POURQUOI UNE TABLE PLUTÔT QU'UN DRAPEAU DE CONFIGURATION
--
-- Un drapeau qu'on active le temps d'intégrer une école, puis qu'on
-- oublie de refermer, rouvre le trou en silence — et rien ne le
-- signale. Une autorisation nominative, elle :
--
--   - se consomme : elle ne vaut qu'une fois ;
--   - laisse une trace : qui l'a accordée, à qui, quand, et à quel
--     compte elle a servi ;
--   - ne demande aucun redéploiement pour intégrer une école.
--
-- Une séquence de vérification d'invitation en attente ne convenait pas
-- ici : une invitation d'enseignant rattache DÉJÀ le profil à une école,
-- si bien que setup-school ne s'exécute jamais dans ce cas. Le seul cas
-- qui reste est l'ouverture d'une école neuve, qui n'a pas d'invitation
-- préalable par construction.
-- ---------------------------------------------------------------------
create table if not exists school_creation_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  note text,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null
);

-- Une seule autorisation EN ATTENTE par adresse. Les consommées restent :
-- elles sont l'historique.
create unique index if not exists school_creation_grants_email_en_attente
  on school_creation_grants (lower(email)) where used_at is null;

alter table school_creation_grants enable row level security;

-- ⚠️  AUCUNE POLICY, DÉLIBÉRÉMENT.
-- Avec le RLS actif et zéro policy, le rôle `authenticated` n'a ni
-- lecture ni écriture, depuis aucun client. Seule la clé service role —
-- donc la seule route serveur concernée — y accède. C'est ce qui fait de
-- cette table une voie de confiance et non une donnée applicative de
-- plus. Y ajouter une policy de lecture « pour l'affichage » suffirait à
-- révéler qui est attendu.

commit;


-- =====================================================================
-- Accorder une autorisation
-- =====================================================================
-- À exécuter depuis l'éditeur SQL de Supabase, par le titulaire du
-- projet. Il n'y a pas d'écran pour cela, à dessein : la rareté du geste
-- ne justifie pas une page, et une page serait une surface de plus.
--
--   insert into school_creation_grants (email, note)
--   values ('direction@nouvelle-ecole.ml', 'Ouverture Sikasso, juillet');
--
-- Pour voir où en sont les autorisations :
--
--   select email, created_at, used_at, note
--   from school_creation_grants order by created_at desc;


-- =====================================================================
-- Les résidus d'authentification : choix ASSUMÉ
-- =====================================================================
-- Un compte Google inconnu qui s'authentifie laisse derrière lui un
-- utilisateur d'authentification et un profil vide, même après le
-- signOut() de la page de rejet — et a fortiori s'il ne charge jamais
-- cette page.
--
-- CE RÉSIDU EST ACCEPTÉ, pour trois raisons :
--
--   1. Il ne donne rien. Sans school_id, le RLS ne rend aucune ligne sur
--      aucune table, et setup-school refuse désormais. C'est une ligne
--      inerte, pas un accès dormant.
--
--   2. Le refuser en amont est impossible : l'authentification Google
--      aboutit chez Supabase avant que le moindre de nos codes ne
--      s'exécute. Nous ne sommes pas dans la boucle.
--
--   3. Un nettoyage automatique demanderait une route capable de
--      supprimer des utilisateurs d'authentification, appelable par
--      quiconque vient de s'authentifier. Ce serait échanger une ligne
--      inerte contre une surface d'attaque réelle.
--
-- Purge manuelle, si la table venait à se charger :
--
--   select u.id, u.email, u.created_at
--   from auth.users u
--   join profiles p on p.id = u.id
--   where p.school_id is null
--     and u.created_at < now() - interval '30 days';
--
-- Ce critère est sûr, et c'est vérifié plutôt que supposé : les routes
-- d'invitation rattachent l'école AU MOMENT de l'invitation, pas à la
-- première connexion. Relevé en base le 2026-07-30 — les deux comptes
-- invités qui ne s'étaient jamais connectés avaient déjà leur école.
-- Un profil sans école est donc, par construction, un compte que
-- personne n'a invité.
