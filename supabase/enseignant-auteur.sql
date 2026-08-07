-- =====================================================================
-- LA SALLE D'ATTENTE DES ENSEIGNANTS ÉTAIT COMMUNE À TOUTE L'ÉCOLE
-- =====================================================================
--
-- Signalé du terrain : les sept enseignants enregistrés par Amidou
-- Sanogo, directeur de la direction ARABE, apparaissaient chez Mahmoud
-- Diarra, directeur de la direction FRANÇAISE.
--
-- Mesuré avant correction, sous le JWT de Mahmoud : 6 enseignants
-- visibles, 0 classe. Six des sept — le septième était déjà titulaire
-- d'une classe d'Amidou, donc rattaché, donc exclu.
--
-- LA CAUSE
--
-- private.enseignant_de_ma_direction() accordait la lecture dans trois
-- cas : l'enseignant tient une matière dans mes classes, il en est
-- titulaire, OU il n'est affecté nulle part. Cette troisième clause est
-- nécessaire — sans elle, un directeur ne verrait pas la fiche qu'il
-- vient de saisir, exactement le défaut corrigé pour les élèves. Mais
-- elle était ANONYME : « affecté nulle part » ne dit pas à qui.
--
-- CE QUI MANQUAIT : L'AUTEUR
--
-- La table ne gardait aucune trace de qui avait créé une fiche. On
-- l'ajoute, imposée par déclencheur depuis auth.uid() — comme
-- recorded_by dans sms_logs, comme created_by dans les codes parents.
--
-- Et l'on en profite pour poser le déclencheur de JOURNAL, qui manquait
-- lui aussi : private.record_activity() savait déjà nommer
-- « enseignant », personne ne l'avait branché sur la table. C'est
-- d'ailleurs pourquoi la reprise ci-dessous s'appuie sur les horaires de
-- connexion et non sur le journal — il n'y avait rien dedans.
--
-- LA REPRISE DES SEPT FICHES EXISTANTES
--
-- Elle n'est pas une supposition. Le compte de Mahmoud Diarra a été créé
-- le 7 août à 14:02 et sa PREMIÈRE CONNEXION est à 17:32 ; les sept
-- fiches datent de 14:07 à 14:11. Il ne pouvait pas les saisir. Amidou
-- était le seul directeur connecté, et les sept portent la spécialité
-- « Arabe ».
--
-- CE QUE LE DIRECTEUR GÉNÉRAL GARDE
--
-- Un enseignant enregistré par la direction générale — donc par
-- quelqu'un SANS direction — reste visible de tous les directeurs tant
-- qu'il n'est affecté nulle part. C'est le recrutement central, et le
-- cloisonner priverait chaque directeur d'un enseignant qu'on lui
-- destine peut-être.
--
-- LES DROITS
--
-- `created_by` n'est accordé à `authenticated` sur AUCUN privilège : les
-- droits de cette table sont posés colonne par colonne, et la nouvelle
-- n'y figure pas. Le client ne peut donc ni la lire ni la poser — le
-- déclencheur et la fonction de périmètre, tous deux SECURITY DEFINER,
-- sont seuls à y toucher. Plus fort qu'un déclencheur seul.
-- =====================================================================

alter table public.teachers
  add column if not exists created_by uuid references public.profiles(id)
    on delete set null;

create or replace function private.imposer_auteur_enseignant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * `is not null` plutôt qu'une affectation sèche : une reprise de
   * données passée par la clé de service n'a pas d'auth.uid(), et
   * écraser avec NULL effacerait l'auteur au premier import.
   */
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists teachers_auteur on public.teachers;

create trigger teachers_auteur
  before insert on public.teachers
  for each row
  execute function private.imposer_auteur_enseignant();

-- Le journal, que la fonction savait déjà écrire pour « enseignant ».
drop trigger if exists log_teachers on public.teachers;

create trigger log_teachers
  after insert or delete or update on public.teachers
  for each row
  execute function private.record_activity();

/*
 * La salle d'attente devient NOMINATIVE.
 *
 * Un enseignant qui n'est affecté nulle part n'est visible que du
 * directeur qui l'a saisi — ou de tous, si c'est la direction générale
 * qui l'a enregistré. Dès qu'il tient une matière ou une classe, ce sont
 * ses affectations qui décident, comme avant.
 */
create or replace function private.enseignant_de_ma_direction(target_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not private.is_direction_scoped() then true
    else exists (
           select 1 from class_subjects cs
           join classes c on c.id = cs.class_id
           where cs.teacher_id = target_teacher_id
             and c.direction_id = private.current_direction_id())
      or exists (
           select 1 from class_head_teachers h
           join classes c on c.id = h.class_id
           where h.teacher_id = target_teacher_id
             and c.direction_id = private.current_direction_id())
      or (
           not exists (
             select 1 from class_subjects cs
             where cs.teacher_id = target_teacher_id)
           and not exists (
             select 1 from class_head_teachers h
             where h.teacher_id = target_teacher_id)
           /*
            * NULL — auteur inconnu, ou auteur sans direction — retombe
            * sur ma propre direction, donc reste visible. C'est le cas
            * du recrutement central, et celui des fiches antérieures à
            * cette colonne.
            */
           and coalesce(
                 (select p.direction_id
                    from teachers t
                    join profiles p on p.id = t.created_by
                   where t.id = target_teacher_id),
                 private.current_direction_id())
               is not distinct from private.current_direction_id()
         )
  end;
$$;
