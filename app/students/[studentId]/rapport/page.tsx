"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { rangs } from "@/src/lib/premier-cycle"
import {
  FaitDate,
  MOIS_NOMS,
  SOURCE_HEURE,
  bornesDuMois,
  dateCourte,
  dateDeLHorodatage,
  heureDe,
  jourDeLaSemaine,
  libelleMois,
  parOrdreChronologique,
  plageHoraire,
} from "@/src/lib/rapport"

/*
 * Rapport mensuel d'un élève — un dossier à poser sur la table.
 *
 * ---------------------------------------------------------------------
 * À QUOI SERT CE DOCUMENT
 *
 * Une convocation de parent se joue sur des faits. Sans document, elle
 * devient une discussion d'impressions : « il est souvent absent »
 * contre « il ne manque jamais ». Ce rapport rassemble ce que les tables
 * savent déjà — chaque fait avec son jour, sa date et son heure — pour
 * que la conversation porte sur des dates, pas sur des ressentis.
 *
 * RIEN N'EST CALCULÉ NI INVENTÉ ICI, à une exception près, dite en
 * toutes lettres à l'écran : la moyenne du mois, qui n'existe nulle part
 * en base et n'est PAS celle du bulletin. Voir plus bas.
 * ---------------------------------------------------------------------
 *
 * LE CLOISONNEMENT N'EST PAS RÉÉCRIT ICI. Toutes les lectures passent
 * par le RLS : un enseignant ne voit que ses élèves, un directeur que sa
 * direction. Refaire ce filtre côté écran donnerait l'illusion que c'est
 * là qu'il se joue — et masquerait un trou le jour où il y en aurait un.
 */

type Eleve = {
  id: string
  first_name: string
  last_name: string
  student_number: string | null
  parent_name: string | null
  parent_phone: string | null
}

const LIBELLE_STATUT: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Absence excusée",
}

const LIBELLE_ENVOI: Record<string, string> = {
  en_attente: "En attente",
  sent: "Envoyé",
  failed: "Échec",
}

const LIBELLE_EVENEMENT: Record<string, string> = {
  absence: "Absence",
  retard: "Retard",
  retenue: "Retenue",
  violation_reglement: "Règlement",
  report_card: "Bulletin",
  fee_overdue: "Frais",
  devoir: "Devoir",
}

/*
 * LA MOYENNE DU MOIS N'EXISTE PAS EN BASE, et ce n'est pas celle du
 * bulletin.
 *
 * Le bulletin moyenne une PÉRIODE (trimestre), matière par matière, avec
 * les coefficients de matière. Ici on ne peut pas faire cela : un mois ne
 * couvre presque jamais toutes les matières, et les absentes pèseraient 0
 * dans une moyenne pondérée — ce qui ferait chuter un élève pour la seule
 * raison qu'il n'a pas eu cours d'EPS ce mois-là.
 *
 * On moyenne donc les ÉVALUATIONS DU MOIS, ramenées au barème de l'école
 * et pondérées par leur propre coefficient. L'écran le dit mot pour mot :
 * c'est une indication du mois, pas une note de bulletin. Le rang se
 * calcule sur la même base, dans la même classe.
 *
 * Fonction de MODULE et non du composant : appelée depuis un useCallback,
 * une fonction du corps aurait ajouté un avertissement exhaustive-deps.
 */
async function lireMoyenneDuMois(
  studentId: string,
  classId: string | null,
  debut: string,
  fin: string
) {
  const vide = { moyenne: null, rang: null, effectif: null }

  if (!classId) {
    return vide
  }

  const [ecoleResultat, evaluationsResultat] = await Promise.all([
    supabase.from("schools").select("grading_scale").maybeSingle(),
    supabase
      .from("assessments")
      .select("id, max_score, coefficient")
      .eq("class_id", classId)
      .gte("assessment_date", debut)
      .lte("assessment_date", fin),
  ])

  const evaluations = (evaluationsResultat.data ?? []) as {
    id: string
    max_score: number
    coefficient: number
  }[]

  if (evaluations.length === 0) {
    return vide
  }

  const bareme = Number(ecoleResultat.data?.grading_scale) || 20

  const { data: notesData } = await supabase
    .from("grades")
    .select("student_id, assessment_id, score")
    .in(
      "assessment_id",
      evaluations.map((item) => item.id)
    )

  const notes = (notesData ?? []) as {
    student_id: string
    assessment_id: string
    score: number
  }[]

  const parEvaluation = new Map(evaluations.map((item) => [item.id, item]))

  // Somme pondérée par élève : Σ(note/barème × coef) / Σ(coef).
  const cumul = new Map<string, { points: number; poids: number }>()

  for (const note of notes) {
    const evaluation = parEvaluation.get(note.assessment_id)

    if (!evaluation) {
      continue
    }

    const max = Number(evaluation.max_score) || 0
    const coefficient = Number(evaluation.coefficient) || 1

    if (max <= 0) {
      continue
    }

    const courant = cumul.get(note.student_id) ?? { points: 0, poids: 0 }

    courant.points += (Number(note.score) / max) * coefficient
    courant.poids += coefficient

    cumul.set(note.student_id, courant)
  }

  const lignes = [...cumul.entries()].map(([id, valeur]) => ({
    id,
    moyenne: valeur.poids > 0 ? (valeur.points / valeur.poids) * bareme : null,
  }))

  const classement = rangs(lignes, (ligne) => ligne.moyenne)
  const mienne = lignes.find((ligne) => ligne.id === studentId)

  if (!mienne || mienne.moyenne === null) {
    return vide
  }

  return {
    moyenne: mienne.moyenne,
    rang: classement.get(mienne) ?? null,
    effectif: lignes.length,
  }
}

