"use client"

import { useRef, useState } from "react"

/*
 * L'assistant de révision, côté élève.
 *
 * ---------------------------------------------------------------------
 * IL NE S'AFFICHE QUE S'IL EST CONFIGURÉ
 *
 * La page décide en amont : sans clé d'API, ce composant n'est pas
 * monté du tout. Un champ de saisie qui répond « indisponible » à chaque
 * envoi est une promesse trahie à chaque clic.
 * ---------------------------------------------------------------------
 *
 * AUCUNE RÉPONSE N'EST FABRIQUÉE ICI. Quand le serveur ne rend pas de
 * texte, l'écran affiche un message d'état, visuellement distinct d'une
 * réponse — pas une phrase d'excuse qui se lirait comme une réponse.
 *
 * La conversation ne quitte pas la page : rien n'est enregistré, ni ici
 * ni en base. Un élève qui ferme l'onglet ne laisse rien derrière lui,
 * ce qui est la même règle que le reste de /annales.
 */

const OR = "oklch(80% 0.15 78)"
const SABLE = "oklch(95% 0.015 85)"
const TRAIT = "oklch(95% 0.015 85 / 0.12)"
const NUIT_DOUCE = "oklch(22% 0.02 55)"
const ESTOMPE = "oklch(95% 0.015 85 / 0.62)"

type Tour =
  | { role: "user" | "assistant"; contenu: string }
  | { role: "etat"; contenu: string }

export function AssistantRevision() {
  const [tours, setTours] = useState<Tour[]>([])
  const [question, setQuestion] = useState("")
  const [enCours, setEnCours] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  async function envoyer(event: React.FormEvent) {
    event.preventDefault()

    const texte = question.trim()

    if (!texte || enCours) {
      return
    }

    /*
     * Seuls les vrais tours partent au serveur. Les lignes d'état
     * (« l'assistant n'a pas répondu ») sont des messages d'interface :
     * les renvoyer les ferait passer pour des paroles de l'assistant au
     * tour suivant.
     */
    const historique = [...tours, { role: "user" as const, contenu: texte }]

    setTours(historique)
    setQuestion("")
    setEnCours(true)

    const reponse = await fetch("/api/annales/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: historique.filter(
          (tour): tour is { role: "user" | "assistant"; contenu: string } =>
            tour.role !== "etat"
        ),
      }),
    }).catch(() => null)

    const donnees = await reponse?.json().catch(() => null)

    setTours((actuels) => [
      ...actuels,
      donnees?.etat === "ok"
        ? { role: "assistant", contenu: donnees.texte }
        : {
            role: "etat",
            contenu:
              donnees?.message ??
              "L'assistant n'a pas répondu. Réessayez dans un instant.",
          },
    ])

    setEnCours(false)
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  return (
    <section
      style={{
        border: `1px solid ${TRAIT}`,
        borderRadius: 20,
        padding: "26px 24px",
        marginBottom: 46,
        background: NUIT_DOUCE,
      }}
    >
      <h2
        style={{
          margin: "0 0 6px",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        Une question sur un exercice ?
      </h2>

      <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.6, color: ESTOMPE }}>
        Posez-la. L&apos;assistant explique la méthode — il ne fait pas le
        devoir à votre place, et il ne connaît aucun sujet d&apos;examen.
      </p>

      {tours.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 12,
            marginBottom: 16,
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {tours.map((tour, index) => (
            <div
              key={index}
              style={{
                justifySelf: tour.role === "user" ? "end" : "start",
                maxWidth: "88%",
                padding: "12px 16px",
                borderRadius: 14,
                fontSize: 15,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                ...(tour.role === "user"
                  ? { background: "oklch(80% 0.15 78 / 0.16)", color: SABLE }
                  : tour.role === "assistant"
                    ? { border: `1px solid ${TRAIT}`, color: SABLE }
                    : {
                        /*
                         * Un état ne ressemble pas à une réponse : pas de
                         * bulle, texte estompé, bord pointillé. L'élève
                         * doit voir d'un coup d'œil que rien ne lui a été
                         * répondu.
                         */
                        border: `1px dashed ${TRAIT}`,
                        color: ESTOMPE,
                        fontStyle: "italic",
                      }),
              }}
            >
              {tour.contenu}
            </div>
          ))}

          {enCours && (
            <div style={{ fontSize: 14, color: ESTOMPE, justifySelf: "start" }}>
              L&apos;assistant réfléchit…
            </div>
          )}

          <div ref={finRef} />
        </div>
      )}

      <form onSubmit={envoyer} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Comment résoudre une équation du second degré ?"
          aria-label="Votre question"
          maxLength={2000}
          style={{
            flex: "1 1 260px",
            padding: "13px 16px",
            borderRadius: 12,
            border: `1px solid ${TRAIT}`,
            background: "oklch(17% 0.018 55)",
            color: SABLE,
            fontSize: 15,
          }}
        />

        <button
          type="submit"
          disabled={enCours || !question.trim()}
          style={{
            padding: "13px 26px",
            borderRadius: 12,
            border: "none",
            background: OR,
            color: "oklch(20% 0.02 60)",
            fontWeight: 700,
            fontSize: 15,
            cursor: enCours || !question.trim() ? "default" : "pointer",
            opacity: enCours || !question.trim() ? 0.5 : 1,
          }}
        >
          Envoyer
        </button>
      </form>
    </section>
  )
}
