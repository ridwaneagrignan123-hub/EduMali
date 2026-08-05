"use client"

import { useMemo, useState } from "react"
import {
  EXAMENS,
  PAYS,
  Ressource,
  lienDuSujet,
  texteCherchable,
} from "@/src/lib/annales"

/*
 * Le catalogue, filtré dans le navigateur.
 *
 * ---------------------------------------------------------------------
 * LES FILTRES SONT DÉDUITS DU CATALOGUE, JAMAIS ÉCRITS EN DUR
 *
 * Les matières, les années et les séries proposées sont celles qui
 * EXISTENT dans les entrées. Une liste figée finirait par proposer
 * « Physique-Chimie » à un élève alors qu'aucun sujet n'y répond : un
 * filtre qui ne rend rien fait croire que le site est vide, pas que la
 * matière manque.
 *
 * Seuls les examens et les pays viennent d'une liste : ce sont les
 * mêmes que les contraintes de la base, et proposer un examen absent
 * indique justement à l'élève ce qu'il pourra chercher plus tard.
 * ---------------------------------------------------------------------
 */

const OR = "oklch(80% 0.15 78)"
const SABLE = "oklch(95% 0.015 85)"
const TRAIT = "oklch(95% 0.015 85 / 0.12)"
const NUIT_DOUCE = "oklch(22% 0.02 55)"
const ESTOMPE = "oklch(95% 0.015 85 / 0.62)"

const TOUS = "tous"

