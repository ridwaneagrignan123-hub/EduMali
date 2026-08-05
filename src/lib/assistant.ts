import "server-only"
import Anthropic from "@anthropic-ai/sdk"

/*
 * L'assistant de révision — L'ADAPTATEUR UNIQUE.
 *
 * =====================================================================
 * LES TROIS RÈGLES, LES MÊMES QUE POUR WHATSAPP
 * =====================================================================
 *
 *   1. UN SEUL ENDROIT parle au fournisseur. Aucun autre fichier de
 *      l'application n'importe le SDK. Changer de modèle, de plafond ou
 *      de fournisseur se fait ici, et nulle part ailleurs.
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
 * `import "server-only"` fait échouer la compilation si un composant
 * client atteint ce fichier : la clé d'API ne doit jamais partir au
 * navigateur.
 */

/*
 * Claude Opus 5. La réflexion adaptative reste ACTIVE, à effort « low » :
 * la désactiver sur ce modèle a deux défauts connus — des balises
 * internes qui fuient dans la réponse visible, et des appels d'outils
 * écrits en texte. L'effort bas donne la même économie sans les
 * apporter.
 */
const MODELE = "claude-opus-5"

/*
 * 1200 jetons : de quoi expliquer une méthode et poser un calcul, pas de
 * quoi écrire un cours. La consigne de concision est dans le préambule ;
 * ce plafond est la ceinture qui va avec.
 */
const JETONS_MAX = 1200

/*
 * Le préambule.
 *
 * Il est court, et volontairement : ce modèle suit les instructions de
 * près, et un préambule qui empile les interdits produit un assistant
 * timide qui passe son temps à se couvrir. On dit ce qu'on veut, une
 * fois, en positif.
 *
 * Les deux points qui ne sont pas négociables et qui sont donc écrits
 * explicitement : ne pas inventer un sujet d'examen, et expliquer la
 * méthode plutôt que de rendre la réponse nue. Le premier protège la
 * crédibilité du site, le second protège l'élève.
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
  | { etat: "erreur" }

/**
 * L'assistant est-il configuré ?
 *
 * Appelée par la page pour décider d'afficher le chat ou de ne rien
 * afficher du tout. Un champ de saisie qui répond « indisponible » à
 * chaque envoi est une promesse trahie à chaque clic ; mieux vaut ne
 * pas le montrer.
 */
export function assistantDisponible() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function repondre(historique: Message[]): Promise<Reponse> {
  if (!assistantDisponible()) {
    return { etat: "indisponible" }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: JETONS_MAX,
      system: PREAMBULE,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      /*
       * Les classificateurs de sûreté peuvent décliner une demande — un
       * exercice de chimie ou de biologie tout à fait scolaire suffit
       * parfois. `fallbacks: "default"` fait rejouer la demande sur un
       * autre modèle côté serveur, plutôt que de rendre le refus à un
       * élève qui n'a rien fait de mal.
       */
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: historique.map((message) => ({
        role: message.role,
        content: message.contenu,
      })),
    })

    /*
     * `stop_reason` AVANT `content` : sur un refus, le contenu est vide
     * ou partiel, et lire `content[0]` lèverait.
     */
    if (reponse.stop_reason === "refusal") {
      return { etat: "refus" }
    }

    const texte = reponse.content
      .filter((bloc) => bloc.type === "text")
      .map((bloc) => bloc.text)
      .join("\n")
      .trim()

    if (!texte) {
      return { etat: "erreur" }
    }

    return { etat: "ok", texte }
  } catch (error) {
    console.error("Assistant de révision :", error)
    return { etat: "erreur" }
  }
}
