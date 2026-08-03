"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/src/lib/supabase"

/*
 * La grille d'emploi du temps d'une classe.
 *
 * ---------------------------------------------------------------------
 * POURQUOI UN TABLEAU, ET NON UNE LISTE PAR JOUR
 *
 * Un emploi du temps se lit en DEUX dimensions : on cherche « mardi à
 * 10 h », pas « le troisième cours de mardi ». Une liste par jour oblige
 * à parcourir chaque colonne pour répondre à une question que le
 * tableau rend immédiate — et surtout elle cache les TROUS, alors que
 * c'est précisément ce qu'on regarde quand on compose une grille.
 *
 * Les lignes sont les plages horaires RÉELLEMENT posées, pas une échelle
 * de 8 h à 18 h : une école qui travaille de 7 h 30 à 12 h 30 n'a pas à
 * faire défiler des heures vides.
 * ---------------------------------------------------------------------
 *
 * La donnée existe déjà — `timetable_slots` porte les heures, la matière
 * et l'enseignant. Ce composant n'ajoute rien en base : il donne à voir
 * et à poser ce qui s'y trouve.
 */

type Matiere = { id: string; name: string }

type Enseignant = {
  id: string
  first_name: string
  last_name: string
}

type Creneau = {
  id: string
  class_id: string
  subject_id: string
  teacher_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  subjects: { name: string } | null
  teachers: { first_name: string; last_name: string } | null
}

const JOURS = [
  { valeur: 1, nom: "Lundi" },
  { valeur: 2, nom: "Mardi" },
  { valeur: 3, nom: "Mercredi" },
  { valeur: 4, nom: "Jeudi" },
  { valeur: 5, nom: "Vendredi" },
  { valeur: 6, nom: "Samedi" },
]

/** « 08:00:00 » venu de Postgres devient « 08:00 ». */
function heure(valeur: string) {
  return valeur.slice(0, 5)
}

function plage(creneau: Creneau) {
  return `${heure(creneau.start_time)}-${heure(creneau.end_time)}`
}

