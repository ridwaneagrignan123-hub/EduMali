"use client"

import { useRouter } from "next/navigation"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"

/*
 * Comptabilité — l'entrée unique des finances.
 *
 * ---------------------------------------------------------------------
 * CE QUE CETTE PAGE EST, ET CE QU'ELLE N'EST PAS
 *
 * Le menu montrait trois entrées financières séparées — Frais scolaires,
 * Paie, État de caisse — alors qu'elles relèvent d'un seul métier et
 * d'un seul jeu de rôles. Elles sont regroupées ici.
 *
 * Ce n'est PAS une réécriture : les trois écrans existent tels quels et
 * gardent chacun leur propre garde de rôle. Cette page est un point
 * d'entrée, rien de plus.
 * ---------------------------------------------------------------------
 *
 * LA SÉCURITÉ NE TIENT PAS À CE MENU. Chaque page appelée porte déjà son
 * `useRoleGate(["promoteur", "comptable"])`, et les fonctions
 * en base — `cash_report_*`, `payroll_month` — revérifient
 * `can_see_money()`. Retirer une entrée du menu ne protège rien : cela
 * évite seulement de proposer une porte qui se refermerait au nez.
 *
 * Les directeurs en sont exclus, comme partout sur l'argent : le
 * directeur général voit l'établissement entier sauf les finances.
 */

/* Aligné sur can_see_money(). Les directeurs en sont volontairement absents. */
const ROLES_AUTORISES = ["promoteur", "comptable"]

type Tableau = {
  titre: string
  chemin: string
  description: string
  detail: string
}

const TABLEAUX: Tableau[] = [
  {
    titre: "Frais et versements",
    chemin: "/fees",
    description:
      "Définir les frais dus par élève, enregistrer les versements, suivre les restes à payer.",
    detail:
      "Chaque encaissement porte un numéro de reçu et le nom de celui qui l'a reçu.",
  },
  {
    titre: "État de caisse",
    chemin: "/cash-report",
    description:
      "Ce qui est entré en caisse sur une période, par encaisseur et par moyen de paiement.",
    detail: "Imprimable, annulations comprises avec leur motif.",
  },
  {
    titre: "Paie",
    chemin: "/payroll",
    description:
      "Ce que l'établissement doit à chaque enseignant pour le mois, et la clôture.",
    detail:
      "Un vacataire est payé sur ses heures confirmées par pointage ; un permanent est mensualisé.",
  },
]

export default function AccountingPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES, { comptabilite: true })

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">Comptabilité</h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Les tableaux financiers de l&apos;établissement.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>

        <nav className="space-y-3">
          {TABLEAUX.map((tableau) => (
            <button
              key={tableau.chemin}
              onClick={() => router.push(tableau.chemin)}
              className="block w-full rounded-xl border bg-background p-6 text-start hover:bg-muted/50"
            >
              <p className="font-heading text-lg font-bold">{tableau.titre}</p>

              <p className="mt-1 text-sm text-muted-foreground">
                {tableau.description}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                {tableau.detail}
              </p>
            </button>
          ))}
        </nav>

        <p className="text-xs text-muted-foreground">
          Ces tableaux sont réservés aux rôles financiers. Un enseignant ou
          un directeur n&apos;y a pas accès, y compris par un lien direct.
        </p>
      </section>
    </main>
  )
}
