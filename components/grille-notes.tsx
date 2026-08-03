"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/src/lib/supabase"
import {
  FILIERES,
  FILIERE_LABELS,
  Filiere,
  hasFiliere,
  toSchoolType,
} from "@/src/lib/etablissement"
import {
  NOTE_MAX,
  moyenne as calculerMoyenne,
  rangs as calculerRangs,
  titreEvaluation,
  total as calculerTotal,
} from "@/src/lib/premier-cycle"

/*
 * La grille de notes du premier cycle — le cahier de l'enseignant.
 *
 * ---------------------------------------------------------------------
 * CE QUE CET ÉCRAN REMPLACE
 *
 * Au premier cycle, l'enseignant tient sa classe d'un seul tenant :
 * élèves en lignes, matières en colonnes, tout sur 10. Passer par
 * « choisir une évaluation, puis saisir matière par matière » lui
 * demandait de reconstruire mentalement ce tableau à chaque fois.
 * ---------------------------------------------------------------------
 *
 * SOUS LE CAPOT, RIEN DE NOUVEAU. La grille est un éditeur groupé
 * au-dessus de `assessments` + `grades` : chaque colonne est une
 * évaluation ordinaire du couple (classe, matière, période), sur 10, et
 * chaque cellule une note. C'est ce qui fait que le bulletin et la page
 * Moyennes — qui lisent déjà `grades` — restent d'accord avec elle.
 *
 * L'EN-TÊTE EST LA SOURCE UNIQUE DES MATIÈRES. Écrire un nom dans
 * l'en-tête rattache la matière à la classe (`class_subjects`), en la
 * créant au besoin. Il n'y a plus d'étape d'affectation séparée pour ces
 * classes — et c'est précisément ce qui corrige les bulletins vides :
 * grille, notes, moyenne et bulletin lisent le même endroit.
 */

type Eleve = {
  id: string
  first_name: string
  last_name: string
}

type Colonne = {
  /* Ligne de class_subjects : c'est elle qu'on retire pour ôter la colonne. */
  classSubjectId: string
  subjectId: string
  nom: string
  filiere: string | null
}

type Periode = {
  id: string
  name: string
  is_active: boolean
}

type Note = {
  id: string
  score: number
}

/** Clé d'une cellule : un élève, une matière. */
function cle(eleveId: string, subjectId: string) {
  return `${eleveId}:${subjectId}`
}