export function EmploiDuTemps({
  schoolId,
  classId,
  className,
  peutEcrire,
}: {
  schoolId: string
  classId: string
  className: string
  peutEcrire: boolean
}) {
  const [creneaux, setCreneaux] = useState<Creneau[]>([])
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [enseignants, setEnseignants] = useState<Enseignant[]>([])
  const [anneeId, setAnneeId] = useState<string | null>(null)

  const [jour, setJour] = useState("1")
  const [debut, setDebut] = useState("08:00")
  const [fin, setFin] = useState("09:00")
  const [subjectId, setSubjectId] = useState("")
  const [teacherId, setTeacherId] = useState("")

  const [chargement, setChargement] = useState(true)
  const [enregistrement, setEnregistrement] = useState(false)
  const [suppression, setSuppression] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)

    const [creneauxResultat, matieresResultat, enseignantsResultat, anneeResultat] =
      await Promise.all([
        supabase
          .from("timetable_slots")
          .select(
            `id, class_id, subject_id, teacher_id, day_of_week, start_time,
             end_time, subjects ( name ), teachers ( first_name, last_name )`
          )
          .eq("class_id", classId)
          .order("day_of_week")
          .order("start_time"),

        supabase
          .from("subjects")
          .select("id, name")
          .eq("school_id", schoolId)
          .order("name"),

        supabase
          .from("teachers")
          .select("id, first_name, last_name")
          .eq("school_id", schoolId)
          .order("last_name"),

        supabase
          .from("academic_years")
          .select("id")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .maybeSingle(),
      ])

    if (creneauxResultat.error) {
      console.error("Erreur emploi du temps :", creneauxResultat.error)
      setErreur("L'emploi du temps n'a pas pu être chargé.")
    } else {
      setErreur(null)
      setCreneaux((creneauxResultat.data as unknown as Creneau[]) ?? [])
    }

    setMatieres((matieresResultat.data as Matiere[]) ?? [])
    setEnseignants((enseignantsResultat.data as Enseignant[]) ?? [])
    setAnneeId(anneeResultat.data?.id ?? null)

    setChargement(false)
  }, [schoolId, classId])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  /*
   * Les lignes du tableau : les plages horaires réellement posées, dans
   * l'ordre. Deux créneaux de 8 h à 9 h, lundi et mercredi, partagent la
   * même ligne — c'est ce qui fait le tableau plutôt qu'une liste.
   */
  const plages = useMemo(() => {
    const vues = new Map<string, { debut: string; fin: string }>()

    for (const creneau of creneaux) {
      vues.set(plage(creneau), {
        debut: creneau.start_time,
        fin: creneau.end_time,
      })
    }

    return [...vues.entries()]
      .sort((a, b) => a[1].debut.localeCompare(b[1].debut))
      .map(([libelle, bornes]) => ({ libelle, ...bornes }))
  }, [creneaux])

  function creneauDe(libelle: string, jourValeur: number) {
    return creneaux.find(
      (creneau) =>
        creneau.day_of_week === jourValeur && plage(creneau) === libelle
    )
  }

  async function poserCreneau(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!subjectId) {
      setErreur("Choisissez la matière du créneau.")
      return
    }

    if (fin <= debut) {
      setErreur("L'heure de fin doit suivre l'heure de début.")
      return
    }

    /*
     * L'année scolaire active est obligatoire en base. Sans elle, mieux
     * vaut le dire ici que laisser Postgres renvoyer une violation de
     * clé étrangère que personne ne saura lire.
     */
    if (!anneeId) {
      setErreur(
        "Aucune année scolaire active. Ouvrez-en une dans Année scolaire."
      )
      return
    }

    setEnregistrement(true)
    setErreur(null)

    const { error } = await supabase.from("timetable_slots").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId || null,
      academic_year_id: anneeId,
      day_of_week: Number(jour),
      start_time: debut,
      end_time: fin,
    })

    setEnregistrement(false)

    if (error) {
      console.error("Erreur créneau :", error)
      setErreur(error.message)
      return
    }

    await charger()
  }

  async function retirerCreneau(creneau: Creneau) {
    setSuppression(creneau.id)

    const { error } = await supabase
      .from("timetable_slots")
      .delete()
      .eq("id", creneau.id)

    setSuppression(null)

    if (error) {
      console.error("Erreur suppression créneau :", error)
      setErreur(error.message)
      return
    }

    await charger()
  }

  return (
    <div className="rounded-xl border bg-background p-6">
      <h3 className="text-lg font-semibold">
        Emploi du temps — {className}
      </h3>

      {peutEcrire && (
        <form
          onSubmit={poserCreneau}
          className="mt-6 flex flex-wrap items-end gap-3 border-b pb-6"
        >
          <div className="space-y-1">
            <label htmlFor="edt-jour" className="text-xs">
              Jour
            </label>

            <select
              id="edt-jour"
              value={jour}
              onChange={(event) => setJour(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {JOURS.map((item) => (
                <option key={item.valeur} value={item.valeur}>
                  {item.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="edt-debut" className="text-xs">
              Début
            </label>

            <input
              id="edt-debut"
              type="time"
              value={debut}
              onChange={(event) => setDebut(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edt-fin" className="text-xs">
              Fin
            </label>

            <input
              id="edt-fin"
              type="time"
              value={fin}
              onChange={(event) => setFin(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edt-matiere" className="text-xs">
              Matière
            </label>

            <select
              id="edt-matiere"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Choisir...</option>

              {matieres.map((matiere) => (
                <option key={matiere.id} value={matiere.id}>
                  {matiere.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="edt-enseignant" className="text-xs">
              Enseignant
            </label>

            <select
              id="edt-enseignant"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Non affecté</option>

              {enseignants.map((enseignant) => (
                <option key={enseignant.id} value={enseignant.id}>
                  {enseignant.last_name} {enseignant.first_name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={enregistrement}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {enregistrement ? "Ajout..." : "Poser le créneau"}
          </button>
        </form>
      )}

      {erreur && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreur}
        </div>
      )}

      {chargement ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement...</p>
      ) : plages.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Aucun créneau posé pour cette classe.
        </p>
      ) : (
        /*
          Le tableau déborde plutôt que de comprimer ses colonnes : sur
          un téléphone, six jours lisibles qui défilent valent mieux que
          six colonnes illisibles.
        */
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b p-2 text-start font-medium">Heure</th>

                {JOURS.map((item) => (
                  <th
                    key={item.valeur}
                    className="border-b p-2 text-start font-medium"
                  >
                    {item.nom}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {plages.map((ligne) => (
                <tr key={ligne.libelle}>
                  <th className="whitespace-nowrap border-b p-2 text-start align-top font-normal text-muted-foreground">
                    {heure(ligne.debut)} – {heure(ligne.fin)}
                  </th>

                  {JOURS.map((item) => {
                    const creneau = creneauDe(ligne.libelle, item.valeur)

                    return (
                      <td
                        key={item.valeur}
                        className="border-b p-2 align-top"
                      >
                        {creneau ? (
                          <div className="rounded-md border bg-muted/30 p-2">
                            <p className="font-medium">
                              {creneau.subjects?.name ?? "Matière retirée"}
                            </p>

                            {/*
                              Le nom de l'enseignant est affiché à côté de
                              la matière : c'est ce qu'on cherche en
                              regardant une grille — qui assure ce cours.
                            */}
                            <p className="text-xs text-muted-foreground">
                              {creneau.teachers
                                ? `${creneau.teachers.last_name} ${creneau.teachers.first_name}`
                                : "Enseignant non affecté"}
                            </p>

                            {peutEcrire && (
                              <button
                                type="button"
                                onClick={() => retirerCreneau(creneau)}
                                disabled={suppression === creneau.id}
                                className="mt-1 text-xs text-destructive underline disabled:opacity-50"
                              >
                                {suppression === creneau.id
                                  ? "Retrait..."
                                  : "Retirer"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
