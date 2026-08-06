"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Logo } from "@/components/logo"
import type { DossierParent } from "@/src/lib/dossier-parent"

/*
 * L'espace des familles.
 *
 * =====================================================================
 * ÉCRIT POUR UN TÉLÉPHONE, ET POUR QUELQU'UN QUI N'EST PAS DU MÉTIER
 * =====================================================================
 *
 * Le lecteur n'est ni directeur ni enseignant : c'est un parent, debout,
 * sur un écran de six pouces, avec une connexion irrégulière. Trois
 * conséquences tenues tout au long de cette page :
 *
 *   ON RÉPOND D'ABORD À LA QUESTION QU'IL SE POSE. Elle n'est pas
 *   « quelle est la moyenne pondérée par coefficient » mais « est-ce que
 *   ça va, et est-ce que je dois de l'argent ». Ces deux réponses sont
 *   en haut, en gros ;
 *
 *   AUCUN JARGON. Pas de « évaluation sommative », pas de « coefficient
 *   pondéré », pas de « créneau ». Une absence est une absence ;
 *
 *   RIEN QU'IL NE PUISSE CHANGER. Il n'y a aucun bouton d'action : ce
 *   qui se conteste se conteste auprès de l'école, dont le téléphone est
 *   affiché en bas. Un formulaire de réclamation donnerait l'illusion
 *   d'un recours qui n'existe pas dans le logiciel.
 *
 * =====================================================================
 * LE CODE NE VOYAGE PAS DANS L'URL
 * =====================================================================
 *
 * Il est saisi dans un formulaire, envoyé en POST, et le serveur pose
 * un cookie. Un code dans l'adresse finirait dans l'historique du
 * téléphone — souvent partagé — et dans l'en-tête `Referer` du site
 * suivant.
 */

const NUIT = "oklch(17% 0.018 55)"
const SABLE = "oklch(95% 0.015 85)"
const OR = "oklch(80% 0.15 78)"
const VERT = "oklch(60% 0.13 155)"
const ARGILE = "oklch(60% 0.17 38)"
const TRAIT = "oklch(95% 0.015 85 / 0.12)"
const DOUCE = "oklch(22% 0.02 55)"
const ESTOMPE = "oklch(95% 0.015 85 / 0.62)"

const display = "var(--font-bricolage), sans-serif"

function montant(valeur: number) {
  return `${Math.round(valeur).toLocaleString("fr-FR")} F`
}

function jour(date: string) {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })
}

