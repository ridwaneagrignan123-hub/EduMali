"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { roleLabel } from "@/src/lib/roles"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"

/*
 * Journal d'activité de l'établissement.
 *
 * Les lignes sont écrites par des déclencheurs en SECURITY DEFINER :
 * personne ne peut en insérer, en modifier ni en supprimer depuis
 * l'application. Un journal que l'on peut retoucher ne vaut rien.
 *
 * La page est ouverte au promoteur et à l'admin ; le RLS le vérifie de
 * son côté, cet écran ne fait que l'annoncer proprement.
 */

/*
 * Le directeur général est admis ici, mais le RLS lui retire les lignes
 * financières : il voit passer les notes, les élèves et les comptes,
 * jamais un montant. Cet écran n'a donc rien à filtrer lui-même — et il
 * ne le doit pas, un filtre côté navigateur ne protégeant rien.
 */
const ROLES_AUTORISES = ["promoteur", "directeur_general"]

const PAGE = 50

type Entree = {
  id: string
  actor_name: string | null
  actor_role: string | null
  action: string
  entity: string
  summary: string
  created_at: string
}

const LIBELLE_ACTION: Record<string, string> = {
  creation: "a créé",
  modification: "a modifié",
  suppression: "a supprimé",
}

const LIBELLE_ENTITE: Record<string, string> = {
  note: "une note",
  evaluation: "une évaluation",
  paiement: "un paiement",
  frais: "un frais",
  montant_reference: "un montant de référence",
  eleve: "un élève",
  inscription: "une inscription",
  classe: "une classe",
  matiere: "une matière",
  affectation: "une affectation",
  enseignant: "un enseignant",
  compte: "un compte",
  presence: "une présence",
  retard: "un retard d'enseignant",
  theme: "un thème au rang",
  rappel: "un rappel",
  emploi_du_temps: "un créneau",
  annee: "une année scolaire",
  periode: "une période",
  direction: "une direction",
}

/* Une couleur par famille : pédagogie, argent, personnes, vie scolaire. */
const COULEUR_ENTITE: Record<string, string> = {
  note: "oklch(0.55 0.13 155)",
  evaluation: "oklch(0.55 0.13 155)",
  paiement: "oklch(0.585 0.16 38)",
  frais: "oklch(0.585 0.16 38)",
  montant_reference: "oklch(0.585 0.16 38)",
  eleve: "oklch(0.55 0.12 250)",
  inscription: "oklch(0.55 0.12 250)",
  enseignant: "oklch(0.55 0.12 250)",
  compte: "oklch(0.55 0.12 250)",
  classe: "oklch(0.5 0.1 300)",
  matiere: "oklch(0.5 0.1 300)",
  affectation: "oklch(0.5 0.1 300)",
  annee: "oklch(0.5 0.1 300)",
  periode: "oklch(0.5 0.1 300)",
  direction: "oklch(0.5 0.1 300)",
  presence: "oklch(0.55 0.14 78)",
  retard: "oklch(0.55 0.14 78)",
  theme: "oklch(0.55 0.14 78)",
  rappel: "oklch(0.55 0.14 78)",
  emploi_du_temps: "oklch(0.55 0.14 78)",
}

/*
 * Familles de filtres plutôt qu'une puce par type : vingt puces ne
 * tiendraient sur aucun téléphone.
 */
const FAMILLES: [string, string, string[]][] = [
  ["tout", "Tout", []],
  ["pedagogie", "Pédagogie", ["note", "evaluation"]],
  ["eleves", "Élèves", ["eleve", "inscription", "presence"]],
  ["argent", "Finances", ["paiement", "frais", "montant_reference"]],
  ["personnes", "Comptes", ["enseignant", "compte"]],
  [
    "vie_scolaire",
    "Vie scolaire",
    ["retard", "theme", "rappel", "emploi_du_temps"],
  ],
  [
    "structure",
    "Structure",
    ["classe", "matiere", "affectation", "annee", "periode", "direction"],
  ],
]

