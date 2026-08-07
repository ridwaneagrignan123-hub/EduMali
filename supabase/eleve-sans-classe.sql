-- =====================================================================
-- LE DIRECTEUR DE DIRECTION NE POUVAIT INSCRIRE AUCUN ÉLÈVE
-- =====================================================================
--
-- Troisième mur du même parcours, trouvé en rejouant le démarrage d'une
-- école neuve sous les vrais JWT. Le même défaut que pour les classes,
-- pris par l'autre bout : cette fois l'écriture PASSE, et c'est la
-- relecture qui est refusée.
--
-- LA MÉCANIQUE
--
-- app/students/page.tsx enregistre en deux temps — l'élève, puis son
-- inscription en classe :
--
--     .from("students").insert({...}).select().single()
--     .from("student_class_enrollments").insert({...})
--
-- Or `.select()` après un insert, c'est INSERT ... RETURNING, et
-- RETURNING exige EN PLUS la policy de LECTURE. Celle-ci accorde à un
-- directeur cloisonné les élèves de sa direction :
--
--     private.is_direction_scoped() AND private.student_in_my_direction(id)
--
-- et `student_in_my_direction` regarde les INSCRIPTIONS. À la
-- milliseconde où l'élève vient de naître, il n'est inscrit nulle part :
-- il n'est donc dans aucune direction, pas même celle de qui vient de le
-- créer. Le RETURNING échoue, l'instruction entière est annulée, et
-- l'écran annonce « Impossible de créer l'élève ».
--
-- Vérifié : l'annulation est atomique, aucune ligne fantôme n'est
-- laissée derrière. Le défaut empêche, il ne corrompt pas.
--
-- LE RAISONNEMENT
--
-- Un élève qui n'est encore dans aucune classe n'appartient à aucune
-- direction — il appartient à l'ÉCOLE. C'est la salle d'attente, et tout
-- directeur de l'établissement doit pouvoir l'y voir et l'y corriger,
-- puisque c'est lui qui va l'en sortir en le plaçant dans une classe.
--
-- On étend donc la lecture ET la modification, pour la même raison : si
-- l'inscription en classe échoue au second temps, l'élève existe sans
-- classe. Sans cette règle il deviendrait invisible et inéditable par
-- celui-là même qui vient de le saisir — un enregistrement fantôme que
-- personne ne peut plus rattraper.
--
-- La SUPPRESSION n'est pas étendue : elle reste au directeur général.
-- Un élève mal saisi se corrige et se place ; l'effacer est un autre
-- geste, et il n'a pas à devenir plus facile ici.
-- =====================================================================

create or replace function private.eleve_sans_classe(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from student_class_enrollments e
    where e.student_id = target_student_id
  );
$$;

/*
 * On réécrit les deux policies en entier plutôt que d'en ajouter une
 * troisième : deux policies permissives se cumulent par OU, et la règle
 * réelle deviendrait la somme de deux textes qu'il faudrait lire
 * ensemble pour la connaître. Une policy, une phrase.
 */
drop policy if exists "Eleves visibles selon le role" on public.students;

create policy "Eleves visibles selon le role"
  on public.students for select to authenticated
  using (
    school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and (
      private.is_direction_generale()
      or private.can_see_money()
      or (
        private.is_direction_scoped()
        and (
          private.student_in_my_direction(id)
          or private.eleve_sans_classe(id)
        )
      )
      or private.teaches_student(id)
    )
  );

drop policy if exists "Encadrement modifie les eleves" on public.students;

create policy "Encadrement modifie les eleves"
  on public.students for update to authenticated
  using (
    private.is_direction_scoped()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and (
      private.student_in_my_direction(id)
      or private.eleve_sans_classe(id)
    )
  )
  with check (
    private.is_direction_scoped()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
  );
