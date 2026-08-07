"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"
import { CodeParent, etatAccesCourt } from "@/src/lib/acces-parent"
import { matchesSearch } from "@/src/lib/search"

/*
 * Les accÃ¨s des familles, vus d'ensemble.
 *
 * =====================================================================
 * POURQUOI CET Ã‰CRAN EXISTE
 * =====================================================================
 *
 * L'accÃ¨s d'une famille se gÃ¨re dÃ©jÃ  sur la fiche de l'Ã©lÃ¨ve, et c'est
 * le bon endroit quand un parent se prÃ©sente au guichet. Mais il ne
 * rÃ©pond Ã  aucune question qui porte sur l'Ã‰COLE : combien de familles
 * ont reÃ§u leur code, combien ne l'ont jamais ouvert, lesquelles
 * rappeler. Ã€ cinq cents Ã©lÃ¨ves, on n'ouvre pas cinq cents fiches.
 *
 * Cet Ã©cran ne remplace donc pas le bloc de la fiche : il le survole.
 *
 * =====================================================================
 * QUI ENTRE, QUI AGIT
 * =====================================================================
 *
 * La page s'ouvre Ã  tout l'encadrement â€” le promoteur doit pouvoir
 * mesurer l'adoption sans pouvoir ouvrir un accÃ¨s. Les boutons
 * n'apparaissent qu'au directeur, et c'est la base qui tranche :
 * l'Ã©criture repose sur private.encadrement_ecrit(), qui l'exclut.
 *
 * Le cloisonnement par direction est tenu en base lui aussi, sur les
 * Ã©lÃ¨ves ET sur les codes â€” voir supabase/codes-parents-cloisonnes.sql.
 * Un directeur ne voit ici que ses familles.
 */

const ROLES_PAGE = ["promoteur", "directeur_general", "directeur_direction"]
const ROLES_ECRITURE = ["directeur_general", "directeur_direction"]

type Eleve = {
  id: string
  first_name: string
  last_name: string
  classe: string | null
}

type Filtre = "toutes" | "sans_code" | "jamais_ouvert" | "a_relancer"

const FILTRES: { valeur: Filtre; label: string }[] = [
  { valeur: "toutes", label: "Toutes les familles" },
  { valeur: "sans_code", label: "Sans code" },
  { valeur: "jamais_ouvert", label: "Jamais ouvert" },
  { valeur: "a_relancer", label: "Ã€ relancer" },
]

