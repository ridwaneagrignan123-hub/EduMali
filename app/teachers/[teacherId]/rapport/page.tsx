"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { can } from "@/src/lib/roles"
import {
  MOIS_NOMS,
  bornesDuMois,
  dateCourte,
  heureDe,
  jourDeLaSemaine,
  libelleMois,
  plageHoraire,
} from "@/src/lib/rapport"

/*
 * Rapport mensuel d'un enseignant — ponctualité et assiduité, datées.
 *
 * ---------------------------------------------------------------------
 * DES FAITS, PAS DES SOMMES
 *
 * Ce document sert à convoquer un enseignant sur sa ponctualité. Il
 * porte donc des heures et des dates, et rien d'autre : un entretien sur
 * l'assiduité n'a pas à se tenir la fiche de paie à la main, et le
 * document circule entre des mains qui n'ont pas toutes à connaître les
 * rémunérations.
 *
 * Le bloc financier n'apparaît QUE pour qui a le droit de voir l'argent.
 * Ce n'est pas l'écran qui en décide : `payroll_month()` revérifie
 * `can_see_money()` en base et refuse l'appel sinon. Les colonnes de
 * rémunération de `teachers` sont par ailleurs fermées au rôle
 * `authenticated` — les lire n'est même pas possible depuis ici.
 * ---------------------------------------------------------------------
 *
 * LES HEURES ASSURÉES SONT LES POINTAGES, pas le planning. Un créneau
 * prévu n'est pas un cours donné : c'est toute la raison d'être de
 * `timetable_checkins` (voir supabase/paie-au-pointage.sql). Un pointage
 * annulé est montré comme tel, et non retiré — l'effacer ferait
 * disparaître une correction qui, elle, s'explique.
 */

type Enseignant = {
  id: string
  first_name: string
  last_name: string
  specialty: string | null
  contract_type: string | null
  status: string
}

type Pointage = {
  id: string
  occurred_on: string
  hours: number
  cancelled_at: string | null
  cancellation_reason: string | null
  timetable_slots: {
    start_time: string
    end_time: string
    classes: { name: string } | null
    subjects: { name: string } | null
  } | null
}

type Manquement = {
  id: string
  occurred_on: string
  status: string
  minutes_late: number | null
  note: string | null
  created_at: string
}

type Charge = {
  classe: string
  matiere: string
}

/** Ce que `payroll_month()` rend, réduit à ce qu'on affiche. */
type LignePaie = {
  enseignant_id: string
  contrat: string | null
  taux_horaire: number | null
  salaire_mensuel: number | null
  heures_pointees: number | null
  heures_payees: number | null
  montant: number | null
  mois_cloture: boolean
}

/*
 * Les valeurs de `teacher_attendance.status` sont celles de la
 * contrainte en base — `retard`, `absence`, `absence_excusee` — et NON
 * celles de `attendance`, qui parle anglais (`late`, `absent`,
 * `excused`). Les deux tables ne partagent pas leur vocabulaire ; s'y
 * tromper affichait un statut brut sur un document de convocation.
 */
const LIBELLE_MANQUEMENT: Record<string, string> = {
  retard: "Retard",
  absence: "Absence",
  absence_excusee: "Absence excusée",
}

const LIBELLE_CONTRAT: Record<string, string> = {
  permanent: "Permanent",
  vacataire: "Vacataire",
}

/** Le rôle de la personne connectée — pour savoir si l'argent s'affiche. */
async function lireMonRole() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return ""
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  return data?.role ?? ""
}

export default function RapportEnseignantPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Chargement...</p>
        </main>
      }
    >
      <RapportEnseignant />
    </Suspense>
  )
}

