"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"

/*
 * État de caisse journalier.
 *
 * ---------------------------------------------------------------------
 * CE QUE CETTE PAGE SERT À PROUVER
 *
 * Un promoteur d'école ne craint pas d'abord la pédagogie : il craint
 * que l'argent parte. Cette feuille répond à une question précise en fin
 * de journée — combien est entré, par quel moyen, entre quelles mains,
 * et qu'a-t-on annulé.
 *
 * Les annulations y figurent ; c'est tout l'intérêt. Un encaissement
 * effacé ne laisserait rien, un encaissement annulé laisse une ligne,
 * un motif et un nom.
 * ---------------------------------------------------------------------
 *
 * Les chiffres viennent des fonctions cash_report_* en base. Elles sont
 * en SECURITY DEFINER — pour lire le nom des encaisseurs, que la policy
 * de profiles réserve à leur propriétaire — et refont donc le contrôle
 * de permission elles-mêmes. Le garde ci-dessous ne fait qu'éviter un
 * écran vide.
 */

/* Alignée sur can_see_money() en base : le directeur général en est exclu. */
const ROLES_AUTORISES = ["promoteur", "comptable"]

type Totaux = {
  encaisse: number
  nombre: number
  annule: number
  nombre_annule: number
}

type ParMode = { mode: string; nombre: number; total: number }

type ParEncaisseur = {
  encaisseur: string
  role_encaisseur: string
  nombre: number
  total: number
}

type Ligne = {
  recu: number
  eleve: string
  montant: number
  mode: string
  encaisseur: string
  annule_le: string | null
  annule_par: string | null
  motif: string | null
}

const LIBELLE_MODE: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank_transfer: "Virement",
  cheque: "Chèque",
  non_precise: "Non précisé",
  "non precise": "Non précisé",
}

const LIBELLE_ROLE: Record<string, string> = {
  admin: "Administrateur",
  promoteur: "Promoteur",
  comptable: "Comptable",
}

function montant(valeur: number | null | undefined) {
  return `${Number(valeur ?? 0).toLocaleString("fr-FR")} FCFA`
}