/* useSearchParams impose une frontière de Suspense au rendu statique. */
export default function RapportEleveePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Chargement...</p>
        </main>
      }
    >
      <RapportEleve />
    </Suspense>
  )
}

function RapportEleve() {
  const router = useRouter()
  const params = useParams<{ studentId: string }>()
  const searchParams = useSearchParams()
  const studentId = params?.studentId ?? ""

  const maintenant = new Date()

  const [annee, setAnnee] = useState(
    Number(searchParams.get("annee")) || maintenant.getFullYear()
  )
  const [mois, setMois] = useState(
    Number(searchParams.get("mois")) || maintenant.getMonth() + 1
  )

  const [ecole, setEcole] = useState("")
  const [eleve, setEleve] = useState<Eleve | null>(null)
  const [classe, setClasse] = useState<string | null>(null)
  const [faits, setFaits] = useState<FaitDate[]>([])
  const [moyenne, setMoyenne] = useState<number | null>(null)
  const [rang, setRang] = useState<number | null>(null)
  const [effectif, setEffectif] = useState<number | null>(null)

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!studentId) {
      return
    }

    setChargement(true)
    setErreur(null)

    const { debut, fin } = bornesDuMois(annee, mois)

    const [
      eleveResultat,
      ecoleResultat,
      inscriptionResultat,
      jourResultat,
      leconResultat,
      retenuesResultat,
      manquementsResultat,
      messagesResultat,
    ] = await Promise.all([
      supabase
        .from("students")
        .select(
          "id, first_name, last_name, student_number, parent_name, parent_phone"
        )
        .eq("id", studentId)
        .maybeSingle(),

      supabase.from("schools").select("name").maybeSingle(),

      supabase
        .from("student_class_enrollments")
        .select("class_id, classes ( name ), academic_years ( is_active )")
        .eq("student_id", studentId),

      supabase
        .from("attendance")
        .select("id, attendance_date, status, created_at")
        .eq("student_id", studentId)
        .gte("attendance_date", debut)
        .lte("attendance_date", fin),

      /*
       * Le créneau porte l'heure RÉELLE du cours. C'est la seule heure
       * de tout ce rapport qui dise quand le fait s'est produit ; les
       * autres disent quand il a été consigné.
       */
      supabase
        .from("lesson_attendance")
        .select(
          `id, lesson_date, status, note, created_at,
           subjects ( name ),
           timetable_slots ( start_time, end_time )`
        )
        .eq("student_id", studentId)
        .gte("lesson_date", debut)
        .lte("lesson_date", fin),

      supabase
        .from("detentions")
        .select("id, detention_date, reason, created_at")
        .eq("student_id", studentId)
        .gte("detention_date", debut)
        .lte("detention_date", fin),

      supabase
        .from("rule_violations")
        .select(
          "id, violation_date, note, created_at, school_rules ( label )"
        )
        .eq("student_id", studentId)
        .gte("violation_date", debut)
        .lte("violation_date", fin),

      supabase
        .from("sms_logs")
        .select("id, created_at, event_type, status, message")
        .eq("student_id", studentId)
        .gte("created_at", `${debut}T00:00:00`)
        .lte("created_at", `${fin}T23:59:59`),
    ])

    if (eleveResultat.error || !eleveResultat.data) {
      console.error("Erreur élève :", eleveResultat.error)
      setErreur(
        "Cet élève est introuvable, ou vous n'avez pas accès à son dossier."
      )
      setChargement(false)
      return
    }

    setEleve(eleveResultat.data as Eleve)
    setEcole(ecoleResultat.data?.name ?? "")

    const inscriptions = (inscriptionResultat.data ?? []) as unknown as {
      class_id: string
      classes: { name: string } | null
      academic_years: { is_active: boolean } | null
    }[]

    const inscriptionActive =
      inscriptions.find((ligne) => ligne.academic_years?.is_active) ??
      inscriptions[0]

    setClasse(inscriptionActive?.classes?.name ?? null)

    const collecte: FaitDate[] = []

    for (const ligne of (jourResultat.data ?? []) as {
      attendance_date: string
      status: string
      created_at: string
    }[]) {
      // Un « présent » n'a pas sa place dans un dossier de convocation.
      if (ligne.status === "present") {
        continue
      }

      collecte.push({
        dateIso: ligne.attendance_date,
        heure: heureDe(ligne.created_at),
        source: "saisie",
        categorie: "Journée",
        detail: LIBELLE_STATUT[ligne.status] ?? ligne.status,
      })
    }

    for (const ligne of (leconResultat.data ?? []) as unknown as {
      lesson_date: string
      status: string
      note: string | null
      created_at: string
      subjects: { name: string } | null
      timetable_slots: { start_time: string; end_time: string } | null
    }[]) {
      if (ligne.status === "present") {
        continue
      }

      collecte.push({
        dateIso: ligne.lesson_date,
        heure: plageHoraire(
          ligne.timetable_slots?.start_time,
          ligne.timetable_slots?.end_time
        ),
        source: "cours",
        categorie: `Leçon — ${ligne.subjects?.name ?? "matière retirée"}`,
        detail: LIBELLE_STATUT[ligne.status] ?? ligne.status,
        precision: ligne.note,
      })
    }

    for (const ligne of (retenuesResultat.data ?? []) as {
      detention_date: string
      reason: string
      created_at: string
    }[]) {
      collecte.push({
        dateIso: ligne.detention_date,
        heure: heureDe(ligne.created_at),
        source: "saisie",
        categorie: "Retenue",
        detail: ligne.reason,
      })
    }

    for (const ligne of (manquementsResultat.data ?? []) as unknown as {
      violation_date: string
      note: string | null
      created_at: string
      school_rules: { label: string } | null
    }[]) {
      collecte.push({
        dateIso: ligne.violation_date,
        heure: heureDe(ligne.created_at),
        source: "saisie",
        categorie: "Règlement intérieur",
        detail: ligne.school_rules?.label ?? "règle retirée",
        precision: ligne.note,
      })
    }

    for (const ligne of (messagesResultat.data ?? []) as {
      created_at: string
      event_type: string
      status: string
      message: string
    }[]) {
      collecte.push({
        dateIso: dateDeLHorodatage(ligne.created_at),
        heure: heureDe(ligne.created_at),
        source: "saisie",
        categorie: `Message aux parents — ${
          LIBELLE_EVENEMENT[ligne.event_type] ?? ligne.event_type
        }`,
        detail: ligne.message,
        precision: LIBELLE_ENVOI[ligne.status] ?? ligne.status,
      })
    }

    setFaits(parOrdreChronologique(collecte))

    const bilan = await lireMoyenneDuMois(
      studentId,
      inscriptionActive?.class_id ?? null,
      debut,
      fin
    )

    setMoyenne(bilan.moyenne)
    setRang(bilan.rang)
    setEffectif(bilan.effectif)

    setChargement(false)
  }, [studentId, annee, mois])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  const resume = useMemo(() => {
    const compte = (prefixe: string) =>
      faits.filter((fait) => fait.categorie.startsWith(prefixe)).length

    return {
      total: faits.length,
      absences: faits.filter(
        (fait) =>
          fait.detail === "Absent" || fait.detail === "Absence excusée"
      ).length,
      retards: faits.filter((fait) => fait.detail === "Retard").length,
      retenues: compte("Retenue"),
      manquements: compte("Règlement"),
      messages: compte("Message"),
    }
  }, [faits])

  const titreMois = libelleMois(annee, mois)

  return (
    <main className="min-h-screen bg-muted/30 print:bg-white">
      <style jsx global>{`
        @media print {
          .print-hidden {
            display: none !important;
          }
          .rapport-print {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
          body {
            background: white;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>

      <section className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="print-hidden flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => router.push(`/students/${studentId}`)}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            ← Historique
          </button>

          <div className="flex flex-wrap gap-3">
            <select
              value={mois}
              onChange={(event) => setMois(Number(event.target.value))}
              aria-label="Mois"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {MOIS_NOMS.map((nom, index) => (
                <option key={nom} value={index + 1}>
                  {nom}
                </option>
              ))}
            </select>

            <select
              value={annee}
              onChange={(event) => setAnnee(Number(event.target.value))}
              aria-label="Année"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {[annee - 1, annee, annee + 1].map((valeur) => (
                <option key={valeur} value={valeur}>
                  {valeur}
                </option>
              ))}
            </select>

            <button
              onClick={() => window.print()}
              disabled={chargement || !eleve}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Imprimer
            </button>
          </div>
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Chargement du rapport...</p>
        ) : !eleve ? null : (
          <div className="rapport-print rounded-xl border bg-background p-8">
            <header className="border-b pb-4">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                {ecole || "Établissement"}
              </p>

              <h1 className="mt-1 font-heading text-2xl font-bold">
                Rapport mensuel — {titreMois}
              </h1>

              <p className="mt-2">
                <strong>
                  {eleve.last_name} {eleve.first_name}
                </strong>
                {eleve.student_number ? ` — matricule ${eleve.student_number}` : ""}
                {classe ? ` — classe ${classe}` : ""}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Parent : {eleve.parent_name || "non renseigné"}
                {eleve.parent_phone ? ` — ${eleve.parent_phone}` : ""}
              </p>

              {/*
                Le but du document, écrit dessus. Il circule sans nous :
                celui qui le reçoit doit savoir ce qu'il tient — un relevé
                de faits, et non un jugement.
              */}
              <p className="mt-3 text-sm">
                Ce document rassemble les faits enregistrés pour cet élève
                sur le mois, chacun avec sa date et son heure. Il est
                destiné à servir de base factuelle lors d&apos;une
                convocation.
              </p>
            </header>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ["Absences", resume.absences],
                ["Retards", resume.retards],
                ["Retenues", resume.retenues],
                ["Règlement", resume.manquements],
                ["Messages", resume.messages],
              ].map(([libelle, valeur]) => (
                <div key={String(libelle)} className="rounded-lg border p-3">
                  <p className="text-2xl font-bold">{valeur}</p>
                  <p className="text-muted-foreground">{libelle}</p>
                </div>
              ))}
            </div>

            {moyenne !== null && (
              <div className="mt-6 rounded-lg border p-4 text-sm">
                <p>
                  <strong>Moyenne des évaluations du mois :</strong>{" "}
                  {moyenne.toFixed(2)}
                  {rang !== null && effectif !== null
                    ? ` — rang ${rang} sur ${effectif}`
                    : ""}
                </p>

                {/*
                  Dit sans détour : ce n'est pas la moyenne du bulletin.
                  Laisser l'ambiguïté ferait comparer deux chiffres qui ne
                  se calculent pas de la même façon.
                */}
                <p className="mt-1 text-muted-foreground">
                  Calculée sur les seules évaluations datées de ce mois,
                  pondérées par leur coefficient. Ce n&apos;est pas la
                  moyenne du bulletin, qui porte sur toute la période.
                </p>
              </div>
            )}

            <h2 className="mt-8 font-heading text-lg font-bold">
              Faits du mois ({resume.total})
            </h2>

            {faits.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun fait enregistré pour cet élève sur {titreMois}.
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2 font-medium">Jour</th>
                        <th className="p-2 font-medium">Date</th>
                        <th className="p-2 font-medium">Heure</th>
                        <th className="p-2 font-medium">Fait</th>
                        <th className="p-2 font-medium">Détail</th>
                      </tr>
                    </thead>

                    <tbody>
                      {faits.map((fait, index) => (
                        <tr
                          key={`${fait.dateIso}-${fait.categorie}-${index}`}
                          className="border-b align-top"
                        >
                          <td className="p-2 capitalize">
                            {jourDeLaSemaine(fait.dateIso)}
                          </td>

                          <td className="whitespace-nowrap p-2">
                            {dateCourte(fait.dateIso)}
                          </td>

                          <td className="whitespace-nowrap p-2">
                            {fait.heure}
                            <span className="block text-xs text-muted-foreground">
                              {SOURCE_HEURE[fait.source]}
                            </span>
                          </td>

                          <td className="p-2">{fait.categorie}</td>

                          <td className="p-2">
                            {fait.detail}
                            {fait.precision ? (
                              <span className="block text-xs text-muted-foreground">
                                {fait.precision}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  L&apos;heure d&apos;une absence par leçon est celle du
                  cours. Pour les autres faits, aucune heure de survenue
                  n&apos;est enregistrée : l&apos;heure indiquée est celle
                  de la saisie.
                </p>
              </>
            )}

            <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
              Édité le {dateCourte(new Date().toISOString().slice(0, 10))} —
              {" "}
              {ecole || "établissement"}.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