export function CatalogueAnnales({ ressources }: { ressources: Ressource[] }) {
  const [examen, setExamen] = useState(TOUS)
  const [matiere, setMatiere] = useState(TOUS)
  const [pays, setPays] = useState(TOUS)
  const [genre, setGenre] = useState(TOUS)
  const [recherche, setRecherche] = useState("")

  const matieres = useMemo(
    () =>
      [...new Set(ressources.map((r) => r.subject))].sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [ressources]
  )

  const paysPresents = useMemo(
    () =>
      Object.keys(PAYS).filter((code) =>
        ressources.some((r) => r.country === code)
      ),
    [ressources]
  )

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase()

    return ressources.filter((r) => {
      if (examen !== TOUS && r.exam !== examen) return false
      if (matiere !== TOUS && r.subject !== matiere) return false
      if (pays !== TOUS && r.country !== pays) return false
      if (genre !== TOUS && r.kind !== genre) return false
      if (terme && !texteCherchable(r).includes(terme)) return false
      return true
    })
  }, [ressources, examen, matiere, pays, genre, recherche])

  return (
    <div>
      {/* ----------------------------------------------------- filtres */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <BoutonFiltre
          actif={examen === TOUS}
          onClick={() => setExamen(TOUS)}
          libelle="Tous les examens"
        />

        {EXAMENS.map((e) => (
          <BoutonFiltre
            key={e.code}
            actif={examen === e.code}
            onClick={() => setExamen(e.code)}
            libelle={e.code}
            titre={e.libelle}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 30,
        }}
      >
        <input
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
          placeholder="Chercher une matière, une année…"
          aria-label="Chercher dans le catalogue"
          style={{ ...champ, minWidth: 240, flex: "1 1 240px" }}
        />

        <select
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          aria-label="Type de document"
          style={champ}
        >
          <option value={TOUS}>Annales et exercices</option>
          <option value="annale">Annales seulement</option>
          <option value="exercice">Exercices seulement</option>
        </select>

        {matieres.length > 1 && (
          <select
            value={matiere}
            onChange={(event) => setMatiere(event.target.value)}
            aria-label="Matière"
            style={champ}
          >
            <option value={TOUS}>Toutes les matières</option>
            {matieres.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        {paysPresents.length > 1 && (
          <select
            value={pays}
            onChange={(event) => setPays(event.target.value)}
            aria-label="Pays"
            style={champ}
          >
            <option value={TOUS}>Tous les pays</option>
            {paysPresents.map((code) => (
              <option key={code} value={code}>
                {PAYS[code]}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ------------------------------------------------------ compte */}
      <p style={{ fontSize: 14, color: ESTOMPE, margin: "0 0 18px" }}>
        {filtrees.length === ressources.length
          ? `${ressources.length} document${ressources.length > 1 ? "s" : ""}`
          : `${filtrees.length} sur ${ressources.length} document${
              ressources.length > 1 ? "s" : ""
            }`}
      </p>

      {/* ------------------------------------------------------- liste */}
      {filtrees.length === 0 ? (
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: ESTOMPE,
            border: `1px solid ${TRAIT}`,
            borderRadius: 16,
            padding: 28,
            margin: 0,
          }}
        >
          {ressources.length === 0
            ? "Le catalogue est encore vide. Les premiers sujets y seront déposés très bientôt."
            : "Aucun document ne correspond. Élargissez la recherche ou choisissez « Tous les examens »."}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 12,
          }}
        >
          {filtrees.map((r) => (
            <Carte key={r.id} ressource={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Carte({ ressource }: { ressource: Ressource }) {
  const lien = lienDuSujet(ressource)

  return (
    <li
      style={{
        border: `1px solid ${TRAIT}`,
        borderRadius: 16,
        padding: "18px 20px",
        background: NUIT_DOUCE,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ minWidth: 220, flex: "1 1 320px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: OR }}>{ressource.exam}</span>
          {ressource.year && <span style={{ color: ESTOMPE }}>{ressource.year}</span>}
          {ressource.serie && (
            <span style={{ color: ESTOMPE }}>Série {ressource.serie}</span>
          )}
          <span style={{ color: ESTOMPE }}>
            {ressource.country ? PAYS[ressource.country] : "Afrique de l'Ouest"}
          </span>
          {ressource.kind === "exercice" && (
            <span style={{ color: ESTOMPE }}>Exercices</span>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>
          {ressource.title}
        </p>

        <p style={{ margin: "6px 0 0", fontSize: 14, color: ESTOMPE }}>
          {ressource.subject}
          {ressource.source_name && (
            <>
              {" · "}
              {/*
                La source est nommée à côté du document, pas cachée dans
                une page « crédits ». Un élève doit pouvoir dire d'où
                vient le sujet qu'il révise, et un enseignant vérifier.
              */}
              <span>Source : {ressource.source_name}</span>
            </>
          )}
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {lien && (
          <a
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "11px 20px",
              borderRadius: 100,
              background: OR,
              color: "oklch(20% 0.02 60)",
              fontWeight: 700,
              fontSize: 14.5,
            }}
          >
            {ressource.file_url ? "Ouvrir le sujet" : "Voir sur le site source"}
          </a>
        )}

        {ressource.correction_file_url && (
          <a
            href={ressource.correction_file_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "11px 20px",
              borderRadius: 100,
              border: `1px solid ${TRAIT}`,
              color: SABLE,
              fontWeight: 600,
              fontSize: 14.5,
            }}
          >
            Corrigé
          </a>
        )}
      </div>
    </li>
  )
}

function BoutonFiltre({
  actif,
  onClick,
  libelle,
  titre,
}: {
  actif: boolean
  onClick: () => void
  libelle: string
  titre?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-pressed={actif}
      style={{
        padding: "9px 18px",
        borderRadius: 100,
        border: `1px solid ${actif ? OR : TRAIT}`,
        background: actif ? "oklch(80% 0.15 78 / 0.14)" : "transparent",
        color: actif ? OR : ESTOMPE,
        fontWeight: 600,
        fontSize: 14.5,
        cursor: "pointer",
      }}
    >
      {libelle}
    </button>
  )
}

const champ: React.CSSProperties = {
  padding: "11px 15px",
  borderRadius: 12,
  border: `1px solid ${TRAIT}`,
  background: NUIT_DOUCE,
  color: SABLE,
  fontSize: 15,
}
