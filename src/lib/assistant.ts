import "server-only"
import { ApiError, GoogleGenAI } from "@google/genai"

/*
 * L'assistant de révision — L'ADAPTATEUR UNIQUE.
 *
 * =====================================================================
 * LES TROIS RÈGLES, LES MÊMES QUE POUR WHATSAPP
 * =====================================================================
 *
 *   1. UN SEUL ENDROIT parle au fournisseur. Aucun autre fichier de
 *      l'application n'importe le SDK. Changer de modèle ou de
 *      fournisseur se fait ici, et nulle part ailleurs — c'est
 *      précisément ce qui a permis de passer d'Anthropic à Google en ne
 *      touchant qu'à ce fichier.
 *
 *   2. AUCUNE CLÉ INVENTÉE. La clé vient de l'environnement ou n'existe
 *      pas. Il n'y a pas de valeur de repli, pas de clé d'essai codée en
 *      dur, pas de « ça marchera en production ».
 *
 *   3. SANS CLÉ, L'ASSISTANT DIT QU'IL EST INDISPONIBLE. Il ne rend
 *      jamais une réponse fabriquée, jamais un « je ne peux pas répondre
 *      pour l'instant » qui ressemblerait à une réponse. Un élève qui
 *      reçoit une explication inventée révise une chose fausse — c'est
 *      pire que le silence, parce qu'il ne le saura pas.
 *
 * =====================================================================
 * POURQUOI GOOGLE, ET CE QUE ÇA COÛTE VRAIMENT
 * =====================================================================
 *
 * Le palier gratuit de l'API Gemini ne demande pas de carte bancaire.
 * En échange, il impose deux murs que l'exploitant NE CONTRÔLE PAS :
 *
 *   par minute ... quelques requêtes seulement. Une classe entière qui
 *                  ouvre la page au même moment les épuise. D'où l'état
 *                  `surcharge`, distinct d'une erreur : le message dit
 *                  d'attendre un instant, parce que c'est exactement ce
 *                  qu'il faut faire ;
 *
 *   par jour ..... de l'ordre de quelques centaines de questions. Nos
 *                  propres plafonds sont réglés EN DESSOUS (voir la
 *                  route), pour que l'élève reçoive une phrase claire
 *                  plutôt qu'un refus brut venu de Google.
 *
 * Ces quotas ont déjà été réduits par Google sans préavis. Le jour où
 * ils ne suffiront plus, c'est ce fichier — et lui seul — qui change.
 *
 * `import "server-only"` fait échouer la compilation si un composant
 * client atteint ce fichier : la clé d'API ne doit jamais partir au
 * navigateur.
 */

/*
 * Flash plutôt que Flash-Lite : Lite a un plafond journalier plus haut,
 * mais explique moins bien un raisonnement — et c'est exactement le
 * travail demandé ici. Réglable par l'environnement pour pouvoir
 * basculer sans redéployer le code le jour où le plafond serre.
 */
const MODELE = process.env.GEMINI_MODELE ?? "gemini-2.5-flash"

/*
 * 1200 jetons : de quoi expliquer une méthode et poser un calcul, pas de
 * quoi écrire un cours. La consigne de concision est dans le préambule ;
 * ce plafond est la ceinture qui va avec.
 */
const JETONS_MAX = 1200

/*
 * Le préambule.
 *
 * Court, et volontairement : un préambule qui empile les interdits
 * produit un assistant timide qui passe son temps à se couvrir. On dit
 * ce qu'on veut, une fois, en positif.
 *
 * Les deux points non négociables sont écrits explicitement : ne pas
 * inventer un sujet d'examen, et expliquer la méthode plutôt que de
 * rendre la réponse nue. Le premier protège la crédibilité du site, le
 * second protège l'élève.
 */
const PREAMBULE = `Tu aides des élèves d'Afrique de l'Ouest à réviser le DEF, le BEPC et le BAC.

Réponds dans la langue de la question. Va droit au but : l'élève révise, il n'a pas le temps de lire un cours. Une explication qui tient en quelques phrases vaut mieux qu'une page.

Explique la méthode, pas seulement le résultat. Devant un exercice, montre le raisonnement étape par étape pour que l'élève sache refaire seul le suivant. S'il demande simplement la réponse d'un devoir à rendre, donne-lui la démarche.

Tu n'as accès à aucun sujet d'examen. Si on te demande « le sujet du DEF 2019 », dis que tu ne l'as pas et propose de travailler la notion — n'invente jamais un sujet, une année, un barème ni un énoncé officiel.

Quand tu n'es pas sûr, dis-le. Un élève qui révise une chose fausse ne le découvrira qu'à l'examen.`

export type Message = { role: "user" | "assistant"; contenu: string }

export type Reponse =
  | { etat: "ok"; texte: string }
  | { etat: "indisponible" }
  | { etat: "refus" }
  | { etat: "surcharge" }
  | { etat: "erreur" }

/**
 * L'assistant est-il configuré ?
 *
 * Appelée par la page pour décider d'afficher le chat ou de ne rien
 * afficher du tout. Un champ de saisie qui répond « indisponible » à
 * chaque envoi est une promesse trahie à chaque clic.
 */
export function assistantDisponible() {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function repondre(historique: Message[]): Promise<Reponse> {
  if (!assistantDisponible()) {
    return { etat: "indisponible" }
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  try {
    const reponse = await client.models.generateContent({
      model: MODELE,
      /*
       * Google nomme « model » le rôle que nous appelons « assistant ».
       * La traduction se fait ici, au bord : le reste de l'application
       * garde son vocabulaire et ne connaît pas celui du fournisseur.
       */
      contents: historique.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.contenu }],
      })),
      config: {
        systemInstruction: PREAMBULE,
        maxOutputTokens: JETONS_MAX,
        /*
         * `thinkingBudget: 0` désactive la réflexion préalable. Sur le
         * palier gratuit elle se paie deux fois — en latence, et en
         * jetons pris sur un quota déjà serré — pour un gain nul quand
         * il s'agit d'expliquer une équation du second degré.
         */
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    /*
     * Le motif d'arrêt AVANT le texte. Un contenu bloqué revient avec un
     * texte vide et un `finishReason` explicite : le lire à l'envers
     * ferait passer un blocage pour une panne.
     */
    const motif = reponse.candidates?.[0]?.finishReason

    if (motif === "SAFETY" || motif === "RECITATION" || motif === "PROHIBITED_CONTENT") {
      return { etat: "refus" }
    }

    const texte = reponse.text?.trim()

    if (!texte) {
      return { etat: "erreur" }
    }

    return { etat: "ok", texte }
  } catch (error) {
    /*
     * 429 veut dire que le palier gratuit est saturé — souvent la limite
     * PAR MINUTE, qu'une seule classe suffit à atteindre. Ce n'est pas
     * une panne et ça se résout en attendant : le distinguer permet de
     * le dire à l'élève au lieu de lui montrer une erreur.
     */
    if (error instanceof ApiError && error.status === 429) {
      return { etat: "surcharge" }
    }

    console.error("Assistant de révision :", error)
    return { etat: "erreur" }
  }
}
