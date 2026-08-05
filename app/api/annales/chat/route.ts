import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { Message, assistantDisponible, repondre } from "@/src/lib/assistant"

/*
 * L'assistant de révision, côté serveur.
 *
 * =====================================================================
 * POURQUOI CETTE ROUTE COMPTE AVANT DE RÉPONDRE
 * =====================================================================
 *
 * `/annales` est publique et sans compte — c'est tout son intérêt, et
 * c'est aussi ce qui fait que n'importe qui peut consommer les jetons de
 * l'exploitant. Sur une page ouverte, la facture est le premier bug, et
 * elle arrive sans prévenir.
 *
 * D'où DEUX plafonds, et non un :
 *
 *   par visiteur ... empêche un élève de monopoliser l'assistant. Il se
 *                    contourne trivialement (changer de réseau suffit),
 *                    et ce n'est pas grave : ce n'est pas le garde-fou
 *                    financier, c'est la règle de politesse.
 *
 *   par jour ....... le vrai garde-fou. Quoi qu'il arrive, quel que
 *                    soit le nombre de visiteurs ou d'adresses, la
 *                    dépense d'une journée est bornée. C'est le seul
 *                    plafond sur lequel on peut compter.
 *
 * Les deux sont réglables par l'environnement, sans redéploiement de
 * code : le bon chiffre ne se devine pas d'avance, il se règle en
 * regardant l'usage réel.
 *
 * =====================================================================
 * L'ADRESSE IP N'EST PAS STOCKÉE
 * =====================================================================
 *
 * Le compteur est indexé sur une EMPREINTE de l'adresse, pas sur
 * l'adresse. On a besoin de distinguer deux visiteurs, pas de savoir qui
 * ils sont — et la table appartiendrait à qui obtiendrait la clé service
 * role. Ce qu'on ne conserve pas ne fuit pas.
 */

/* Le sel n'est pas un secret critique : il évite qu'une empreinte se
 * retrouve par simple table arc-en-ciel des adresses IPv4. Absent, on
 * retombe sur une valeur fixe — l'empreinte reste, la protection contre
 * l'énumération non. */
const SEL = process.env.ASSISTANT_QUOTA_SALT ?? "ridwane-annales"

const LIMITE_VISITEUR = Number(process.env.ASSISTANT_LIMITE_VISITEUR ?? 20)
const LIMITE_JOUR = Number(process.env.ASSISTANT_LIMITE_JOUR ?? 400)

/* Ce qui est raisonnable pour une question d'élève, et rien au-delà. */
const MESSAGES_MAX = 12
const CARACTERES_MAX = 2000

function empreinte(request: Request) {
  const entete = request.headers.get("x-forwarded-for") ?? ""
  const adresse = entete.split(",")[0]?.trim() || "inconnue"

  return createHash("sha256").update(`${SEL}:${adresse}`).digest("hex").slice(0, 32)
}

/**
 * Consomme un jeton du compteur. Rend `true` s'il en restait.
 *
 * En cas d'erreur de base, on REFUSE. Un compteur qu'on n'arrive pas à
 * lire est un plafond qu'on n'applique pas : laisser passer « au cas
 * où » transformerait une panne de Supabase en facture ouverte.
 */
async function consommer(bucket: string, plafond: number) {
  const { data, error } = await supabaseAdmin.rpc("assistant_consommer", {
    p_bucket: bucket,
    p_plafond: plafond,
  })

  if (error) {
    console.error("Compteur de l'assistant :", error)
    return false
  }

  return typeof data === "number" && data >= 0
}

export async function POST(request: Request) {
  try {
    if (!assistantDisponible()) {
      /*
       * 503 et non 200 : l'appelant doit pouvoir distinguer « pas
       * configuré » de « voici ma réponse ». Aucun jeton n'est consommé,
       * puisque rien n'a été demandé à personne.
       */
      return NextResponse.json(
        {
          etat: "indisponible",
          message:
            "L'assistant n'est pas encore activé. Les annales et les corrigés restent disponibles.",
        },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    const brut = body?.messages

    if (!Array.isArray(brut) || brut.length === 0) {
      return NextResponse.json({ error: "Question manquante." }, { status: 400 })
    }

    if (brut.length > MESSAGES_MAX) {
      return NextResponse.json(
        {
          error:
            "La conversation est trop longue. Rechargez la page pour repartir sur une question neuve.",
        },
        { status: 400 }
      )
    }

    const messages: Message[] = []

    for (const item of brut) {
      const role = item?.role
      const contenu = typeof item?.contenu === "string" ? item.contenu.trim() : ""

      if (role !== "user" && role !== "assistant") {
        return NextResponse.json({ error: "Message invalide." }, { status: 400 })
      }

      if (!contenu) {
        return NextResponse.json({ error: "Message vide." }, { status: 400 })
      }

      if (contenu.length > CARACTERES_MAX) {
        return NextResponse.json(
          { error: "Question trop longue. Résumez-la en quelques lignes." },
          { status: 400 }
        )
      }

      messages.push({ role, contenu })
    }

    /*
     * Le plafond du visiteur d'abord : c'est celui qui se déclenche le
     * plus souvent. Le tester en second ferait consommer un jeton du
     * plafond journalier — le seul qui compte vraiment — à chaque
     * visiteur trop bavard.
     */
    if (!(await consommer(empreinte(request), LIMITE_VISITEUR))) {
      return NextResponse.json(
        {
          etat: "quota",
          message:
            "Vous avez atteint le nombre de questions du jour. Revenez demain — les annales, elles, restent ouvertes.",
        },
        { status: 429 }
      )
    }

    if (!(await consommer("@global", LIMITE_JOUR))) {
      return NextResponse.json(
        {
          etat: "quota",
          message:
            "L'assistant a atteint sa limite pour aujourd'hui. Les annales et les corrigés restent disponibles.",
        },
        { status: 429 }
      )
    }

    const reponse = await repondre(messages)

    if (reponse.etat === "ok") {
      return NextResponse.json({ etat: "ok", texte: reponse.texte })
    }

    if (reponse.etat === "refus") {
      return NextResponse.json(
        {
          etat: "refus",
          message:
            "Cette question n'a pas pu être traitée. Reformulez-la, ou posez-la à votre enseignant.",
        },
        { status: 200 }
      )
    }

    /*
     * Jamais de texte de repli ici. Une phrase fabriquée à la place
     * d'une réponse se lirait comme une réponse.
     */
    return NextResponse.json(
      {
        etat: "erreur",
        message: "L'assistant n'a pas répondu. Réessayez dans un instant.",
      },
      { status: 502 }
    )
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { etat: "erreur", message: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
