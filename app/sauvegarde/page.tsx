"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import {
  AccesRefuse,
  ChargementPage,
  useRoleGate,
} from "@/components/role-gate"
import {
  Avancement,
  NOMBRE_DE_FEUILLES,
  telechargerSauvegarde,
} from "@/src/lib/sauvegarde"

/*
 * La sauvegarde téléchargeable — la copie du promoteur.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CET ÉCRAN EXISTE
 *
 * Une école confie ses effectifs, ses notes et sa comptabilité à un
 * logiciel qu'elle n'héberge pas. La moindre des choses est qu'elle
 * puisse repartir avec, à tout moment, sans le demander à personne.
 * C'est autant une sécurité qu'une garantie : ces données lui
 * appartiennent.
 *
 * L'HONNÊTETÉ SUR CE QUE C'EST. Une copie n'est pas une restauration.
 * Ce classeur se relit et se conserve ; il ne se réinjecte pas. Le
 * promettre serait la promesse la plus dangereuse de l'application —
 * on ne la découvrirait fausse que le jour où tout aurait été perdu.
 * ---------------------------------------------------------------------
 */

/* Le propriétaire de l'école, et lui seul. */
const ROLES_AUTORISES = ["promoteur"]

export default function SauvegardePage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES)

  const [nomEcole, setNomEcole] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [avancement, setAvancement] = useState<Avancement | null>(null)
  const [comptes, setComptes] = useState<
    { feuille: string; lignes: number }[] | null
  >(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    async function lireEcole() {
      const { data } = await supabase.from("schools").select("name").maybeSingle()

      setNomEcole(data?.name ?? "")
    }

    lireEcole()
  }, [])

  async function lancer() {
    setEnCours(true)
    setErreur(null)
    setComptes(null)

    try {
      const resultat = await telechargerSauvegarde(nomEcole, setAvancement)
      setComptes(resultat)
    } catch (error) {
      console.error("Erreur sauvegarde :", error)
      setErreur(
        error instanceof Error
          ? `La sauvegarde s'est interrompue — ${error.message}`
          : "La sauvegarde s'est interrompue."
      )
    } finally {
      setEnCours(false)
      setAvancement(null)
    }
  }

  if (gate.statut === "chargement") {
    return <ChargementPage />
  }

  if (gate.statut === "refuse") {
    return <AccesRefuse role={gate.role} />
  }

  const total = comptes?.reduce((somme, item) => somme + item.lignes, 0) ?? 0

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">Sauvegarde</p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au tableau de bord
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">Vos données, chez vous</h2>

          <p className="mt-2 text-muted-foreground">
            Téléchargez à tout moment un classeur Excel de toutes les
            données de {nomEcole || "votre établissement"} : une feuille
            par entité, lisible dans n&apos;importe quel tableur. C&apos;est
            votre copie — elle vous appartient, et vous n&apos;avez à la
            demander à personne.
          </p>
        </div>

        {/*
          Dire ce que ce n'est pas, aussi clairement que ce que c'est. Un
          promoteur qui croirait tenir un bouton de restauration ne
          découvrirait son erreur qu'au pire moment.
        */}
        <div
          className="rounded-xl border p-6"
          style={{
            background: "oklch(0.80 0.14 78 / 0.1)",
            borderColor: "oklch(0.57 0.14 78 / 0.4)",
          }}
        >
          <h3 className="font-semibold">Une copie, pas une restauration</h3>

          <p className="mt-2 text-sm">
            Ce fichier se conserve et se relit. Il ne se réinjecte
            <strong> pas </strong>
            dans l&apos;application : aucun bouton ne recrée une école à
            partir d&apos;un classeur.
          </p>

          <p className="mt-2 text-sm">
            La reprise après incident ne repose pas sur ce fichier mais sur
            les sauvegardes automatiques quotidiennes de l&apos;hébergeur,
            côté infrastructure. Celui-ci sert à deux autres choses, qui
            comptent autant : garder une trace hors ligne, et pouvoir
            partir avec vos données si vous le décidez.
          </p>
        </div>

        <div className="rounded-xl border bg-background p-6">
          <button
            onClick={lancer}
            disabled={enCours}
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {enCours ? "Préparation..." : "Télécharger la sauvegarde"}
          </button>

          <p className="mt-3 text-sm text-muted-foreground">
            {NOMBRE_DE_FEUILLES} feuilles : élèves, classes, inscriptions,
            matières, évaluations, notes, frais, paiements, présences,
            retenues, manquements, règlement, enseignants et emploi du
            temps.
          </p>

          {avancement && (
            <p className="mt-4 text-sm">
              Lecture {avancement.fait} / {avancement.total}
              {avancement.feuille ? ` — ${avancement.feuille}` : ""}
            </p>
          )}

          {erreur && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </div>
          )}

          {comptes && (
            <div className="mt-6">
              {/*
                Le compte par feuille : une sauvegarde muette ne rassure
                personne, et c'est ce qui permet de repérer une feuille
                anormalement vide.
              */}
              <p className="text-sm">
                Classeur téléchargé — <strong>{total}</strong> ligne(s) au
                total.
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Feuille</th>
                      <th className="p-2 font-medium">Lignes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {comptes.map((item) => (
                      <tr key={item.feuille} className="border-b">
                        <td className="p-2">{item.feuille}</td>
                        <td className="p-2">{item.lignes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Le classeur ne contient que les données de votre établissement.
          Ce n&apos;est pas cet écran qui le garantit : chaque lecture
          passe par les règles de cloisonnement de la base, les mêmes que
          celles de tous les autres écrans.
        </p>
      </section>
    </main>
  )
}
