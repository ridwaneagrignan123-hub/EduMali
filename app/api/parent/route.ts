import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import {
  fermerSession,
  lireDossier,
  ouvrirSession,
  sessionCourante,
} from "@/src/lib/dossier-parent"

/*
 * L'accès du parent.
 *
 * =====================================================================
 * LE SEUL POINT D'ENTRÉE, ET IL EST BORNÉ
 * =====================================================================
 *
 *   POST   ... échange un code contre une session
 *   GET    ... rend le dossier de la session en cours
 *   DELETE ... ferme la session
 *
 * Aucune de ces trois opérations n'écrit dans le dossier de l'élève. Le
 * parent lit ; il ne corrige pas une note, ne justifie pas une absence,
 * ne conteste pas un versement. Ces conversations existent, mais elles
 * se tiennent avec l'école, pas avec un formulaire.
 *
 * =====================================================================
 * POURQUOI LE PLAFOND D'ESSAIS EST INDISPENSABLE ICI
 * =====================================================================
 *
 * Un code fait huit caractères sur un alphabet de 31, soit environ 850
 * milliards de combinaisons : personne ne l'épuisera. Le plafond ne
 * protège donc pas contre l'exploration exhaustive — il protège contre
 * la RAFALE, celle qui essaie des milliers de codes par minute en
 * espérant tomber sur un actif, et qui coûterait à l'école autant en
 * requêtes qu'en inquiétude.
 *
 * Le compteur est celui de l'assistant de révision, renommé pour
 * l'occasion : deux mécanismes de plafond auraient divergé.
 */

const SEL = process.env.ASSISTANT_QUOTA_SALT ?? "ridwane-annales"

/*
 * 30 essais par jour et par visiteur. Un parent qui recopie mal son code
 * s'y reprend à trois fois, jamais à trente ; qui dépasse ce seuil ne
 * recopie pas, il cherche.
 */
const ESSAIS_MAX = 30

function empreinte(request: Request) {
  const entete = request.headers.get("x-forwarded-for") ?? ""
  const adresse = entete.split(",")[0]?.trim() || "inconnue"

  return (
    "parent:" +
    createHash("sha256").update(`${SEL}:${adresse}`).digest("hex").slice(0, 24)
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const code = typeof body?.code === "string" ? body.code : ""

    if (!code.trim()) {
      return NextResponse.json({ error: "Entrez votre code." }, { status: 400 })
    }

    const { data: reste, error } = await supabaseAdmin.rpc("consommer_quota", {
      p_bucket: empreinte(request),
      p_plafond: ESSAIS_MAX,
    })

    /*
     * Un compteur illisible fait REFUSER, comme pour l'assistant : un
     * plafond qu'on n'arrive pas à appliquer n'est pas un plafond.
     */
    if (error || typeof reste !== "number" || reste < 0) {
      if (error) {
        console.error("Compteur d'essais parent :", error)
      }

      return NextResponse.json(
        {
          error:
            "Trop d'essais depuis cet appareil. Réessayez demain, ou demandez votre code à l'école.",
        },
        { status: 429 }
      )
    }

    const codeId = await ouvrirSession(code)

    if (!codeId) {
      /*
       * Le même message pour un code inconnu et pour un code révoqué.
       * Les distinguer indiquerait à qui essaie au hasard quand il a
       * touché juste.
       */
      return NextResponse.json(
        { error: "Ce code n'est pas valide. Vérifiez-le auprès de l'école." },
        { status: 401 }
      )
    }

    const dossier = await lireDossier(codeId)

    if (!dossier) {
      return NextResponse.json(
        { error: "Ce dossier n'a pas pu être ouvert." },
        { status: 404 }
      )
    }

    return NextResponse.json({ dossier })
  } catch (erreur) {
    console.error("Accès parent :", erreur)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const codeId = await sessionCourante()

    if (!codeId) {
      return NextResponse.json({ error: "Session expirée." }, { status: 401 })
    }

    const dossier = await lireDossier(codeId)

    if (!dossier) {
      return NextResponse.json({ error: "Session expirée." }, { status: 401 })
    }

    return NextResponse.json({ dossier })
  } catch (erreur) {
    console.error("Accès parent :", erreur)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  await fermerSession()
  return NextResponse.json({ ok: true })
}
