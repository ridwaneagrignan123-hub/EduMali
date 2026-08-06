-- =====================================================================
-- Ridwane — l'accès des parents
-- =====================================================================
-- APPLIQUÉ en base le 2026-08-06. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état.

-- ---------------------------------------------------------------------
-- PAS DE COMPTE PARENT, ET C'EST UNE DÉCISION
--
-- Un compte suppose qu'on puisse le livrer. Or ni le courriel ni le SMS
-- ne partent réellement de cette application : aucune invitation
-- n'arriverait. Un compte suppose aussi un mot de passe à retenir, sur
-- un téléphone souvent partagé entre plusieurs familles.
--
-- On remet donc un CODE, sur papier, comme on remet un bulletin. Le
-- parent le tape une fois ; le navigateur s'en souvient ensuite. C'est
-- la même règle que `/annales` : pas de compte là où il n'en faut pas,
-- et rien de collecté sur des familles qui n'ont rien demandé.
--
-- ---------------------------------------------------------------------
-- LE CODE EST STOCKÉ EN CLAIR, ET VOICI POURQUOI
--
-- Un mot de passe se hache. Ce code, non — délibérément.
--
-- Le hacher obligerait, dès qu'un parent perd son papier, à en engendrer
-- un nouveau, ce qui invaliderait celui que l'autre parent détient peut-
-- être déjà. Le secrétariat doit pouvoir relire le code et le redonner.
--
-- Le calcul de risque est explicite : ce code n'ouvre QUE la lecture du
-- dossier d'un seul élève, dossier que le personnel de l'école voit déjà
-- en entier. Une fuite de la base exposerait ces données directement,
-- codes ou pas. Le hachage protégerait donc contre presque rien, au prix
-- d'une friction quotidienne réelle.
--
-- Ce raisonnement CESSE D'ÊTRE VALABLE si ce code donne un jour le
-- moindre droit d'écriture. Il faudra alors le hacher, et accepter la
-- friction.
--
-- ---------------------------------------------------------------------
-- LE CODE EST ENGENDRÉ EN BASE, JAMAIS CHOISI
--
-- Comme le numéro de reçu et la référence d'attestation. Un code choisi
-- par l'écran serait un code devinable le jour où quelqu'un décide
-- d'utiliser la date de naissance de l'élève.
--
-- L'alphabet exclut les caractères qui se confondent — ni O ni 0, ni I
-- ni 1 ni L. Un parent qui recopie un code depuis un papier au crayon
-- ne doit pas échouer sur une ambiguïté de typographie.
--
-- ---------------------------------------------------------------------
-- AUCUNE POLICY POUR `anon`
--
-- Le parent n'est pas un rôle de la base : il n'a pas de session
-- Supabase. La lecture passe par une route serveur sous clé service
-- role, qui valide le code puis rend une projection ARRÊTÉE.
--
-- C'est le point le plus important de ce fichier. Ouvrir une policy à
-- `anon` sur `grades` ou `fee_payments`, même conditionnée, exposerait
-- ces tables à l'API publique et il faudrait alors que la condition soit
-- parfaite pour toujours. Une route rend ce qu'elle décide de rendre, et
-- rien d'autre.

begin;

create table if not exists public.student_access_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  school_id uuid not null references public.schools(id) on delete cascade,

  /*
   * ON DELETE CASCADE, contrairement aux attestations : un code ne
   * certifie rien, il ouvre une porte. L'élève parti, la porte doit
   * disparaître avec lui.
   */
  student_id uuid not null references public.students(id) on delete cascade,

  code text not null,

  created_by uuid references public.profiles(id) on delete set null,

  /* Retirer l'accès sans effacer la trace qu'il a existé. */
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,

  /*
   * La dernière ouverture. Elle répond à la seule question que le
   * secrétariat se posera : « est-ce que ce parent s'en sert ? » — donc
   * faut-il lui réexpliquer, ou est-ce inutile de réimprimer.
   */
  last_used_at timestamptz,

  constraint student_access_codes_code_unique UNIQUE (code),

  constraint student_access_codes_revocation_coherente CHECK (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

/*
 * UN SEUL CODE ACTIF PAR ÉLÈVE.
 *
 * Sans cet index, réengendrer un code laisserait l'ancien valide : le
 * papier repris à la famille continuerait d'ouvrir le dossier. La
 * contrainte est partielle — les codes révoqués s'accumulent, et c'est
 * voulu : ils portent l'historique.
 */
create unique index if not exists student_access_codes_un_seul_actif
  on public.student_access_codes (student_id)
  where revoked_at is null;

create index if not exists student_access_codes_lookup
  on public.student_access_codes (code) where revoked_at is null;


-- =====================================================================
-- LE CODE EST ENGENDRÉ PAR LA BASE
-- =====================================================================

create or replace function private.engendrer_code_parent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Ni O/0, ni I/1/L : un code se recopie à la main, depuis un papier.
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  tentative text;
  essais int := 0;
begin
  loop
    tentative := '';

    for i in 1..8 loop
      tentative := tentative ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from student_access_codes c where c.code = tentative
    );

    essais := essais + 1;

    /*
     * 31^8 ≈ 850 milliards de combinaisons : la collision est
     * théorique. La borne existe pour qu'une erreur de programmation
     * future échoue bruyamment au lieu de boucler sans fin.
     */
    if essais > 20 then
      raise exception 'Impossible d''engendrer un code unique.';
    end if;
  end loop;

  new.code := tentative;

  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  -- Un code ne naît jamais révoqué.
  new.revoked_at := null;
  new.revoked_by := null;
  new.last_used_at := null;

  return new;
