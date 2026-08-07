-- =====================================================================
-- LE CODE PARENT ÉCHAPPAIT AU CLOISONNEMENT DES DIRECTIONS
-- =====================================================================
--
-- Trouvé en préparant l'écran des familles, et mesuré avant d'être cru :
--
--   Amidou Sanogo, directeur de la direction ARABE
--     élève de la direction française .......... 0 ligne, invisible
--     code d'accès de ce même élève ............ LU EN CLAIR
--
-- Les policies de `students` cloisonnent par direction. Celles de
-- `student_access_codes` ne le faisaient pas : elles s'arrêtaient à
-- `private.is_encadrement()` et à l'école. Un directeur pouvait donc
-- lire le code d'un enfant dont le dossier lui est fermé.
--
-- CE QUE ÇA OUVRAIT VRAIMENT
--
-- Le code n'est pas haché — c'est un choix assumé, il doit pouvoir être
-- redonné au parent qui a perdu son papier. Mais il ouvre `/parent`, qui
-- montre notes, absences, discipline et situation de scolarité. Lire le
-- code, c'est donc pouvoir ouvrir le dossier complet d'un élève par une
-- porte que le cloisonnement ferme par ailleurs.
--
-- Ce n'était pas exploitable par accident : il fallait lire la table par
-- l'API. L'écran des familles, lui, l'aurait affiché. On ferme avant.
--
-- LA CORRECTION
--
-- Exactement le prédicat de `students`, appliqué au même élève : sa
-- direction, ou la salle d'attente de ceux qui ne sont encore inscrits
-- nulle part. L'écriture suit la lecture — on n'ouvre ni ne retire un
-- accès pour un enfant qu'on ne suit pas.
-- =====================================================================

drop policy if exists "Codes parents lus par l'encadrement"
  on public.student_access_codes;

create policy "Codes parents lus par l'encadrement"
  on public.student_access_codes for select to authenticated
  using (
    private.is_encadrement()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and (
      not private.is_direction_scoped()
      or private.student_in_my_direction(student_id)
      or private.eleve_sans_classe(student_id)
    )
  );

drop policy if exists "Codes parents emis par l'encadrement"
  on public.student_access_codes;

create policy "Codes parents emis par l'encadrement"
  on public.student_access_codes for insert to authenticated
  with check (
    private.encadrement_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and (
      not private.is_direction_scoped()
      or private.student_in_my_direction(student_id)
      or private.eleve_sans_classe(student_id)
    )
  );

drop policy if exists "Codes parents revoques par l'encadrement"
  on public.student_access_codes;

create policy "Codes parents revoques par l'encadrement"
  on public.student_access_codes for update to authenticated
  using (
    private.encadrement_ecrit()
    and school_id in (select p.school_id from profiles p where p.id = auth.uid())
    and (
      not private.is_direction_scoped()
      or private.student_in_my_direction(student_id)
      or private.eleve_sans_classe(student_id)
    )
  );