export default function ParentsPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_PAGE)

  const [eleves, setEleves] = useState<Eleve[]>([])
  const [codes, setCodes] = useState<Record<string, CodeParent>>({})
  const [anneeNom, setAnneeNom] = useState<string | null>(null)

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [recherche, setRecherche] = useState("")
  const [filtre, setFiltre] = useState<Filtre>("toutes")
  const [enCours, setEnCours] = useState<string | null>(null)
  const [creationEnLot, setCreationEnLot] = useState(false)

  /*
   * L'Ã©cole et le rÃ´le viennent du garde, qui les a dÃ©jÃ  lus. Les relire
   * ici donnerait deux sources pour la mÃªme vÃ©ritÃ©.
   */
  const schoolId = gate.statut === "autorise" ? gate.schoolId : ""

  const peutEcrire =
    gate.statut === "autorise" && ROLES_ECRITURE.includes(gate.role)

  const charger = useCallback(async () => {
    if (gate.statut !== "autorise") {
      return
    }

    const ecole = gate.schoolId

    setChargement(true)
    setErreur(null)

    /*
     * L'annÃ©e active borne la CLASSE affichÃ©e, pas la liste des Ã©lÃ¨ves.
     * Sans elle on montrerait la classe de l'an dernier Ã  cÃ´tÃ© du nom â€”
     * pire qu'aucune classe, parce que Ã§a se lit sans se mÃ©fier.
     */
    const { data: annee } = await supabase
      .from("academic_years")
      .select("id, name")
      .eq("school_id", ecole)
      .eq("is_active", true)
      .maybeSingle()

    setAnneeNom(annee?.name ?? null)

    const [elevesResult, inscriptionsResult, codesResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", ecole)
        .order("last_name"),

      annee
        ? supabase
            .from("student_class_enrollments")
            .select("student_id, classes ( name )")
            .eq("school_id", ecole)
            .eq("academic_year_id", annee.id)
        : Promise.resolve({ data: [], error: null }),

      /*
       * Les codes RETIRÃ‰S sont Ã©cartÃ©s ici : une famille dont l'accÃ¨s a
       * Ã©tÃ© rÃ©voquÃ© est, pour cet Ã©cran, une famille sans code â€” c'est
       * exactement ce qu'il faut lui refaire.
       */
      supabase
        .from("student_access_codes")
        .select("id, student_id, code, created_at, last_used_at, opened_count")
        .eq("school_id", ecole)
        .is("revoked_at", null),
    ])

    if (elevesResult.error) {
      console.error("Erreur Ã©lÃ¨ves :", elevesResult.error)
      setErreur("La liste des Ã©lÃ¨ves n'a pas pu Ãªtre chargÃ©e.")
      setChargement(false)
      return
    }

    const classeParEleve = new Map<string, string>()

    for (const ligne of (inscriptionsResult.data ?? []) as unknown as {
      student_id: string
      classes: { name: string } | null
    }[]) {
      if (ligne.classes?.name) {
        classeParEleve.set(ligne.student_id, ligne.classes.name)
      }
    }

    setEleves(
      (elevesResult.data ?? []).map((eleve) => ({
        id: eleve.id,
        first_name: eleve.first_name,
        last_name: eleve.last_name,
        classe: classeParEleve.get(eleve.id) ?? null,
      }))
    )

    if (codesResult.error) {
      console.error("Erreur codes :", codesResult.error)
      setErreur("Les accÃ¨s des familles n'ont pas pu Ãªtre lus.")
      setCodes({})
    } else {
      const parEleve: Record<string, CodeParent> = {}

      for (const code of (codesResult.data ?? []) as unknown as (CodeParent & {
        student_id: string
      })[]) {
        parEleve[code.student_id] = code
      }

      setCodes(parEleve)
    }

    setChargement(false)
  }, [gate])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  const compteurs = useMemo(() => {
    let avecCode = 0
    let jamaisOuvert = 0
    let aRelancer = 0

    for (const eleve of eleves) {
      const code = codes[eleve.id]

      if (!code) continue

      avecCode += 1

      if (code.opened_count === 0) {
        jamaisOuvert += 1

        if (etatAccesCourt(code).alerte) {
          aRelancer += 1
        }
      }
    }

    return {
      total: eleves.length,
      avecCode,
      sansCode: eleves.length - avecCode,
      jamaisOuvert,
      aRelancer,
    }
  }, [eleves, codes])

  const listeFiltree = useMemo(() => {
    return eleves.filter((eleve) => {
      const code = codes[eleve.id] ?? null

      if (filtre === "sans_code" && code) return false
      if (filtre === "jamais_ouvert" && (!code || code.opened_count > 0)) {
        return false
      }
      if (filtre === "a_relancer" && !(code && etatAccesCourt(code).alerte)) {
        return false
      }

      return matchesSearch(
        recherche,
        eleve.first_name,
        eleve.last_name,
        eleve.classe,
        code?.code
      )
    })
  }, [eleves, codes, filtre, recherche])

  const sansCode = useMemo(
    () => eleves.filter((eleve) => !codes[eleve.id]),
    [eleves, codes]
  )

  async function creerPour(eleveIds: string[]) {
    setErreur(null)
    setMessage(null)

    if (eleveIds.length === 0) {
      return
    }

    /*
     * `code` part vide : le dÃ©clencheur en base l'Ã©crase. Une valeur
     * choisie ici serait ignorÃ©e â€” mesurÃ©.
     */
    const { error } = await supabase.from("student_access_codes").insert(
      eleveIds.map((studentId) => ({
        school_id: schoolId,
        student_id: studentId,
        code: "",
      }))
    )

    if (error) {
      console.error("CrÃ©ation des accÃ¨s :", error)

      setErreur(
        error.message.includes("row-level security")
          ? "Seule la direction peut ouvrir un accÃ¨s famille."
          : "Les accÃ¨s n'ont pas pu Ãªtre crÃ©Ã©s."
      )

      return
    }

    setMessage(
      eleveIds.length === 1
        ? "AccÃ¨s crÃ©Ã©. Le code est Ã  remettre sur papier."
        : `${eleveIds.length} accÃ¨s crÃ©Ã©s. Imprimez la liste pour la distribution.`
    )

    await charger()
  }

  async function retirer(eleve: Eleve) {
    const code = codes[eleve.id]

    if (!code) return

    if (
      !confirm(
        `Retirer l'accÃ¨s de la famille de ${eleve.last_name} ${eleve.first_name} ?\n\nLe code ${code.code} cessera immÃ©diatement de fonctionner, y compris pour un parent dÃ©jÃ  connectÃ©. Vous pourrez en crÃ©er un nouveau.`
      )
    ) {
      return
    }

    setErreur(null)
    setMessage(null)
    setEnCours(eleve.id)

    const { error } = await supabase
      .from("student_access_codes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", code.id)

    setEnCours(null)

    if (error) {
      console.error("Retrait de l'accÃ¨s :", error)
      setErreur("L'accÃ¨s n'a pas pu Ãªtre retirÃ©.")
      return
    }

    await charger()
  }

  if (gate.statut === "chargement") {
    return <ChargementPage />
  }

  if (gate.statut === "refuse") {
    return <AccesRefuse role={gate.role} />
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">AccÃ¨s des familles</p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <h2 className="text-3xl font-bold">Parents</h2>

          <p className="mt-2 text-muted-foreground">
            Un code par Ã©lÃ¨ve, remis sur papier, qui ouvre le dossier de
            l&apos;enfant en lecture seule.
            {anneeNom ? ` Classes de l'annÃ©e ${anneeNom}.` : ""}
          </p>
        </div>

        {!anneeNom && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Aucune annÃ©e scolaire active : les classes ne peuvent pas Ãªtre
            affichÃ©es. Les accÃ¨s, eux, restent gÃ©rables.
          </div>
        )}

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {message && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            {message}
          </div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Chargementâ€¦</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Compteur titre="Familles" valeur={compteurs.total} />
              <Compteur titre="Sans code" valeur={compteurs.sansCode} />
              <Compteur titre="Jamais ouvert" valeur={compteurs.jamaisOuvert} />
              {/*
                Le seul chiffre qui appelle un geste : un code remis il y
                a plus de quinze jours et jamais ouvert. Il porte donc la
                couleur, et lui seul.
              */}
              <Compteur
                titre="Ã€ relancer"
                valeur={compteurs.aRelancer}
                alerte={compteurs.aRelancer > 0}
              />
            </div>

            {peutEcrire && sansCode.length > 0 && (
              <div className="rounded-xl border bg-background p-5">
                <p className="font-medium">
                  {sansCode.length} famille(s) n&apos;ont pas encore de code.
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Les crÃ©er en une fois Ã©vite d&apos;ouvrir autant de fiches.
                  Chaque code est ensuite Ã  remettre sur papier, Ã©lÃ¨ve par
                  Ã©lÃ¨ve.
                </p>

                <button
                  type="button"
                  disabled={creationEnLot}
                  onClick={async () => {
                    if (
                      !confirm(
                        `CrÃ©er un code pour les ${sansCode.length} famille(s) qui n'en ont pas ?`
                      )
                    ) {
                      return
                    }

                    setCreationEnLot(true)
                    await creerPour(sansCode.map((eleve) => eleve.id))
                    setCreationEnLot(false)
                  }}
                  className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creationEnLot
                    ? "CrÃ©ationâ€¦"
                    : `CrÃ©er les ${sansCode.length} codes manquants`}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={recherche}
                onChange={(event) => setRecherche(event.target.value)}
                placeholder="Rechercher un Ã©lÃ¨ve, une classe, un codeâ€¦"
                className="min-w-64 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />

              <label htmlFor="filtre" className="sr-only">
                Filtrer les familles
              </label>

              <select
                id="filtre"
                value={filtre}
                onChange={(event) => setFiltre(event.target.value as Filtre)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {FILTRES.map((item) => (
                  <option key={item.valeur} value={item.valeur}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border bg-background">
              {eleves.length === 0 ? (
                <p className="p-6 text-muted-foreground">
                  Aucun Ã©lÃ¨ve dans votre pÃ©rimÃ¨tre. Les accÃ¨s familles
                  apparaÃ®tront ici dÃ¨s qu&apos;un Ã©lÃ¨ve sera inscrit.
                </p>
              ) : listeFiltree.length === 0 ? (
                <p className="p-6 text-muted-foreground">
                  Aucune famille ne correspond Ã  ce filtre.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-start text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-start">Ã‰lÃ¨ve</th>
                        <th className="px-4 py-3 text-start">Classe</th>
                        <th className="px-4 py-3 text-start">Code</th>
                        <th className="px-4 py-3 text-start">Ã‰tat</th>
                        {peutEcrire && (
                          <th className="px-4 py-3 text-end">Action</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {listeFiltree.map((eleve) => {
                        const code = codes[eleve.id] ?? null
                        const etat = etatAccesCourt(code)

                        return (
                          <tr key={eleve.id} className="border-b last:border-0">
                            <td className="px-4 py-3 font-medium">
                              {eleve.last_name} {eleve.first_name}
                            </td>

                            <td className="px-4 py-3 text-muted-foreground">
                              {eleve.classe ?? "â€”"}
                            </td>

                            <td className="px-4 py-3">
                              {code ? (
                                <span className="font-mono tracking-widest">
                                  {code.code}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">â€”</span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={
                                  etat.alerte
                                    ? "font-medium"
                                    : "text-muted-foreground"
                                }
                                style={
                                  etat.alerte
                                    ? { color: "oklch(0.47 0.14 78)" }
                                    : undefined
                                }
                              >
                                {etat.titre}
                              </span>

                              {etat.detail && (
                                <span className="text-xs text-muted-foreground">
                                  {" Â· "}
                                  {etat.detail}
                                </span>
                              )}
                            </td>

                            {peutEcrire && (
                              <td className="px-4 py-3 text-end">
                                {code ? (
                                  <button
                                    type="button"
                                    disabled={enCours === eleve.id}
                                    onClick={() => retirer(eleve)}
                                    className="rounded-md border px-3 py-1.5 text-xs text-destructive hover:bg-muted disabled:opacity-50"
                                  >
                                    Retirer
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={enCours === eleve.id}
                                    onClick={async () => {
                                      setEnCours(eleve.id)
                                      await creerPour([eleve.id])
                                      setEnCours(null)
                                    }}
                                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                                  >
                                    CrÃ©er le code
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function Compteur({
  titre,
  valeur,
  alerte = false,
}: {
  titre: string
  valeur: number
  alerte?: boolean
}) {
  return (
    <div
      className="rounded-xl border bg-background p-4"
      style={
        alerte
          ? {
              background: "oklch(0.80 0.14 78 / 0.12)",
              borderColor: "oklch(0.57 0.14 78 / 0.5)",
            }
          : undefined
      }
    >
      <p className="text-xs uppercase text-muted-foreground">{titre}</p>
      <p className="mt-1 text-3xl font-bold">{valeur}</p>
    </div>
  )
}

