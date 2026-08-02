"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"

/*
 * Paie mensuelle, pilotée par les heures réellement assurées.
 *
 * ---------------------------------------------------------------------
 * CE QUE CETTE PAGE RELIE
 *
 * L'emploi du temps donne les heures prévues, les relevés de présence
 * donnent celles qui n'ont pas été assurées, et le calendrier scolaire
 * retire les jours où personne n'enseignait. La paie tombe au bout.
 *
 * Tout le calcul est en base, dans payroll_month(). Le refaire ici
 * ouvrirait deux vérités possibles pour un même mois — et c'est la
 * mauvaise qui finirait sur un bulletin.
 * ---------------------------------------------------------------------
 *
 * Les salaires sont sensibles : la fonction est en SECURITY DEFINER et
 * revérifie la permission financière, et les colonnes de rémunération
 * de `teachers` sont fermées au rôle `authenticated`. Le garde ci-dessous
 * n'évite qu'un écran vide.
 */

/* Alignée sur can_see_money() : les directeurs en sont exclus. */
const ROLES_AUTORISES = ["promoteur", "comptable"]

type LignePaie = {
  enseignant_id: string
  enseignant: string
  contrat: string
  statut: string
  taux_horaire: number | null
  salaire_mensuel: number | null
  creneaux: number
  heures_planifiees: number
  /* Heures CONFIRMÉES par le pointage — la source des heures payées. */
  heures_pointees: number
  /* L'écart entre planifié et pointé : ce que le promoteur surveille. */
  heures_non_assurees: number
  heures_payees: number
  jours_absence: number
  jours_absence_excusee: number
  jours_retard: number
  minutes_retard: number
  montant: number
  mois_cloture: boolean
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

function montant(valeur: number | null | undefined) {
  return `${Number(valeur ?? 0).toLocaleString("fr-FR")} FCFA`
}

function heures(valeur: number | null | undefined) {
  return `${Number(valeur ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`
}

/*
 * Une ligne de réglage du contrat. L'écriture passe par
 * set_teacher_compensation() : les colonnes de rémunération sont fermées
 * au rôle `authenticated`, un update direct serait refusé.
 */
function EditeurContrat({
  ligne,
  onEnregistre,
}: {
  ligne: LignePaie
  onEnregistre: () => void
}) {
  const [contrat, setContrat] = useState(
    ligne.contrat === "non defini" ? "" : ligne.contrat
  )
  const [taux, setTaux] = useState(
    ligne.taux_horaire === null ? "" : String(ligne.taux_horaire)
  )
  const [salaire, setSalaire] = useState(
    ligne.salaire_mensuel === null ? "" : String(ligne.salaire_mensuel)
  )
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    setEnregistrement(true)
    setErreur(null)

    const { error } = await supabase.rpc("set_teacher_compensation", {
      p_teacher_id: ligne.enseignant_id,
      p_contract_type: contrat || null,
      p_hourly_rate: contrat === "vacataire" && taux ? Number(taux) : null,
      p_monthly_salary:
        contrat === "permanent" && salaire ? Number(salaire) : null,
    })

    setEnregistrement(false)

    if (error) {
      console.error("Erreur rémunération :", error)
      setErreur(error.message || "Enregistrement impossible.")
      return
    }

    onEnregistre()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span className="min-w-[180px] flex-1 text-sm font-medium">
        {ligne.enseignant}
      </span>

      <select
        value={contrat}
        onChange={(event) => setContrat(event.target.value)}
        aria-label={`Contrat de ${ligne.enseignant}`}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        <option value="">Non défini</option>
        <option value="vacataire">Vacataire</option>
        <option value="permanent">Permanent</option>
      </select>

      {contrat === "vacataire" && (
        <input
          type="number"
          min="0"
          value={taux}
          onChange={(event) => setTaux(event.target.value)}
          placeholder="1800"
          aria-label={`Taux horaire de ${ligne.enseignant}`}
          className="w-28 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
      )}

      {contrat === "permanent" && (
        <input
          type="number"
          min="0"
          value={salaire}
          onChange={(event) => setSalaire(event.target.value)}
          placeholder="150000"
          aria-label={`Salaire mensuel de ${ligne.enseignant}`}
          className="w-32 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
      )}

      <span className="text-xs text-muted-foreground">
        {contrat === "vacataire"
          ? "FCFA / heure"
          : contrat === "permanent"
            ? "FCFA / mois"
            : ""}
      </span>

      <button
        onClick={enregistrer}
        disabled={enregistrement}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {enregistrement ? "..." : "Enregistrer"}
      </button>

      {erreur && (
        <span className="text-xs text-destructive">{erreur}</span>
      )}
    </div>
  )
}