export function GrilleNotes({
  schoolId,
  classId,
  className,
  peutModifier,
}: {
  schoolId: string
  classId: string
  className: string
  /** Faux pour un simple lecteur : la grille s'affiche sans se saisir. */
  peutModifier: boolean
}) {
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [periodeId, setPeriodeId] = useState("")

  const [schoolType, setSchoolType] = useState("classique")
  const [maFiliere, setMaFiliere] = useState<string | null>(null)
  const [filiereActive, setFiliereActive] = useState<Filiere | null>(null)

  const [eleves, setEleves] = useState<Eleve[]>([])
  const [colonnes, setColonnes] = useState<Colonne[]>([])
  const [notes, setNotes] = useState<Record<string, Note>>({})

  /* Évaluation portant chaque colonne. Créée à la première note saisie. */
  const [evaluations, setEvaluations] = useState<Record<string, string>>({})

  const [celluleEnCours, setCelluleEnCours] = useState<string | null>(null)
  const [nouvelleMatiere, setNouvelleMatiere] = useState("")

  const avecFiliere = hasFiliere(schoolType)

  /*
   * Un directeur de direction ne voit que sa filière — c'est le
   * cloisonnement déjà en place, repris ici pour ne pas lui proposer un
   * onglet que le RLS lui refuserait de toute façon.
   */
  const filieresVisibles: Filiere[] = useMemo(() => {
    if (!avecFiliere) return []
    if (maFiliere) return FILIERES.filter((f) => f === maFiliere)
    return [...FILIERES]
  }, [avecFiliere, maFiliere])

  const chargerContexte = useCallback(async () => {
    const [ecoleResultat, profilResultat] = await Promise.all([
      supabase.from("schools").select("school_type").eq("id", schoolId).maybeSingle(),
      supabase
        .from("profiles")
        .select("filiere")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle(),
    ])

    const type = toSchoolType(ecoleResultat.data?.school_type)
    setSchoolType(type)
    setMaFiliere(profilResultat.data?.filiere ?? null)

    if (hasFiliere(type)) {
      setFiliereActive(
        (profilResultat.data?.filiere as Filiere | null) ?? "francais"
      )
    } else {
      setFiliereActive(null)
    }

    const { data: anneeData } = await supabase
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .maybeSingle()

    if (!anneeData?.id) {
      setErreur(
        "Aucune année scolaire active : définissez-en une avant de noter."
      )
      setChargement(false)
      return null
    }

    const { data: periodesData, error: periodesError } = await supabase
      .from("academic_periods")
      .select("id, name, is_active")
      .eq("school_id", schoolId)
      .eq("academic_year_id", anneeData.id)
      .order("start_date")

    if (periodesError) {
      console.error("Erreur périodes :", periodesError)
      setErreur("Les compositions n'ont pas pu être lues.")
      setChargement(false)
      return null
    }

    const liste = (periodesData as Periode[]) ?? []
    setPeriodes(liste)

    const choisie = liste.find((p) => p.is_active) ?? liste[0]
    setPeriodeId(choisie?.id ?? "")

    return anneeData.id
  }, [schoolId])

  const chargerGrille = useCallback(
    async (anneeId: string, periode: string, filiere: string | null) => {
      setChargement(true)
      setErreur(null)

      const [elevesResultat, matieresResultat] = await Promise.all([
        supabase
          .from("student_class_enrollments")
          .select("students ( id, first_name, last_name )")
          .eq("school_id", schoolId)
          .eq("class_id", classId)
          .eq("academic_year_id", anneeId),

        supabase
          .from("class_subjects")
          .select("id, subject_id, subjects ( name, filiere )")
          .eq("school_id", schoolId)
          .eq("class_id", classId),
      ])

      if (elevesResultat.error || matieresResultat.error) {
        console.error(
          "Erreur grille :",
          elevesResultat.error ?? matieresResultat.error
        )
        setErreur("La grille n'a pas pu être chargée.")
        setChargement(false)
        return
      }

      const listeEleves = (elevesResultat.data ?? [])
        .map((ligne) => (ligne as unknown as { students: Eleve }).students)
        .filter(Boolean)
        .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr"))

      setEleves(listeEleves)

      const listeColonnes: Colonne[] = (matieresResultat.data ?? [])
        .map((ligne) => {
          const row = ligne as unknown as {
            id: string
            subject_id: string
            subjects: { name: string; filiere: string | null } | null
          }

          return {
            classSubjectId: row.id,
            subjectId: row.subject_id,
            nom: row.subjects?.name ?? "—",
            filiere: row.subjects?.filiere ?? null,
          }
        })
        // Chaque programme a ses propres matières : on ne mélange pas.
        .filter((col) => filiere === null || col.filiere === filiere)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))

      setColonnes(listeColonnes)

      if (listeColonnes.length === 0 || !periode) {
        setNotes({})
        setEvaluations({})
        setChargement(false)
        return
      }

      const { data: evalData, error: evalError } = await supabase
        .from("assessments")
        .select("id, subject_id")
        .eq("school_id", schoolId)
        .eq("class_id", classId)
        .eq("academic_period_id", periode)
        .eq("assessment_type", "composition")
        .eq("max_score", NOTE_MAX)
        .in(
          "subject_id",
          listeColonnes.map((col) => col.subjectId)
        )

      if (evalError) {
        console.error("Erreur évaluations :", evalError)
        setErreur("Les compositions de cette classe n'ont pas pu être lues.")
        setChargement(false)
        return
      }

      const parMatiere: Record<string, string> = {}

      ;(evalData ?? []).forEach((ligne) => {
        const row = ligne as { id: string; subject_id: string }
        // Une seule évaluation par matière : la première rencontrée fait foi.
        if (!parMatiere[row.subject_id]) {
          parMatiere[row.subject_id] = row.id
        }
      })

      setEvaluations(parMatiere)

      const identifiants = Object.values(parMatiere)

      if (identifiants.length === 0) {
        setNotes({})
        setChargement(false)
        return
      }

      const { data: notesData, error: notesError } = await supabase
        .from("grades")
        .select("id, score, student_id, assessment_id")
        .eq("school_id", schoolId)
        .in("assessment_id", identifiants)

      if (notesError) {
        console.error("Erreur notes :", notesError)
        setErreur("Les notes n'ont pas pu être lues.")
        setChargement(false)
        return
      }

      const matiereDe = new Map(
        Object.entries(parMatiere).map(([sujet, evaluation]) => [
          evaluation,
          sujet,
        ])
      )

      const table: Record<string, Note> = {}

      ;(notesData ?? []).forEach((ligne) => {
        const row = ligne as {
          id: string
          score: number
          student_id: string
          assessment_id: string
        }

        const sujet = matiereDe.get(row.assessment_id)

        if (sujet) {
          table[cle(row.student_id, sujet)] = {
            id: row.id,
            score: Number(row.score),
          }
        }
      })

      setNotes(table)
      setChargement(false)
    },
    [schoolId, classId]
  )

  const [anneeId, setAnneeId] = useState("")

  useEffect(() => {
    let annule = false

    async function lancer() {
      const annee = await chargerContexte()

      if (annule || !annee) {
        return
      }

      setAnneeId(annee)
    }

    lancer()

    return () => {
      annule = true
    }
  }, [chargerContexte])

  useEffect(() => {
    if (!anneeId || !periodeId) {
      return
    }

    let annule = false

    async function lancer() {
      if (annule) return
      await chargerGrille(anneeId, periodeId, filiereActive)
    }

    lancer()

    return () => {
      annule = true
    }
  }, [anneeId, periodeId, filiereActive, chargerGrille])

  /* Assure l'existence de l'évaluation qui porte une colonne. */
  async function evaluationDe(subjectId: string): Promise<string | null> {
    const connue = evaluations[subjectId]

    if (connue) {
      return connue
    }

    const periode = periodes.find((p) => p.id === periodeId)

    const { data, error } = await supabase
      .from("assessments")
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
        academic_period_id: periodeId,
        title: titreEvaluation(periode?.name ?? "composition"),
        assessment_type: "composition",
        max_score: NOTE_MAX,
        coefficient: 1,
        assessment_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single()

    if (error || !data) {
      console.error("Erreur création de la composition :", error)
      setErreur(
        error?.message ?? "La composition de cette matière n'a pas pu être créée."
      )
      return null
    }

    setEvaluations((current) => ({ ...current, [subjectId]: data.id }))

    return data.id
  }

  async function enregistrerCellule(
    eleveId: string,
    subjectId: string,
    saisie: string
  ) {
    const identifiant = cle(eleveId, subjectId)
    setCelluleEnCours(identifiant)
    setErreur(null)
    setMessage(null)

    const texte = saisie.trim().replace(",", ".")
    const existante = notes[identifiant]

    // Vider une case, c'est retirer la note : elle repasse à 0 au calcul.
    if (!texte) {
      if (existante) {
        const { error } = await supabase
          .from("grades")
          .delete()
          .eq("id", existante.id)

        if (error) {
          console.error("Erreur suppression de la note :", error)
          setErreur(error.message)
          setCelluleEnCours(null)
          return
        }

        setNotes((current) => {
          const suivant = { ...current }
          delete suivant[identifiant]
          return suivant
        })
      }

      setCelluleEnCours(null)
      return
    }

    const valeur = Number(texte)

    if (!Number.isFinite(valeur) || valeur < 0 || valeur > NOTE_MAX) {
      setErreur(`La note doit être comprise entre 0 et ${NOTE_MAX}.`)
      setCelluleEnCours(null)
      return
    }

    const evaluation = await evaluationDe(subjectId)

    if (!evaluation) {
      setCelluleEnCours(null)
      return
    }

    const { data, error } = await supabase
      .from("grades")
      .upsert(
        {
          school_id: schoolId,
          assessment_id: evaluation,
          student_id: eleveId,
          score: valeur,
        },
        { onConflict: "assessment_id,student_id" }
      )
      .select("id")
      .single()

    if (error || !data) {
      console.error("Erreur enregistrement de la note :", error)
      setErreur(error?.message ?? "La note n'a pas pu être enregistrée.")
      setCelluleEnCours(null)
      return
    }

    setNotes((current) => ({
      ...current,
      [identifiant]: { id: data.id, score: valeur },
    }))

    setCelluleEnCours(null)
  }

  /*
   * Écrire un nom d'en-tête rattache la matière à la classe. On réutilise
   * une matière du même nom si elle existe déjà dans l'établissement :
   * en créer une seconde ferait deux colonnes homonymes sur le bulletin.
   */
  async function matiereParNom(nom: string): Promise<string | null> {
    const propre = nom.trim()

    if (!propre) {
      return null
    }

    const { data: existante, error: lectureError } = await supabase
      .from("subjects")
      .select("id, filiere")
      .eq("school_id", schoolId)
      .ilike("name", propre)
      .limit(1)
      .maybeSingle()

    if (lectureError) {
      console.error("Erreur lecture des matières :", lectureError)
      setErreur("Les matières n'ont pas pu être lues.")
      return null
    }

    if (existante) {
      if (
        avecFiliere &&
        filiereActive &&
        existante.filiere !== filiereActive
      ) {
        setErreur(
          `« ${propre} » existe déjà dans l'autre programme. Donnez-lui un nom distinct.`
        )
        return null
      }

      return existante.id
    }

    const { data, error } = await supabase
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: propre,
        // En école franco-arabe la filière est obligatoire : elle vient
        // de la grille qu'on est en train de remplir.
        filiere: avecFiliere ? filiereActive : null,
      })
      .select("id")
      .single()

    if (error || !data) {
      console.error("Erreur création de la matière :", error)
      setErreur(error?.message ?? "La matière n'a pas pu être créée.")
      return null
    }

    return data.id
  }

  async function ajouterColonne() {
    const nom = nouvelleMatiere.trim()

    if (!nom) {
      return
    }

    setErreur(null)
    setMessage(null)

    const subjectId = await matiereParNom(nom)

    if (!subjectId) {
      return
    }

    if (colonnes.some((col) => col.subjectId === subjectId)) {
      setErreur(`« ${nom} » est déjà une colonne de cette grille.`)
      return
    }

    const { error } = await supabase.from("class_subjects").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      coefficient: 1,
    })

    if (error) {
      console.error("Erreur ajout de colonne :", error)
      setErreur(error.message)
      return
    }

    setNouvelleMatiere("")
    await chargerGrille(anneeId, periodeId, filiereActive)
  }

  async function renommerColonne(colonne: Colonne, nom: string) {
    const propre = nom.trim()

    if (!propre || propre === colonne.nom) {
      return
    }

    const porteDesNotes = eleves.some(
      (eleve) => notes[cle(eleve.id, colonne.subjectId)]
    )

    if (porteDesNotes) {
      const confirme = window.confirm(
        `« ${colonne.nom} » porte déjà des notes. Les remplacer par « ${propre} » retire cette colonne de la grille — les notes saisies restent enregistrées mais ne compteront plus dans la moyenne. Continuer ?`
      )

      if (!confirme) {
        return
      }
    }

    setErreur(null)

    const subjectId = await matiereParNom(propre)

    if (!subjectId) {
      return
    }

    if (colonnes.some((col) => col.subjectId === subjectId)) {
      setErreur(`« ${propre} » est déjà une colonne de cette grille.`)
      return
    }

    const { error: ajoutError } = await supabase
      .from("class_subjects")
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
        coefficient: 1,
      })

    if (ajoutError) {
      console.error("Erreur renommage :", ajoutError)
      setErreur(ajoutError.message)
      return
    }

    const { error: retraitError } = await supabase
      .from("class_subjects")
      .delete()
      .eq("id", colonne.classSubjectId)

    if (retraitError) {
      console.error("Erreur retrait de l'ancienne colonne :", retraitError)
      setErreur(retraitError.message)
      return
    }

    await chargerGrille(anneeId, periodeId, filiereActive)
  }

  async function retirerColonne(colonne: Colonne) {
    const porteDesNotes = eleves.some(
      (eleve) => notes[cle(eleve.id, colonne.subjectId)]
    )

    const confirme = window.confirm(
      porteDesNotes
        ? `« ${colonne.nom} » porte des notes. La retirer de la grille ne les efface pas — elles restent enregistrées — mais elles cesseront de compter dans la moyenne et sur le bulletin. Continuer ?`
        : `Retirer « ${colonne.nom} » de la grille ?`
    )

    if (!confirme) {
      return
    }

    setErreur(null)

    const { error } = await supabase
      .from("class_subjects")
      .delete()
      .eq("id", colonne.classSubjectId)

    if (error) {
      console.error("Erreur retrait de colonne :", error)
      setErreur(error.message)
      return
    }

    setMessage(
      porteDesNotes
        ? `« ${colonne.nom} » a été retirée. Ses notes restent enregistrées.`
        : `« ${colonne.nom} » a été retirée.`
    )

    await chargerGrille(anneeId, periodeId, filiereActive)
  }

  /* Total, moyenne et rang — la règle vit dans src/lib/premier-cycle.ts. */
  const lignes = useMemo(() => {
    const calcul = eleves.map((eleve) => {
      const valeurs = colonnes.map(
        (col) => notes[cle(eleve.id, col.subjectId)]?.score ?? null
      )

      return {
        eleve,
        total: calculerTotal(valeurs),
        moyenne: calculerMoyenne(valeurs),
      }
    })

    const table = calculerRangs(calcul, (ligne) => ligne.moyenne)

    return calcul.map((ligne) => ({
      ...ligne,
      rang: table.get(ligne) ?? null,
    }))
  }, [eleves, colonnes, notes])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold">
            Grille de {className}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Chaque matière est notée sur {NOTE_MAX}.{" "}
            <strong>Une case laissée vide compte pour 0</strong> et fait
            baisser la moyenne. La moyenne est simple : aucun coefficient au
            premier cycle.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label htmlFor="grille-periode" className="block text-sm">
              Composition
            </label>

            <select
              id="grille-periode"
              value={periodeId}
              onChange={(event) => setPeriodeId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {periodes.length === 0 && (
                <option value="">Aucune période définie</option>
              )}

              {periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.name}
                  {periode.is_active ? " (en cours)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/*
            École franco-arabe : deux grilles, une par programme, sans
            matière commune. Un directeur n'en voit qu'une.
          */}
          {avecFiliere && filieresVisibles.length > 0 && (
            <div className="space-y-1">
              <span className="block text-sm">Programme</span>

              <div className="flex gap-2">
                {filieresVisibles.map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setFiliereActive(valeur)}
                    className={
                      filiereActive === valeur
                        ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        : "rounded-md border px-4 py-2 text-sm hover:bg-muted"
                    }
                  >
                    {FILIERE_LABELS[valeur]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {erreur}
        </div>
      )}

      {message && (
        <div className="rounded-lg border p-3 text-sm">{message}</div>
      )}

      {chargement ? (
        <p className="text-muted-foreground">Chargement de la grille...</p>
      ) : eleves.length === 0 ? (
        <p className="text-muted-foreground">
          Aucun élève inscrit dans cette classe pour l&apos;année en cours.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky start-0 z-10 bg-muted/40 px-3 py-2 text-start">
                  Élève
                </th>

                {colonnes.map((colonne) => (
                  <th key={colonne.subjectId} className="px-2 py-2">
                    {peutModifier ? (
                      <div className="flex items-center gap-1">
                        <input
                          defaultValue={colonne.nom}
                          onBlur={(event) =>
                            renommerColonne(colonne, event.target.value)
                          }
                          aria-label={`Matière ${colonne.nom}`}
                          className="w-28 rounded border bg-background px-2 py-1 text-center text-xs font-semibold"
                        />

                        <button
                          type="button"
                          onClick={() => retirerColonne(colonne)}
                          aria-label={`Retirer ${colonne.nom}`}
                          className="rounded px-1 text-muted-foreground hover:bg-muted"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold">
                        {colonne.nom}
                      </span>
                    )}
                  </th>
                ))}

                <th className="border-s px-3 py-2">Total</th>
                <th className="px-3 py-2">Moyenne</th>
                <th className="px-3 py-2">Rang</th>
              </tr>
            </thead>

            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.eleve.id} className="border-b last:border-0">
                  <td className="sticky start-0 z-10 bg-background px-3 py-2 font-medium">
                    {ligne.eleve.last_name} {ligne.eleve.first_name}
                  </td>

                  {colonnes.map((colonne) => {
                    const identifiant = cle(ligne.eleve.id, colonne.subjectId)

                    return (
                      <td key={colonne.subjectId} className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max={NOTE_MAX}
                          step="0.25"
                          defaultValue={notes[identifiant]?.score ?? ""}
                          disabled={!peutModifier || celluleEnCours === identifiant}
                          onBlur={(event) =>
                            enregistrerCellule(
                              ligne.eleve.id,
                              colonne.subjectId,
                              event.target.value
                            )
                          }
                          aria-label={`${colonne.nom} — ${ligne.eleve.last_name} ${ligne.eleve.first_name}`}
                          className="w-20 rounded border bg-background px-2 py-1 text-center tabular-nums disabled:opacity-60"
                        />
                      </td>
                    )
                  })}

                  <td className="border-s px-3 py-2 text-center tabular-nums">
                    {ligne.total.toLocaleString("fr-FR", {
                      maximumFractionDigits: 2,
                    })}
                  </td>

                  <td className="px-3 py-2 text-center font-semibold tabular-nums">
                    {ligne.moyenne === null
                      ? "—"
                      : ligne.moyenne.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                  </td>

                  <td className="px-3 py-2 text-center tabular-nums">
                    {ligne.rang ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutModifier && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4">
          <div className="space-y-1">
            <label htmlFor="grille-nouvelle-matiere" className="block text-sm">
              Ajouter une matière
            </label>

            <input
              id="grille-nouvelle-matiere"
              value={nouvelleMatiere}
              onChange={(event) => setNouvelleMatiere(event.target.value)}
              placeholder="Ex : Lecture"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={ajouterColonne}
            disabled={!nouvelleMatiere.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Ajouter la colonne
          </button>

          <p className="text-xs text-muted-foreground">
            La matière est rattachée à la classe : elle apparaîtra sur le
            bulletin. Il n&apos;y a pas d&apos;autre étape.
          </p>
        </div>
      )}
    </div>
  )
}