export default function ActivityPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES)

  const [entrees, setEntrees] = useState<Entree[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<string>("tout")
  const [pageIndex, setPageIndex] = useState(0)
  const [encore, setEncore] = useState(false)

  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    /*
     * Le drapeau évite qu'une réponse lente d'une page précédente vienne
     * écraser celle de la page en cours. On peut cliquer « Plus ancien »
     * plus vite que le réseau ne répond, surtout ici.
     */
    let annule = false

    async function charger() {
      /*
       * On demande une ligne de plus que la page : sa présence dit s'il
       * reste quelque chose à afficher, sans second appel de comptage.
       */
      const { data, error } = await supabase
        .from("activity_log")
        .select(
          "id, actor_name, actor_role, action, entity, summary, created_at"
        )
        .order("created_at", { ascending: false })
        .range(pageIndex * PAGE, pageIndex * PAGE + PAGE)

      if (annule) {
        return
      }

      if (error) {
        console.error("Erreur journal d'activité :", error)
        setErreur("Impossible de charger le journal. Réessayez dans un instant.")
        setChargement(false)
        return
      }

      const lignes = data ?? []
      setErreur(null)
      setEncore(lignes.length > PAGE)
      setEntrees(lignes.slice(0, PAGE))
      setChargement(false)
    }

    charger()

    return () => {
      annule = true
    }
  }, [gate.statut, pageIndex])

  const groupes = useMemo(() => {
    const famille = FAMILLES.find(([cle]) => cle === filtre)

    const visibles =
      !famille || famille[2].length === 0
        ? entrees
        : entrees.filter((entree) => famille[2].includes(entree.entity))

    const parJour = new Map<string, Entree[]>()

    for (const entree of visibles) {
      const jour = new Date(entree.created_at).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })

      parJour.set(jour, [...(parJour.get(jour) ?? []), entree])
    }

    return [...parJour.entries()]
  }, [entrees, filtre])

  if (gate.statut === "chargement") {
    return <ChargementPage />
  }

  if (gate.statut === "refuse") {
    return <AccesRefuse role={gate.role} />
  }

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Activité</h1>

            <p className="mt-2 text-muted-foreground">
              Ce qui s&apos;est passé sur la plateforme, du plus récent au
              plus ancien.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FAMILLES.map(([valeur, libelle]) => (
            <button
              key={valeur}
              onClick={() => setFiltre(valeur)}
              className={
                filtre === valeur
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border px-4 py-1.5 text-sm hover:bg-muted"
              }
            >
              {libelle}
            </button>
          ))}
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Chargement du journal...</p>
        ) : groupes.length === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center">
            <p className="text-muted-foreground">
              {filtre === "tout"
                ? "Rien n'a encore été enregistré. Le journal se remplira dès les premières saisies."
                : "Aucune entrée de ce type sur cette page."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupes.map(([jour, lignes]) => (
              <div key={jour}>
                <h2 className="mb-2 text-sm font-medium capitalize text-muted-foreground">
                  {jour}
                </h2>

                <div className="overflow-hidden rounded-xl border bg-background">
                  {lignes.map((entree, index) => (
                    <div
                      key={entree.id}
                      className={
                        index === 0
                          ? "flex gap-4 p-4"
                          : "flex gap-4 border-t p-4"
                      }
                    >
                      <div className="w-14 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {new Date(entree.created_at).toLocaleTimeString(
                          "fr-FR",
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </div>

                      <div
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background:
                            COULEUR_ENTITE[entree.entity] ??
                            "oklch(0.6 0.02 60)",
                        }}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <strong>
                            {/*
                              Un profil sans nom renvoie null : on retombe
                              sur le rôle plutôt que d'afficher un vide.
                            */}
                            {entree.actor_name ?? roleLabel(entree.actor_role)}
                          </strong>{" "}
                          {LIBELLE_ACTION[entree.action] ?? entree.action}{" "}
                          {LIBELLE_ENTITE[entree.entity] ?? entree.entity}
                        </p>

                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {entree.summary}
                        </p>
                      </div>

                      {entree.actor_name && (
                        <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                          {roleLabel(entree.actor_role)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {(pageIndex > 0 || encore) && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setChargement(true)
                setPageIndex((n) => Math.max(0, n - 1))
              }}
              disabled={pageIndex === 0}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Plus récent
            </button>

            <span className="text-sm text-muted-foreground">
              Page {pageIndex + 1}
            </span>

            <button
              onClick={() => {
                setChargement(true)
                setPageIndex((n) => n + 1)
              }}
              disabled={!encore}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Plus ancien
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
