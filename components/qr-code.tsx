"use client"

import { useMemo } from "react"
import qrcode from "qrcode-generator"

/*
 * Un QR code, dessiné localement.
 *
 * =====================================================================
 * AUCUN SERVICE EXTÉRIEUR, ET C'EST LE POINT
 * =====================================================================
 *
 * Les générateurs d'images QR en ligne sont commodes et gratuits. Ils
 * sont aussi disqualifiés ici : leur passer l'adresse à encoder
 * reviendrait à envoyer à un tiers le jeton de vérification de chaque
 * attestation émise — c'est-à-dire à lui remettre la clé qui ouvre le
 * document, en même temps qu'un journal horodaté de qui en émet et
 * combien. Ce serait annuler la protection qu'on vient de poser.
 *
 * La bibliothèque choisie ne tire AUCUNE dépendance. C'est délibéré :
 * l'alternative la plus répandue traîne un analyseur d'arguments de
 * ligne de commande jusqu'en production, pour dessiner un carré.
 *
 * =====================================================================
 * UN SEUL CHEMIN, PAS TROIS CENTS CARRÉS
 * =====================================================================
 *
 * Chaque module sombre pourrait être un `<rect>` — un QR en compte
 * volontiers plusieurs centaines, et l'impression s'en ressent. Ils sont
 * réunis en un `<path>` unique : le rendu est plus net, le document plus
 * léger, et l'imprimante ne bave pas entre deux carrés voisins.
 */

export function QrCode({
  valeur,
  taille = 120,
  titre,
}: {
  valeur: string
  /**
   * Côté du carré, en pixels CSS.
   *
   * 120 px et non 96 : à l'impression sur A4, une adresse de vérification
   * complète produit 37 modules. À 96 px chaque module ferait 0,69 mm,
   * juste sous le confortable — et une photocopie mange cette marge. À
   * 120 px il fait 0,86 mm, ce qui se scanne encore après un pli.
   */
  taille?: number
  titre?: string
}) {
  const { chemin, modules } = useMemo(() => {
    /*
     * Type 0 = la version se choisit d'elle-même selon la longueur.
     * Correction « M » : le niveau intermédiaire, qui tolère environ
     * 15 % de dégradation — de quoi survivre à une photocopie et à un
     * pli, sans grossir le motif au point de le rendre illisible à
     * cette taille.
     */
    const qr = qrcode(0, "M")
    qr.addData(valeur)
    qr.make()

    const n = qr.getModuleCount()
    const morceaux: string[] = []

    for (let ligne = 0; ligne < n; ligne++) {
      for (let colonne = 0; colonne < n; colonne++) {
        if (qr.isDark(ligne, colonne)) {
          morceaux.push(`M${colonne} ${ligne}h1v1h-1z`)
        }
      }
    }

    return { chemin: morceaux.join(""), modules: n }
  }, [valeur])

  return (
    <svg
      width={taille}
      height={taille}
      viewBox={`0 0 ${modules} ${modules}`}
      role="img"
      aria-label={titre ?? "Code de vérification"}
      shapeRendering="crispEdges"
      style={{ display: "block", background: "#fff" }}
    >
      <path d={chemin} fill="#000" />
    </svg>
  )
}

/**
 * L'origine à graver dans le QR.
 *
 * `NEXT_PUBLIC_SITE_URL` fait foi, et le repli sur l'origine du
 * navigateur n'est qu'un filet. La raison est plus forte ici que pour un
 * lien d'accès : une attestation imprimée depuis une préversion Vercel
 * porterait pour toujours un QR pointant vers un déploiement éphémère.
 * Le papier, lui, ne se corrige pas.
 */
export function origineImprimee() {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL

  if (configuree) {
    return configuree.replace(/\/$/, "")
  }

  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return ""
}