end $$;

drop trigger if exists student_access_codes_engendrer on public.student_access_codes;

create trigger student_access_codes_engendrer
  before insert on public.student_access_codes
  for each row execute function private.engendrer_code_parent();


/*
 * APRÈS CRÉATION, SEULE LA RÉVOCATION EST PERMISE.
 *
 * Le code et l'élève sont gravés. Sans cela, on pourrait rattacher un
 * code déjà remis à une famille au dossier d'un autre élève — et la
 * famille lirait le dossier de quelqu'un d'autre sans rien remarquer.
 */
create or replace function private.figer_code_parent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.code is distinct from old.code
     or new.student_id is distinct from old.student_id
     or new.school_id is distinct from old.school_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Un code d''acces ne se modifie pas. Revoquez-le et engendrez-en un autre.';
  end if;

  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Une revocation ne peut pas etre levee.';
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();

    if auth.uid() is not null then
      new.revoked_by := auth.uid();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists student_access_codes_figer on public.student_access_codes;

create trigger student_access_codes_figer
  before update on public.student_access_codes
  for each row execute function private.figer_code_parent();


-- =====================================================================
-- CLOISONNEMENT
-- =====================================================================

alter table public.student_access_codes enable row level security;

/*
 * LECTURE : l'encadrement de l'école. Le secrétariat doit pouvoir relire
 * un code pour le redonner à un parent qui a perdu son papier — c'est
 * précisément l'usage qui a justifié de ne pas le hacher.
 */
drop policy if exists "Codes parents lus par l'encadrement" on public.student_access_codes;

create policy "Codes parents lus par l'encadrement"
  on public.student_access_codes for select to authenticated
  using (
    private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

/*
 * ÉMISSION ET RÉVOCATION : l'encadrement QUI ÉCRIT — donc sans le
 * promoteur, conformément au modèle de rôles. Ouvrir l'accès au dossier
 * d'un élève est un acte de direction.
 */
drop policy if exists "Codes parents emis par l'encadrement" on public.student_access_codes;

create policy "Codes parents emis par l'encadrement"
  on public.student_access_codes for insert to authenticated
  with check (
    private.encadrement_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

drop policy if exists "Codes parents revoques par l'encadrement" on public.student_access_codes;

create policy "Codes parents revoques par l'encadrement"
  on public.student_access_codes for update to authenticated
  using (
    private.encadrement_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );

/*
 * Aucune policy DELETE, et surtout AUCUNE POLICY POUR `anon`. Le parent
 * ne lit pas cette table : c'est la route serveur qui la consulte, sous
 * clé service role, et qui décide ensuite quoi rendre.
 */

commit;


-- =====================================================================
-- VÉRIFIÉ, PAS SUPPOSÉ (2026-08-06)
-- =====================================================================
--
--   LA TABLE, sous de vraies réclamations JWT (directeur général et
--   promoteur d'EPP-Worgou), sur un élève de test effacé ensuite :
--
--     code engendré par la base ................. ZMWDP77N, 8 caractères
--                                                 de l'alphabet prévu ;
--                                                 le code envoyé par le
--                                                 client est ignoré
--     second code actif pour le même élève ...... refusé
--     réécrire le code .......................... refusé
--     rattacher le code à un autre élève ........ refusé
--     lever une révocation ...................... refusé
--     nouveau code après révocation ............. 1 ligne
--     le PROMOTEUR émet un code ................. refusé
--     suppression de l'élève .................... code emporté en cascade
--
--   LE PARCOURS DU PARENT, par la route, bout en bout :
--
--     code inconnu .............................. 401
--     code mal formé ............................ 401, MÊME message
--     sans session .............................. 401
--     vrai code, saisi « 7muku-9dv » ............ dossier rendu
--                                                 (normalisation de la
--                                                 casse et du tiret)
--     cookie httpOnly ........................... oui
--     réouverture par le cookie seul ............ dossier rendu
--
--   LA PROPRIÉTÉ QUI COMPTE LE PLUS :
--
--     retrait du code, puis MÊME cookie ......... 401
--     retrait du code, puis même code ........... 401
--
--   Un accès retiré ferme la porte IMMÉDIATEMENT, y compris à un parent
--   déjà connecté. C'est la conséquence directe d'avoir revérifié la
--   révocation à chaque lecture au lieu de la mémoriser dans le cookie :
--   un cookie qui porterait le droit survivrait au retrait, et le
--   secrétariat croirait avoir fermé une porte restée ouverte.
--
--   Dossier réellement rendu (élève de démonstration) : moyenne générale
--   16,28 sur 20 à partir de 6 notes pondérées par coefficient, trois
--   matières, et 190 000 F restant sur 250 000 F. Aucune ligne annulée
--   n'y figure.
--
-- NON MESURÉ : l'affichage sur un vrai téléphone. Le rendu a été vérifié
-- à 375 px de large — aucun débordement horizontal — mais le volet du
-- navigateur n'a pas pu produire de capture d'écran.
