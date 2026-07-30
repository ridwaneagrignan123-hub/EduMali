-- =====================================================================
-- Ridwane — paie des enseignants, pilotée par les heures assurées
-- =====================================================================
-- APPLIQUÉ en base le 2026-07-30. Ce fichier porte le raisonnement ;
-- `schema.sql` porte l'état. Le rejouer sur la production échouerait.
--
-- ---------------------------------------------------------------------
-- CE QUE CELA RELIE
--
-- `timetable_slots` donne les heures prévues, `teacher_attendance` celles
-- qui n'ont pas été assurées, `school_holidays` retire les jours où
-- personne n'enseignait. La paie tombe au bout. Aucun concurrent ne fait
-- ce chemin complet.
-- ---------------------------------------------------------------------

begin;

alter table teachers
  add column if not exists contract_type text,
  add column if not exists hourly_rate numeric,
  add column if not exists monthly_salary numeric;

alter table teachers add constraint teachers_contract_type_check
  check (contract_type is null or contract_type in ('permanent','vacataire'));

alter table teachers add constraint teachers_rates_check
  check ((hourly_rate is null or hourly_rate >= 0)
     and (monthly_salary is null or monthly_salary >= 0));


-- =====================================================================
-- Les salaires ne se lisent pas depuis la table
-- =====================================================================
-- ---------------------------------------------------------------------
-- LE RLS NE SAIT PAS MASQUER UNE COLONNE
--
-- Il travaille par LIGNE. Or la policy de lecture de `teachers` est
-- ouverte à toute l'école — mesuré avant correction : un enseignant
-- lisait le taux horaire et le salaire de ses trois collègues.
--
-- ⚠️  Un `revoke select (colonne)` ne mord PAS sur un droit accordé au
--     niveau TABLE : Postgres ne soustrait pas une colonne d'un GRANT
--     global. La première tentative n'a rien changé, et le test l'a
--     montré. Il faut retirer le droit de table, puis le rendre colonne
--     par colonne en omettant celles qu'on ferme.
-- ---------------------------------------------------------------------
revoke select, insert, update on teachers from authenticated;
revoke select, insert, update on teachers from anon;

grant select (
  id, created_at, school_id, first_name, last_name, email, phone,
  specialty, hire_date, status, profile_id, contract_type
) on teachers to authenticated;

grant insert (
  id, created_at, school_id, first_name, last_name, email, phone,
  specialty, hire_date, status, profile_id, contract_type
) on teachers to authenticated;

grant update (
  first_name, last_name, email, phone, specialty, hire_date, status,
  profile_id, contract_type
) on teachers to authenticated;

-- Seule voie d'écriture de la rémunération, réservée à qui voit l'argent.
create or replace function public.set_teacher_compensation(
  p_teacher_id uuid, p_contract_type text,
  p_hourly_rate numeric, p_monthly_salary numeric
)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_ecole uuid;
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne permet pas de fixer une remuneration.';
  end if;

  select pr.school_id into v_ecole from profiles pr where pr.id = auth.uid();

  if p_contract_type is not null
     and p_contract_type not in ('permanent', 'vacataire') then
    raise exception 'Type de contrat invalide : % (permanent ou vacataire).', p_contract_type;
  end if;

  update teachers
  set contract_type = p_contract_type,
      hourly_rate = p_hourly_rate,
      monthly_salary = p_monthly_salary
  where id = p_teacher_id
    -- L'école de l'appelant est la frontière : SECURITY DEFINER contourne
    -- le RLS, ce filtre le remplace.
    and school_id = v_ecole;

  if not found then
    raise exception 'Enseignant introuvable dans votre etablissement.';
  end if;
end;
$$;

revoke execute on function public.set_teacher_compensation(uuid, text, numeric, numeric) from public;
grant execute on function public.set_teacher_compensation(uuid, text, numeric, numeric) to authenticated;


-- =====================================================================
-- Deux décisions métier, rendues explicites
-- =====================================================================
-- Une école paie les absences excusées, une autre non, et les deux ont
-- raison chez elles. Les coder en dur aurait imposé un choix invisible.
-- Défauts : absence excusée NON payée, pas de retenue sur retard.
alter table schools
  add column if not exists payroll_pay_excused_absence boolean not null default false,
  add column if not exists payroll_deduct_late boolean not null default false;


-- =====================================================================
-- Le calcul
-- =====================================================================
-- SECURITY DEFINER : croise teachers, timetable_slots, school_holidays et
-- teacher_attendance sans dépendre de ce que le RLS laisse voir. Le
-- contrôle d'accès est donc refait ICI, sur la permission financière.
--
-- Les trois pièges sont commentés dans le corps. Voir la version en base
-- pour le texte intégral, trop long pour être recopié ici sans risque de
-- divergence :
--
--   PIÈGE 1 — les vacances et jours fériés sortent du décompte. Sans
--     cette exclusion, les montants seraient systématiquement surévalués.
--   PIÈGE 2 — on déroule les jours RÉELS du mois. Multiplier par un
--     nombre de semaines forfaitaire se tromperait chaque mois.
--   PIÈGE 3 — un permanent est mensualisé. Lui appliquer le calcul
--     horaire le paierait à l'heure, ce qui n'est pas son contrat.
--
-- Un créneau ne compte que si le jour tombe dans les dates de son année
-- scolaire déclarée. La fonction rend aussi `creneaux`, pour que la page
-- puisse dire « aucun créneau ce mois-ci » plutôt qu'afficher 0 F sans
-- explication.
create or replace function public.payroll_month(p_year integer, p_month integer)
returns table (
  enseignant_id uuid, enseignant text, contrat text, statut text,
  taux_horaire numeric, salaire_mensuel numeric, creneaux integer,
  heures_planifiees numeric, heures_non_assurees numeric, heures_payees numeric,
  jours_absence integer, jours_absence_excusee integer,
  jours_retard integer, minutes_retard integer, montant numeric
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not private.can_see_money() then
    raise exception 'Acces refuse : votre role ne donne pas acces a la paie.';
  end if;
  -- corps complet en base
end;
$$;

revoke execute on function public.payroll_month(integer, integer) from public;
grant execute on function public.payroll_month(integer, integer) to authenticated;

commit;

-- =====================================================================
-- Mesuré après application
-- =====================================================================
-- Un vacataire à 2 000 F/h, un créneau de 2 h chaque mardi, novembre 2026 :
--
--   4 mardis, 8,00 h, 16 000 F ............... sans vacances
--   3 mardis, 6,00 h, 12 000 F ............... congé du 16 au 20 nov.
--                                              (le mardi 17 sort)
--   3 mardis, 4,00 h payées, 8 000 F ......... + absence le mardi 3
--   3 mardis, 2,00 h payées, 4 000 F ......... + excusée le 10, non payée
--   3 mardis, 4,00 h payées, 8 000 F ......... même cas, excusée PAYÉE
--
-- Un permanent à 150 000 F/mois avec les mêmes 8 h planifiées reçoit
-- 150 000 F, pas 16 000 F : le calcul horaire ne lui est pas appliqué.
--
-- Accès : un directeur général se voit refuser payroll_month(). Un
-- enseignant ne peut ni lire ni écrire hourly_rate et monthly_salary
-- (« permission denied for table teachers »), tandis que les colonnes
-- ordinaires restent lisibles — 3 lignes, 3 actifs.