function RapportEnseignant() {
  const router = useRouter()
  const params = useParams<{ teacherId: string }>()
  const searchParams = useSearchParams()
  const teacherId = params?.teacherId ?? ""

  const maintenant = new Date()

  const [annee, setAnnee] = useState(
    Number(searchParams.get("annee")) || maintenant.getFullYear()
  )
  const [mois, setMois] = useState(
    Number(searchParams.get("mois")) || maintenant.getMonth() + 1
  )

  const [ecole, setEcole] = useState("")
  const [enseignant, setEnseignant] = useState<Enseignant | null>(null)
  const [pointages, setPointages] = useState<Pointage[]>([])
  const [manquements, setManquements] = useState<Manquement[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [paie, setPaie] = useState<LignePaie | null>(null)

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!teacherId) {
      return
    }

    setChargement(true)
    setErreur(null)
    setPaie(null)

    const { debut, fin } = bornesDuMois(annee, mois)

    const monRole = await lireMonRole()

    const [
      enseignantResultat,
      ecoleResultat,
      pointagesResultat,
      manquementsResultat,
      chargesResultat,
      titulariatsResultat,
    ] = await Promise.all([
      /*
       * Colonnes nommées une par une, jamais `*` : hourly_rate et
       * monthly_salary sont fermées au rôle `authenticated`, et une
       * étoile ferait échouer toute la requête pour qui n'a pas
       * l'argent.
       */
      supabase
        .from("teachers")
        .select("id, first_name, last_name, specialty, contract_type, status")
        .eq("id", teacherId)
        .maybeSingle(),

      supabase.from("schools").select("name").maybeSingle(),

      supabase
        .from("timetable_checkins")
        .select(
          `id, occurred_on, hours, cancelled_at, cancellation_reason,
           timetable_slots ( start_time, end_time,
             classes ( name ), subjects ( name ) )`
        )
        .eq("teacher_id", teacherId)
        .gte("occurred_on", debut)
        .lte("occurred_on", fin)
        .order("occurred_on"),

      supabase
        .from("teacher_attendance")
        .select("id, occurred_on, status, minutes_late, note, created_at")
        .eq("teacher_id", teacherId)
        .gte("occurred_on", debut)
        .lte("occurred_on", fin)
        .order("occurred_on"),

      supabase
        .from("class_subjects")
        .select("classes ( name ), subjects ( name )")
        .eq("teacher_id", teacherId),

      supabase
        .from("class_head_teachers")
        .select("classes ( name )")
        .eq("teacher_id", teacherId),
    ])

    if (enseignantResultat.error || !enseignantResultat.data) {
      console.error("Erreur enseignant :", enseignantResultat.error)
      setErreur(
        "Cet enseignant est introuvable, ou vous n'avez pas accès à sa fiche."
      )
      setChargement(false)
      return
    }

    setEnseignant(enseignantResultat.data as Enseignant)
    setEcole(ecoleResultat.data?.name ?? "")
    setPointages((pointagesResultat.data as unknown as Pointage[]) ?? [])
    setManquements((manquementsResultat.data as Manquement[]) ?? [])

    const tenues: Charge[] = []

    for (const ligne of (chargesResultat.data ?? []) as unknown as {
      classes: { name: string } | null
      subjects: { name: string } | null
    }[]) {
      tenues.push({
        classe: ligne.classes?.name ?? "—",
        matiere: ligne.subjects?.name ?? "—",
      })
    }

    for (const ligne of (titulariatsResultat.data ?? []) as unknown as {
      classes: { name: string } | null
    }[]) {
      tenues.push({
        classe: ligne.classes?.name ?? "—",
        matiere: "Titulaire de la classe",
      })
    }

    setCharges(tenues)

    /*
     * Le bloc financier, et seulement pour qui y a droit. On ne tente
     * même pas l'appel autrement : `payroll_month()` lèverait une
     * exception, et un message d'erreur rouge sur un rapport
     * d'assiduité laisserait croire à une panne.
     */
    if (can(monRole, "finances.voir")) {
      const { data: paieData, error: paieError } = await supabase.rpc(
        "payroll_month",
        { p_year: annee, p_month: mois }
      )

      if (paieError) {
        console.error("Erreur paie :", paieError)
      } else {
        const lignes = (paieData ?? []) as LignePaie[]
        setPaie(
          lignes.find((ligne) => ligne.enseignant_id === teacherId) ?? null
        )
      }
    }

    setChargement(false)
  }, [teacherId, annee, mois])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  const totaux = useMemo(() => {
    const assures = pointages.filter((ligne) => !ligne.cancelled_at)

    return {
      seances: assures.length,
      heures: assures.reduce((somme, ligne) => somme + Number(ligne.hours), 0),
      annules: pointages.length - assures.length,
      absences: manquements.filter((ligne) => ligne.status === "absence")
        .length,
      excusees: manquements.filter(
        (ligne) => ligne.status === "absence_excusee"
      ).length,
      retards: manquements.filter((ligne) => ligne.status === "retard").length,
      minutes: manquements.reduce(
        (somme, ligne) => somme + (Number(ligne.minutes_late) || 0),
        0
      ),
    }
  }, [pointages, manquements])

  const chargesUniques = useMemo(() => {
    const vues = new Map<string, Charge>()

    for (const charge of charges) {
      vues.set(`${charge.classe}|${charge.matiere}`, charge)
    }

    return [...vues.values()].sort(
      (a, b) =>
        a.classe.localeCompare(b.classe) || a.matiere.localeCompare(b.matiere)
    )
  }, [charges])

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
            onClick={() => router.push("/teachers")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            ← Enseignants
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
              disabled={chargement || !enseignant}
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
        ) : !enseignant ? null : (
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
                  {enseignant.last_name} {enseignant.first_name}
                </strong>
                {enseignant.specialty ? ` — ${enseignant.specialty}` : ""}
                {enseignant.contract_type
                  ? ` — ${
                      LIBELLE_CONTRAT[enseignant.contract_type] ??
                      enseignant.contract_type
                    }`
                  : ""}
              </p>

              <p className="mt-3 text-sm">
                Ce document rassemble les heures réellement assurées et les
                manquements enregistrés sur le mois, avec leurs dates. Il
                est destiné à servir de base factuelle lors d&apos;un
                entretien de ponctualité et d&apos;assiduité.
              </p>
            </header>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Heures assurées", totaux.heures.toFixed(2)],
                ["Séances", totaux.seances],
                ["Absences", totaux.absences + totaux.excusees],
                ["Retards", totaux.retards],
              ].map(([libelle, valeur]) => (
                <div key={String(libelle)} className="rounded-lg border p-3">
                  <p className="text-2xl font-bold">{valeur}</p>
                  <p className="text-muted-foreground">{libelle}</p>
                </div>
              ))}
            </div>

            {chargesUniques.length > 0 && (
              <>
                <h2 className="mt-8 font-heading text-lg font-bold">
                  Classes et matières tenues
                </h2>

                <ul className="mt-3 space-y-1 text-sm">
                  {chargesUniques.map((charge) => (
                    <li key={`${charge.classe}-${charge.matiere}`}>
                      {charge.classe} — {charge.matiere}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h2 className="mt-8 font-heading text-lg font-bold">
              Heures assurées ({totaux.seances})
            </h2>

            {pointages.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun pointage enregistré sur {titreMois}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Jour</th>
                      <th className="p-2 font-medium">Date</th>
                      <th className="p-2 font-medium">Heure du cours</th>
                      <th className="p-2 font-medium">Classe — matière</th>
                      <th className="p-2 font-medium">Heures</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pointages.map((ligne) => (
                      <tr key={ligne.id} className="border-b align-top">
                        <td className="p-2 capitalize">
                          {jourDeLaSemaine(ligne.occurred_on)}
                        </td>

                        <td className="whitespace-nowrap p-2">
                          {dateCourte(ligne.occurred_on)}
                        </td>

                        <td className="whitespace-nowrap p-2">
                          {plageHoraire(
                            ligne.timetable_slots?.start_time,
                            ligne.timetable_slots?.end_time
                          )}
                        </td>

                        <td className="p-2">
                          {ligne.timetable_slots?.classes?.name ?? "—"}
                          {" — "}
                          {ligne.timetable_slots?.subjects?.name ?? "—"}
                        </td>

                        <td className="p-2">
                          {Number(ligne.hours).toFixed(2)}
                          {/*
                            Un pointage annulé reste visible : l'effacer
                            ferait disparaître une correction qui, elle,
                            s'explique.
                          */}
                          {ligne.cancelled_at ? (
                            <span className="block text-xs text-destructive">
                              annulé
                              {ligne.cancellation_reason
                                ? ` — ${ligne.cancellation_reason}`
                                : ""}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="mt-8 font-heading text-lg font-bold">
              Retards et absences ({manquements.length})
            </h2>

            {manquements.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun retard ni absence enregistré sur {titreMois}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Jour</th>
                      <th className="p-2 font-medium">Date</th>
                      <th className="p-2 font-medium">Constat</th>
                      <th className="p-2 font-medium">Retard</th>
                      <th className="p-2 font-medium">Note</th>
                    </tr>
                  </thead>

                  <tbody>
                    {manquements.map((ligne) => (
                      <tr key={ligne.id} className="border-b align-top">
                        <td className="p-2 capitalize">
                          {jourDeLaSemaine(ligne.occurred_on)}
                        </td>

                        <td className="whitespace-nowrap p-2">
                          {dateCourte(ligne.occurred_on)}
                          <span className="block text-xs text-muted-foreground">
                            saisi à {heureDe(ligne.created_at)}
                          </span>
                        </td>

                        <td className="p-2">
                          {LIBELLE_MANQUEMENT[ligne.status] ?? ligne.status}
                        </td>

                        <td className="whitespace-nowrap p-2">
                          {ligne.minutes_late
                            ? `${ligne.minutes_late} min`
                            : "—"}
                        </td>

                        <td className="p-2">{ligne.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totaux.minutes > 0 && (
              <p className="mt-3 text-sm">
                Cumul des retards du mois : <strong>{totaux.minutes} minutes</strong>.
              </p>
            )}

            {/*
              LE SEUL BLOC D'ARGENT, et il n'apparaît que pour qui a le
              droit de le voir. Ce n'est pas cet écran qui l'autorise :
              payroll_month() revérifie can_see_money() en base.
            */}
            {paie && (
              <>
                <h2 className="mt-8 font-heading text-lg font-bold">
                  Rémunération du mois
                </h2>

                <div className="mt-3 rounded-lg border p-4 text-sm">
                  <p>
                    Heures pointées :{" "}
                    <strong>{Number(paie.heures_pointees ?? 0).toFixed(2)}</strong>
                    {" "}— heures payées :{" "}
                    <strong>{Number(paie.heures_payees ?? 0).toFixed(2)}</strong>
                  </p>

                  <p className="mt-1">
                    Montant :{" "}
                    <strong>
                      {Number(paie.montant ?? 0).toLocaleString("fr-FR")} F
                    </strong>
                    {paie.mois_cloture ? " — mois clôturé" : ""}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Ce bloc n&apos;est visible que par les rôles autorisés à
                    consulter la comptabilité.
                  </p>
                </div>
              </>
            )}

            <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
              Édité le {dateCourte(new Date().toISOString().slice(0, 10))} —{" "}
              {ecole || "établissement"}. Les heures assurées sont les
              pointages, non le planning : un créneau prévu n&apos;est pas
              un cours donné.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