export default function ParentPage() {
  const [dossier, setDossier] = useState<DossierParent | null>(null)
  const [code, setCode] = useState("")
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Une session déjà ouverte évite de retaper le code à chaque visite. */
  const reprendre = useCallback(async () => {
    const reponse = await fetch("/api/parent").catch(() => null)

    if (reponse?.ok) {
      const donnees = await reponse.json()
      setDossier(donnees.dossier)
    }

    setChargement(false)
  }, [])

  useEffect(() => {
    async function lancer() {
      await reprendre()
    }

    lancer()
  }, [reprendre])

  async function entrer(event: React.FormEvent) {
    event.preventDefault()
    setErreur(null)
    setEnvoi(true)

    const reponse = await fetch("/api/parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null)

    const donnees = await reponse?.json().catch(() => null)

    setEnvoi(false)

    if (!reponse?.ok) {
      setErreur(donnees?.error ?? "Ce code n'a pas pu être vérifié.")
      return
    }

    setCode("")
    setDossier(donnees.dossier)
  }

  async function sortir() {
    await fetch("/api/parent", { method: "DELETE" })
    setDossier(null)
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-manrope), sans-serif",
        background: NUIT,
        color: SABLE,
        minHeight: "100vh",
      }}
    >
      <style>{`
        @media (max-width: 700px) {
          .p-pad { padding-left: 20px !important; padding-right: 20px !important; }
          .p-titre { font-size: 30px !important; }
          .p-cles { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <nav
        className="p-pad"
        style={{
          padding: "18px 40px",
          borderBottom: `1px solid ${TRAIT}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "inline-flex" }}>
          <Logo dark />
        </Link>

        {dossier && (
          <button
            onClick={sortir}
            style={{
              padding: "8px 16px",
              borderRadius: 100,
              border: `1px solid ${TRAIT}`,
              background: "transparent",
              color: ESTOMPE,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Fermer
          </button>
        )}
      </nav>

      <main
        className="p-pad"
        style={{ padding: "48px 40px 80px", maxWidth: 780, margin: "0 auto" }}
      >
        {chargement ? (
          <p style={{ color: ESTOMPE }}>Un instant…</p>
        ) : !dossier ? (
          /* --------------------------------------------- la porte */
          <>
            <h1
              className="p-titre"
              style={{
                fontFamily: display,
                fontSize: 38,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                margin: "0 0 14px",
              }}
            >
              Suivre mon enfant.
            </h1>

            <p
              style={{
                fontSize: 17,
                lineHeight: 1.6,
                color: ESTOMPE,
                maxWidth: "42ch",
                margin: "0 0 34px",
              }}
            >
              Entrez le code que l&apos;école vous a remis. Vous verrez les
              notes, les absences et la situation de la scolarité.
            </p>

            <form
              onSubmit={entrer}
              style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Votre code"
                aria-label="Votre code d'accès"
                autoComplete="one-time-code"
                maxLength={12}
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  border: `1px solid ${TRAIT}`,
                  background: DOUCE,
                  color: SABLE,
                  fontSize: 22,
                  letterSpacing: "0.22em",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              />

              {erreur && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    color: ARGILE,
                    border: `1px solid oklch(60% 0.17 38 / 0.4)`,
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  {erreur}
                </p>
              )}

              <button
                type="submit"
                disabled={envoi || !code.trim()}
                style={{
                  padding: "15px 24px",
                  borderRadius: 12,
                  border: "none",
                  background: OR,
                  color: "oklch(20% 0.02 60)",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: envoi || !code.trim() ? "default" : "pointer",
                  opacity: envoi || !code.trim() ? 0.5 : 1,
                }}
              >
                {envoi ? "Vérification…" : "Voir le dossier"}
              </button>
            </form>

            <p
              style={{
                marginTop: 30,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: "oklch(95% 0.015 85 / 0.45)",
                maxWidth: "44ch",
              }}
            >
              Vous n&apos;avez pas de code ? Demandez-le au secrétariat de
              l&apos;école. Il est personnel à votre enfant.
            </p>
          </>
        ) : (
          /* ------------------------------------------- le dossier */
          <>
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: OR,
                margin: "0 0 10px",
              }}
            >
              {dossier.ecole.nom}
            </p>

            <h1
              className="p-titre"
              style={{
                fontFamily: display,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                margin: "0 0 6px",
              }}
            >
              {dossier.eleve.nom}
            </h1>

            <p style={{ color: ESTOMPE, margin: "0 0 32px", fontSize: 16 }}>
              {[dossier.eleve.classe, dossier.eleve.annee]
                .filter(Boolean)
                .join(" · ") || "Classe non renseignée"}
            </p>

            {/*
              LES DEUX RÉPONSES QU'IL EST VENU CHERCHER, en haut et en
              gros : est-ce que ça va, et est-ce que je dois de l'argent.
            */}
            <div
              className="p-cles"
              style={{
                display: "grid",
                gridTemplateColumns: dossier.scolarite ? "1fr 1fr" : "1fr",
                gap: 12,
                marginBottom: 40,
              }}
            >
              <Cle
                titre="Moyenne générale"
                valeur={
                  dossier.moyenneGenerale !== null
                    ? dossier.moyenneGenerale.toFixed(2).replace(".", ",")
                    : "—"
                }
                note={
                  dossier.moyenneGenerale !== null
                    ? "sur 20"
                    : "aucune note enregistrée"
                }
                couleur={
                  dossier.moyenneGenerale === null
                    ? ESTOMPE
                    : dossier.moyenneGenerale >= 10
                      ? VERT
                      : ARGILE
                }
              />

              {dossier.scolarite && (
                <Cle
                  titre="Reste à payer"
                  valeur={montant(dossier.scolarite.reste)}
                  note={`${montant(dossier.scolarite.paye)} versés sur ${montant(dossier.scolarite.du)}`}
                  couleur={dossier.scolarite.reste > 0 ? ARGILE : VERT}
                />
              )}
            </div>

            <Bloc titre="Les notes par matière">
              {dossier.matieres.length === 0 ? (
                <Vide>Aucune note n&apos;a encore été enregistrée.</Vide>
              ) : (
                <ul style={liste}>
                  {dossier.matieres.map((m) => (
                    <li key={m.matiere} style={ligne}>
                      <span>{m.matiere}</span>

                      <span
                        style={{
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color:
                            m.moyenne === null
                              ? ESTOMPE
                              : m.moyenne >= 10
                                ? VERT
                                : ARGILE,
                        }}
                      >
                        {m.moyenne !== null
                          ? m.moyenne.toFixed(2).replace(".", ",")
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloc>

            <Bloc titre="Absences et retards">
              {dossier.absences.length === 0 ? (
                <Vide>Aucune absence cette année. C&apos;est une bonne nouvelle.</Vide>
              ) : (
                <ul style={liste}>
                  {dossier.absences.map((a, i) => (
                    <li key={i} style={ligne}>
                      <span>
                        {jour(a.date)}
                        {a.matiere && (
                          <span style={{ color: ESTOMPE }}> · {a.matiere}</span>
                        )}
                      </span>

                      <span style={{ color: ESTOMPE, fontSize: 14.5 }}>
                        {a.statut}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloc>

            {dossier.discipline.length > 0 && (
              <Bloc titre="Vie scolaire">
                <ul style={liste}>
                  {dossier.discipline.map((d, i) => (
                    <li key={i} style={{ ...ligne, alignItems: "start" }}>
                      <span>
                        <span style={{ color: ESTOMPE }}>{jour(d.date)}</span>{" "}
                        {d.type}
                        {d.motif && (
                          <span style={{ display: "block", fontSize: 14.5, color: ESTOMPE }}>
                            {d.motif}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloc>
            )}

            <p
              style={{
                marginTop: 40,
                paddingTop: 22,
                borderTop: `1px solid ${TRAIT}`,
                fontSize: 14.5,
                lineHeight: 1.65,
                color: "oklch(95% 0.015 85 / 0.5)",
              }}
            >
              Une question sur ce dossier ? Adressez-vous à l&apos;école
              {dossier.ecole.telephone ? ` au ${dossier.ecole.telephone}` : ""}.
              Cette page est en lecture seule : rien de ce qui s&apos;y trouve
              ne se corrige ici.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Cle({
  titre,
  valeur,
  note,
  couleur,
}: {
  titre: string
  valeur: string
  note: string
  couleur: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${TRAIT}`,
        borderRadius: 16,
        padding: "20px 22px",
        background: DOUCE,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: ESTOMPE,
        }}
      >
        {titre}
      </p>

      <p
        style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: couleur,
        }}
      >
        {valeur}
      </p>

      <p style={{ margin: "4px 0 0", fontSize: 13.5, color: ESTOMPE }}>{note}</p>
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: ESTOMPE,
        }}
      >
        {titre}
      </h2>

      {children}
    </section>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 15.5,
        color: ESTOMPE,
        border: `1px solid ${TRAIT}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      {children}
    </p>
  )
}

const liste: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  border: `1px solid ${TRAIT}`,
  borderRadius: 14,
  overflow: "hidden",
}

const ligne: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  padding: "13px 18px",
  borderBottom: `1px solid ${TRAIT}`,
  fontSize: 15.5,
  background: DOUCE,
}