function jourISO(date: Date) {
  // toISOString() bascule en UTC et peut reculer d'un jour au Mali.
  const mois = String(date.getMonth() + 1).padStart(2, "0")
  const jour = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${mois}-${jour}`
}

export default function CashReportPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES, { comptabilite: true })

  const [jour, setJour] = useState(() => jourISO(new Date()))
  const [ecole, setEcole] = useState("")

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const [totaux, setTotaux] = useState<Totaux | null>(null)
  const [parMode, setParMode] = useState<ParMode[]>([])
  const [parEncaisseur, setParEncaisseur] = useState<ParEncaisseur[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])

  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId
    let annule = false

    async function charger() {
      const [
        ecoleResultat,
        totauxResultat,
        modeResultat,
        encaisseurResultat,
        lignesResultat,
      ] = await Promise.all([
        supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
        supabase.rpc("cash_report_totals", { p_date: jour }),
        supabase.rpc("cash_report_by_method", { p_date: jour }),
        supabase.rpc("cash_report_by_collector", { p_date: jour }),
        supabase.rpc("cash_report_payments", { p_date: jour }),
      ])

      if (annule) {
        return
      }

      const premiereErreur =
        totauxResultat.error ??
        modeResultat.error ??
        encaisseurResultat.error ??
        lignesResultat.error

      if (premiereErreur) {
        console.error("Erreur état de caisse :", premiereErreur)
        setErreur(
          premiereErreur.message ||
            "L'état de caisse n'a pas pu être établi."
        )
        setChargement(false)
        return
      }

      setErreur(null)
      setEcole(ecoleResultat.data?.name ?? "")
      setTotaux(totauxResultat.data?.[0] ?? null)
      setParMode(modeResultat.data ?? [])
      setParEncaisseur(encaisseurResultat.data ?? [])
      setLignes(lignesResultat.data ?? [])
      setChargement(false)
    }

    charger()

    return () => {
      annule = true
    }
  }, [gate, jour])

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  const annulations = lignes.filter((ligne) => ligne.annule_le)

  return (
    <main className="cash-main min-h-screen bg-muted/30">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-exclude { display: none !important; }

          /* Aucun tableau coupé en deux : un état de caisse tronqué ne
             prouve rien. */
          .cash-bloc { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }

          .cash-feuille {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }
          .cash-main { background: white !important; min-height: 0 !important; }

          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="print-hidden border-b bg-background">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-4 p-6">
          <div className="space-y-1">
            <label htmlFor="jour" className="text-xs font-medium text-muted-foreground">
              Journée
            </label>

            <input
              id="jour"
              type="date"
              value={jour}
              onChange={(event) => {
                setChargement(true)
                setJour(event.target.value)
              }}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="ms-auto flex gap-2">
            <button
              onClick={() => router.push("/fees")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Frais scolaires
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
          <div className="mx-auto max-w-4xl px-6 pb-4">
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </p>
          </div>
        )}
      </div>

      <div className="cash-feuille mx-auto my-8 max-w-4xl bg-white p-10 text-black shadow-sm">
        <header className="cash-bloc border-b-2 border-black pb-4 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide">
            {ecole || "Établissement"}
          </h1>

          <p className="mt-2 text-xl font-bold">État de caisse journalier</p>

          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm">
            <span>
              <strong>Journée :</strong>{" "}
              {new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>

            <span>
              <strong>Édité le :</strong>{" "}
              {new Date().toLocaleDateString("fr-FR")} à{" "}
              {new Date().toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </header>

        {chargement ? (
          <p className="mt-10 text-center text-sm">Établissement de l&apos;état...</p>
        ) : (
          <>
            {/* ---------- Totaux ---------- */}
            <section className="cash-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                I. Récapitulatif
              </h2>

              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-2 font-medium">
                      Total encaissé
                    </td>
                    <td className="border border-black px-2 py-2 text-end text-base font-bold tabular-nums">
                      {montant(totaux?.encaisse)}
                    </td>
                    <td className="border border-black px-2 py-2 font-medium">
                      Reçus émis
                    </td>
                    <td className="border border-black px-2 py-2 text-end tabular-nums">
                      {totaux?.nombre ?? 0}
                    </td>
                  </tr>

                  <tr>
                    <td className="border border-black px-2 py-2 font-medium">
                      Dont annulé
                    </td>
                    <td className="border border-black px-2 py-2 text-end font-bold tabular-nums">
                      {montant(totaux?.annule)}
                    </td>
                    <td className="border border-black px-2 py-2 font-medium">
                      Reçus annulés
                    </td>
                    <td className="border border-black px-2 py-2 text-end tabular-nums">
                      {totaux?.nombre_annule ?? 0}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-2 text-xs italic">
                Le total encaissé exclut les reçus annulés. Ceux-ci restent
                détaillés en section IV : un encaissement ne s&apos;efface
                pas, il s&apos;annule avec un motif.
              </p>
            </section>

            {/* ---------- Par mode ---------- */}
            <section className="cash-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                II. Ventilation par mode de paiement
              </h2>

              {parMode.length === 0 ? (
                <p className="text-sm">Aucun encaissement ce jour.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-2 py-1.5 text-start">
                        Mode
                      </th>
                      <th className="border border-black px-2 py-1.5">Reçus</th>
                      <th className="border border-black px-2 py-1.5 text-end">
                        Montant
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {parMode.map((ligne) => (
                      <tr key={ligne.mode}>
                        <td className="border border-black px-2 py-1.5">
                          {LIBELLE_MODE[ligne.mode] ?? ligne.mode}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                          {ligne.nombre}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-end tabular-nums">
                          {montant(ligne.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* ---------- Par encaisseur ---------- */}
            <section className="cash-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                III. Ventilation par personne ayant encaissé
              </h2>

              {parEncaisseur.length === 0 ? (
                <p className="text-sm">Aucun encaissement ce jour.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-2 py-1.5 text-start">
                        Personne
                      </th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Rôle
                      </th>
                      <th className="border border-black px-2 py-1.5">Reçus</th>
                      <th className="border border-black px-2 py-1.5 text-end">
                        Montant
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {parEncaisseur.map((ligne) => (
                      <tr key={ligne.encaisseur + ligne.role_encaisseur}>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.encaisseur}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {LIBELLE_ROLE[ligne.role_encaisseur] ??
                            ligne.role_encaisseur}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                          {ligne.nombre}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-end tabular-nums">
                          {montant(ligne.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* ---------- Annulations ---------- */}
            <section className="cash-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                IV. Annulations du jour
              </h2>

              {annulations.length === 0 ? (
                <p className="text-sm">Aucune annulation ce jour.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-2 py-1.5">Reçu</th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Élève
                      </th>
                      <th className="border border-black px-2 py-1.5 text-end">
                        Montant
                      </th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Annulé par
                      </th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Motif
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {annulations.map((ligne) => (
                      <tr key={ligne.recu}>
                        <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                          {ligne.recu}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.eleve}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-end tabular-nums">
                          {montant(ligne.montant)}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.annule_par ?? "—"}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.motif}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* ---------- Détail ---------- */}
            <section className="cash-bloc mt-8">
              <h2 className="mb-3 text-base font-bold uppercase">
                V. Détail des reçus
              </h2>

              {lignes.length === 0 ? (
                <p className="text-sm">Aucun reçu émis ce jour.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="border border-black px-2 py-1.5">N°</th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Élève
                      </th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Mode
                      </th>
                      <th className="border border-black px-2 py-1.5 text-start">
                        Encaissé par
                      </th>
                      <th className="border border-black px-2 py-1.5 text-end">
                        Montant
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lignes.map((ligne) => (
                      <tr
                        key={ligne.recu}
                        style={
                          ligne.annule_le
                            ? { textDecoration: "line-through", opacity: 0.65 }
                            : undefined
                        }
                      >
                        <td className="border border-black px-2 py-1.5 text-center tabular-nums">
                          {ligne.recu}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.eleve}
                          {ligne.annule_le && (
                            <span className="ms-2 text-xs font-bold">
                              ANNULÉ
                            </span>
                          )}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {LIBELLE_MODE[ligne.mode] ?? ligne.mode}
                        </td>
                        <td className="border border-black px-2 py-1.5">
                          {ligne.encaisseur}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-end tabular-nums">
                          {montant(ligne.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* ---------- Signatures ---------- */}
            <section className="cash-bloc mt-10 flex justify-between gap-8">
              <div className="w-64">
                <p className="text-sm font-semibold">Le Comptable</p>
                <p className="mt-1 text-xs italic">Nom et signature</p>
                <div className="mt-14 border-t border-black" />
              </div>

              <div className="w-64 text-end">
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