export default function PayrollPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES, { comptabilite: true })

  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois, setMois] = useState(maintenant.getMonth() + 1)

  const [ecole, setEcole] = useState("")
  const [lignes, setLignes] = useState<LignePaie[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Bulletin en cours d'impression, null = tableau d'ensemble. */
  const [bulletin, setBulletin] = useState<LignePaie | null>(null)
  const [cloture, setCloture] = useState(false)

  /* Renseigné par payroll_month : toutes les lignes portent la même valeur. */
  const moisCloture = lignes.length > 0 && Boolean(lignes[0].mois_cloture)

  async function cloturerLeMois() {
    if (gate.statut !== "autorise") {
      return
    }

    const confirme = window.confirm(
      `Clôturer la paie de ${MOIS[mois - 1]} ${annee} ? Les pointages de ce mois seront figés : plus aucun ajout, aucune réduction ni annulation ne sera possible. Cette opération ne se défait pas.`
    )

    if (!confirme) {
      return
    }

    setCloture(true)

    const { error } = await supabase.from("payroll_closings").insert({
      school_id: gate.schoolId,
      year: annee,
      month: mois,
    })

    setCloture(false)

    if (error) {
      console.error("Erreur clôture :", error)
      setErreur(error.message || "Le mois n'a pas pu être clôturé.")
      return
    }

    setRechargement((valeur) => valeur + 1)
  }

  /* Incrémenté après une modification de contrat, pour relancer le calcul. */
  const [rechargement, setRechargement] = useState(0)

  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId
    let annule = false

    async function charger() {
      const [ecoleResultat, paieResultat] = await Promise.all([
        supabase
          .from("schools")
          .select("name")
          .eq("id", schoolId)
          .maybeSingle(),
        supabase.rpc("payroll_month", { p_year: annee, p_month: mois }),
      ])

      if (annule) {
        return
      }

      if (paieResultat.error) {
        console.error("Erreur paie :", paieResultat.error)
        setErreur(
          paieResultat.error.message || "La paie n'a pas pu être calculée."
        )
        setChargement(false)
        return
      }

      setErreur(null)
      setEcole(ecoleResultat.data?.name ?? "")
      setLignes(paieResultat.data ?? [])
      setChargement(false)
    }

    charger()

    return () => {
      annule = true
    }
  }, [gate, annee, mois, rechargement])

  const totaux = useMemo(() => {
    return lignes.reduce(
      (somme, ligne) => ({
        planifiees: somme.planifiees + Number(ligne.heures_planifiees),
        pointees: somme.pointees + Number(ligne.heures_pointees),
        payees: somme.payees + Number(ligne.heures_payees),
        montant: somme.montant + Number(ligne.montant),
      }),
      { planifiees: 0, pointees: 0, payees: 0, montant: 0 }
    )
  }, [lignes])

  const sansContrat = lignes.filter(
    (ligne) => ligne.contrat === "non defini"
  ).length

  const sansCreneau = lignes.filter(
    (ligne) => ligne.contrat !== "non defini" && ligne.creneaux === 0
  ).length

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  const libelleMois = `${MOIS[mois - 1]} ${annee}`

  return (
    <main className="paie-main min-h-screen bg-muted/30">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-exclude { display: none !important; }

          .paie-bloc { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }

          .paie-feuille {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }
          .paie-main { background: white !important; min-height: 0 !important; }

          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="print-hidden border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-4 p-6">
          <div className="space-y-1">
            <label htmlFor="mois" className="text-xs font-medium text-muted-foreground">
              Mois
            </label>

            <select
              id="mois"
              value={mois}
              onChange={(event) => {
                setChargement(true)
                setBulletin(null)
                setMois(Number(event.target.value))
              }}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            >
              {MOIS.map((nom, index) => (
                <option key={nom} value={index + 1}>
                  {nom}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="annee" className="text-xs font-medium text-muted-foreground">
              Année
            </label>

            <input
              id="annee"
              type="number"
              value={annee}
              min={2020}
              max={2100}
              onChange={(event) => {
                setChargement(true)
                setBulletin(null)
                setAnnee(Number(event.target.value))
              }}
              className="block w-24 rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {bulletin && (
            <button
              onClick={() => setBulletin(null)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              ← Tout le personnel
            </button>
          )}

          <div className="ml-auto flex gap-2">
            {/*
              Clôturer fige les pointages du mois — plus d'ajout, de
              réduction ni d'annulation. C'est l'équivalent de l'état de
              caisse qui fige la journée, et cela ne se défait pas depuis
              l'application : le bouton disparaît une fois le mois clos.
            */}
            {!moisCloture && lignes.length > 0 && gate.role === "comptable" && (
              <button
                onClick={cloturerLeMois}
                disabled={cloture}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                {cloture ? "Clôture..." : "Clôturer le mois"}
              </button>
            )}

            <button
              onClick={() => router.push("/teachers")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Enseignants
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Retour
            </button>

            <button
              onClick={() => window.print()}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              Imprimer
            </button>
          </div>
        </div>

        {erreur && (
          <div className="mx-auto max-w-5xl px-6 pb-4">
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </p>
          </div>
        )}

        {!chargement && (sansContrat > 0 || sansCreneau > 0) && (
          <div className="mx-auto max-w-5xl px-6 pb-4">
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.5)",
              }}
            >
              {sansContrat > 0 && (
                <p>
                  <strong>{sansContrat}</strong> enseignant
                  {sansContrat > 1 ? "s" : ""} sans type de contrat : leur
                  montant reste à zéro tant que le contrat et le tarif ne sont
                  pas renseignés sur la fiche.
                </p>
              )}

              {sansCreneau > 0 && (
                <p className={sansContrat > 0 ? "mt-1" : undefined}>
                  <strong>{sansCreneau}</strong> enseignant
                  {sansCreneau > 1 ? "s" : ""} sans aucun créneau ce mois-ci.
                  Vérifiez l&apos;emploi du temps et les dates de l&apos;année
                  scolaire — un créneau hors de l&apos;année déclarée ne compte
                  pas.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/*
        Contrats et tarifs. Ils vivent ici et non sur la page Enseignants,
        qui est ouverte à l'encadrement : un directeur gère les
        enseignants sans avoir à connaître leur salaire. L'écriture passe
        par set_teacher_compensation(), qui revérifie la permission.
      */}
      {!bulletin && !chargement && lignes.length > 0 && (
        <div className="print-hidden mx-auto mt-8 max-w-5xl rounded-xl border bg-background p-6">
          <h2 className="text-lg font-semibold">Contrats et tarifs</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Un vacataire est payé à l&apos;heure, un permanent au mois.
            Sans contrat renseigné, le montant reste à zéro.
          </p>

          <div className="mt-4 space-y-2">
            {lignes.map((ligne) => (
              <EditeurContrat
                key={ligne.enseignant_id}
                ligne={ligne}
                onEnregistre={() => {
                  setChargement(true)
                  // Le compteur relance l'effet : changer un tarif doit
                  // recalculer le mois immédiatement.
                  setRechargement((valeur) => valeur + 1)
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="paie-feuille mx-auto my-8 max-w-5xl bg-white p-10 text-black shadow-sm">
        <header className="paie-bloc border-b-2 border-black pb-4 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide">
            {ecole || "Établissement"}
          </h1>

          <p className="mt-2 text-xl font-bold">
            {bulletin ? "Bulletin de paie" : "État de la paie"}
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm">
            <span>
              <strong>Mois :</strong> {libelleMois}
              {moisCloture && (
                <span className="ml-2 font-semibold">— mois clôturé</span>
              )}
            </span>

            {bulletin && (
              <span>
                <strong>Enseignant :</strong> {bulletin.enseignant}
              </span>
            )}

            <span>
              <strong>Édité le :</strong>{" "}
              {new Date().toLocaleDateString("fr-FR")}
            </span>
          </div>
        </header>

        {chargement ? (
          <p className="mt-10 text-center text-sm">Calcul de la paie...</p>
        ) : bulletin ? (
          /* ---------------- Bulletin individuel ---------------- */
          <>
            <section className="paie-bloc mt-8">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-2 font-medium">
                      Enseignant
                    </td>
                    <td className="border border-black px-2 py-2">
                      {bulletin.enseignant}
                    </td>
                    <td className="border border-black px-2 py-2 font-medium">
                      Contrat
                    </td>
                    <td className="border border-black px-2 py-2">
                      {bulletin.contrat === "permanent"
                        ? "Permanent (mensualisé)"
                        : bulletin.contrat === "vacataire"
                          ? "Vacataire (payé à l'heure)"
                          : "Non défini"}
                    </td>
                  </tr>

                  {bulletin.contrat === "vacataire" && (
                    <tr>
                      <td className="border border-black px-2 py-2 font-medium">
                        Taux horaire
                      </td>
                      <td className="border border-black px-2 py-2">
                        {montant(bulletin.taux_horaire)}
                      </td>
                      <td className="border border-black px-2 py-2 font-medium">
                        Jours de cours retenus
                      </td>
                      <td className="border border-black px-2 py-2 tabular-nums">
                        {bulletin.creneaux}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="paie-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                Décompte des heures
              </h2>

              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-2">
                      Heures planifiées{" "}
                      <span className="text-xs italic">
                        (vacances et jours fériés exclus)
                      </span>
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums">
                      {heures(bulletin.heures_planifiees)}
                    </td>
                  </tr>

                  <tr>
                    <td className="border border-black px-2 py-2">
                      Heures confirmées par pointage
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums">
                      {heures(bulletin.heures_pointees)}
                    </td>
                  </tr>

                  <tr>
                    <td className="border border-black px-2 py-2">
                      Écart{" "}
                      <span className="text-xs italic">
                        (planifié non confirmé)
                      </span>
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums">
                      {heures(bulletin.heures_non_assurees)}
                    </td>
                  </tr>

                  <tr className="bg-neutral-100 font-bold">
                    <td className="border border-black px-2 py-2">
                      Heures à payer
                    </td>
                    <td className="border border-black px-2 py-2 text-right tabular-nums">
                      {heures(bulletin.heures_payees)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="mt-4 w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1.5">
                      Absences non excusées
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {bulletin.jours_absence}
                    </td>
                    <td className="border border-black px-2 py-1.5">
                      Absences excusées
                    </td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {bulletin.jours_absence_excusee}
                    </td>
                    <td className="border border-black px-2 py-1.5">Retards</td>
                    <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                      {bulletin.jours_retard}
                      {bulletin.minutes_retard > 0 &&
                        ` (${bulletin.minutes_retard} min)`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="paie-bloc mt-8">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="border-2 border-black px-3 py-4 text-base font-bold uppercase">
                      Net à payer
                    </td>
                    <td className="border-2 border-black px-3 py-4 text-right text-xl font-bold tabular-nums">
                      {montant(bulletin.montant)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {bulletin.contrat === "permanent" && (
                <p className="mt-2 text-xs italic">
                  Contrat permanent : la rémunération est mensuelle et ne
                  dépend pas du nombre d&apos;heures assurées. Le décompte
                  ci-dessus est donné à titre indicatif.
                </p>
              )}
            </section>

            <section className="paie-bloc mt-10 flex justify-between gap-8">
              <div className="w-64">
                <p className="text-sm font-semibold">L&apos;Enseignant</p>
                <p className="mt-1 text-xs italic">
                  Reçu la somme ci-dessus
                </p>
                <div className="mt-14 border-t border-black" />
              </div>

              <div className="w-64 text-right">
                <p className="text-sm font-semibold">La Direction</p>
                <p className="mt-1 text-xs italic">
                  Nom, signature et cachet
                </p>
                <div className="mt-14 border-t border-black" />
              </div>
            </section>
          </>
        ) : (
          /* ---------------- Tableau d'ensemble ---------------- */
          <>
            <section className="paie-bloc mt-8">
              {lignes.length === 0 ? (
                <p className="text-center text-sm">
                  Aucun enseignant enregistré.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-neutral-100">
                        <th className="border border-black px-2 py-1.5 text-left">
                          Enseignant
                        </th>
                        <th className="border border-black px-2 py-1.5">
                          Contrat
                        </th>
                        <th className="border border-black px-2 py-1.5">
                          Planifiées
                        </th>
                        <th className="border border-black px-2 py-1.5">
                          Pointées
                        </th>
                        <th className="border border-black px-2 py-1.5">
                          Écart
                        </th>
                        <th className="border border-black px-2 py-1.5">
                          À payer
                        </th>
                        <th className="border border-black px-2 py-1.5 text-right">
                          Montant
                        </th>
                        <th className="border border-black px-2 py-1.5 print-hidden" />
                      </tr>
                    </thead>

                    <tbody>
                      {lignes.map((ligne) => (
                        <tr key={ligne.enseignant_id}>
                          <td className="border border-black px-2 py-1.5">
                            {ligne.enseignant}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-center">
                            {ligne.contrat === "permanent"
                              ? "Permanent"
                              : ligne.contrat === "vacataire"
                                ? "Vacataire"
                                : "—"}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                            {heures(ligne.heures_planifiees)}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                            {heures(ligne.heures_pointees)}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                            {heures(ligne.heures_non_assurees)}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-right font-semibold tabular-nums">
                            {heures(ligne.heures_payees)}
                          </td>

                          <td className="border border-black px-2 py-1.5 text-right font-bold tabular-nums">
                            {montant(ligne.montant)}
                          </td>

                          <td className="border border-black px-2 py-1.5 print-hidden">
                            <button
                              onClick={() => setBulletin(ligne)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Bulletin
                            </button>
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-neutral-100 font-bold">
                        <td className="border border-black px-2 py-1.5" colSpan={2}>
                          Total
                        </td>
                        <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                          {heures(totaux.planifiees)}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                          {heures(totaux.pointees)}
                        </td>
                        <td className="border border-black px-2 py-1.5" />
                        <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                          {heures(totaux.payees)}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                          {montant(totaux.montant)}
                        </td>
                        <td className="border border-black px-2 py-1.5 print-hidden" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="paie-bloc mt-6">
              <p className="text-xs italic">
                Règle appliquée : un vacataire est payé sur ses heures
                <strong> confirmées par pointage</strong>, jamais sur son
                planning. Un créneau non pointé n&apos;est pas payé — il n&apos;y
                a plus de retenue d&apos;absence à paramétrer. Les permanents
                restent mensualisés.
              </p>
            </section>

            <section className="paie-bloc mt-10 flex justify-between gap-8">
              <div className="w-64">
                <p className="text-sm font-semibold">Le Comptable</p>
                <p className="mt-1 text-xs italic">Nom et signature</p>
                <div className="mt-14 border-t border-black" />
              </div>

              <div className="w-64 text-right">
                <p className="text-sm font-semibold">Le Directeur</p>
                <p className="mt-1 text-xs italic">
                  Nom, signature et cachet
                </p>
                <div className="mt-14 border-t border-black" />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
