import { normaliserNumeroMalien } from "@/src/lib/contact-parent"

/*
 * L'ADAPTATEUR D'ENVOI WHATSAPP — ET LE SEUL.
 *
 * ⚠️ USAGE SERVEUR UNIQUEMENT. Il lit WHATSAPP_API_TOKEN, qui n'est pas
 * préfixé NEXT_PUBLIC_ : l'importer depuis un composant client mettrait
 * un jeton d'envoi dans le paquet livré au navigateur. Ce fichier n'est
 * appelé que depuis app/api/.
 *
 * =====================================================================
 * LA RÈGLE QUI NE SE NÉGOCIE PAS
 * =====================================================================
 *
 * On ne prétend JAMAIS avoir envoyé. Un message dont le statut passerait
 * à « sent » sans qu'un fournisseur l'ait accepté serait pire qu'un
 * message non envoyé : l'école croirait la famille prévenue.
 *
 * `sent` signifie exactement une chose — le fournisseur a accepté le
 * message et rendu un identifiant. Pas qu'il est arrivé, pas qu'il a été
 * lu. Ces deux-là demandent un webhook de statut, qui n'existe pas
 * encore ici.
 *
 * =====================================================================
 * POURQUOI UN MODÈLE, ET PAS DU TEXTE LIBRE
 * =====================================================================
 *
 * Meta n'autorise le texte libre que dans la FENÊTRE DE 24 HEURES qui
 * suit un message de la famille. Or une école écrit la première : une
 * absence, un bulletin, une relance de scolarité sont tous des messages
 * que personne n'a sollicités.
 *
 * Hors de cette fenêtre, il faut un MODÈLE PRÉ-APPROUVÉ par Meta, dont
 * seuls les paramètres varient. C'est une démarche administrative — on
 * la fait une fois, dans la console Meta, avec les identifiants de
 * l'établissement — et aucun code ne peut s'en dispenser.
 *
 * Conséquence directe : sans nom de modèle déclaré pour un événement, ce
 * fichier ne tente RIEN et laisse le message en attente. Envoyer du
 * texte libre « au cas où » produirait un refus de Meta pour chaque
 * message, et une file entière en échec.
 *
 * =====================================================================
 * DEUX MANIÈRES D'ÊTRE BRANCHÉ
 * =====================================================================
 *
 *   WHATSAPP_PHONE_NUMBER_ID ... on parle à Meta directement
 *   WHATSAPP_API_URL ........... on parle à un intermédiaire
 *
 * Les intermédiaires sérieux reprennent la forme de requête de Meta ;
 * l'un ou l'autre se règle donc sans toucher au code. Si les deux sont
 * posés, l'URL explicite l'emporte : quelqu'un qui l'a écrite savait ce
 * qu'il faisait.
 */

/** Ce que l'adaptateur a pu faire, dit sans détour. */
export type ResultatEnvoi =
  | { statut: "en_attente"; raison: string }
  | { statut: "sent"; providerMessageId: string | null }
  | { statut: "failed"; erreur: string }

export type Langue = "fr" | "en" | "ar"

export type MessageParent = {
  /** Numéro WhatsApp du parent, tel que saisi sur la fiche élève. */
  phone: string
  /** Le texte composé, envoyé tel quel dans la fenêtre de 24 h. */
  texte: string
  /**
   * L'événement — c'est lui qui désigne le modèle Meta à employer.
   * Absent, on ne peut écrire que dans la fenêtre de 24 h.
   */
  evenement?: string
  langue?: Langue
  /**
   * Les paramètres du corps du modèle, DANS L'ORDRE des {{1}}, {{2}}…
   * tels que le modèle a été déposé chez Meta.
   */
  parametres?: string[]
}

const VERSION_GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0"

/*
 * Le nom du modèle par événement, déclaré dans l'environnement.
 *
 * Pourquoi une variable par événement plutôt qu'un seul JSON : un JSON
 * mal formé se découvre au premier envoi, en production, et fait échouer
 * les sept événements d'un coup. Sept variables indépendantes échouent
 * séparément — et celle qui manque se lit dans le message d'attente.
 */
const MODELES: Record<string, string | undefined> = {
  absence: process.env.WHATSAPP_MODELE_ABSENCE,
  retard: process.env.WHATSAPP_MODELE_RETARD,
  retenue: process.env.WHATSAPP_MODELE_RETENUE,
  violation_reglement: process.env.WHATSAPP_MODELE_VIOLATION,
  report_card: process.env.WHATSAPP_MODELE_BULLETIN,
  fee_overdue: process.env.WHATSAPP_MODELE_SCOLARITE,
  devoir: process.env.WHATSAPP_MODELE_DEVOIR,
}

/**
 * Vrai quand une passerelle ET un jeton sont déclarés.
 *
 * Les exiger ensemble évite un demi-réglage qui donnerait l'illusion
 * d'être configuré : une passerelle sans jeton ne sert à rien, et un
 * jeton sans destination non plus.
 */
export function fournisseurConfigure() {
  const destination =
    process.env.WHATSAPP_API_URL || process.env.WHATSAPP_PHONE_NUMBER_ID

  return Boolean(destination && process.env.WHATSAPP_API_TOKEN)
}

function adresseEnvoi() {
  const explicite = process.env.WHATSAPP_API_URL

  if (explicite) {
    return explicite
  }

  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID

  return numero
    ? `https://graph.facebook.com/${VERSION_GRAPH}/${numero}/messages`
    : null
}

/**
 * Meta veut le numéro SANS le « + » : `22376123456`.
 *
 * `normaliserNumeroMalien` produit la forme internationale avec le
 * signe, qui est la bonne pour l'affichage et pour les passerelles SMS.
 * On le retire ici, au dernier moment, plutôt que d'entretenir deux
 * fonctions de normalisation qui divergeraient.
 */
function pourMeta(phone: string) {
  return normaliserNumeroMalien(phone).replace(/^\+/, "")
}

export async function sendWhatsApp(
  message: MessageParent
): Promise<ResultatEnvoi> {
  if (!message.phone?.trim()) {
    return {
      statut: "failed",
      erreur: "Aucun numéro parent : le message n'a pas de destinataire.",
    }
  }

  const url = adresseEnvoi()
  const jeton = process.env.WHATSAPP_API_TOKEN

  if (!url || !jeton) {
    return {
      statut: "en_attente",
      raison:
        "Aucun fournisseur WhatsApp n'est configuré. Le message est enregistré et attend d'être transmis.",
    }
  }

  const modele = message.evenement ? MODELES[message.evenement] : undefined

  if (!modele) {
    /*
     * On s'arrête ici plutôt que de tenter du texte libre. Hors fenêtre
     * de 24 h, Meta le refuserait — et la file se remplirait d'échecs
     * qui ressembleraient à une panne alors qu'il ne manque qu'un nom de
     * modèle.
     */
    return {
      statut: "en_attente",
      raison: message.evenement
        ? `Aucun modèle WhatsApp n'est déclaré pour « ${message.evenement} ». Le message attend.`
        : "Aucun événement n'accompagne ce message : impossible de choisir un modèle.",
    }
  }

  const corps = {
    messaging_product: "whatsapp",
    to: pourMeta(message.phone),
    type: "template",
    template: {
      name: modele,
      language: { code: message.langue ?? "fr" },
      components: [
        {
          type: "body",
          parameters: (message.parametres ?? [message.texte]).map((valeur) => ({
            type: "text",
            text: valeur,
          })),
        },
      ],
    },
  }

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jeton}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corps),
    })

    const donnees = await reponse.json().catch(() => null)

    if (reponse.ok) {
      const identifiant = donnees?.messages?.[0]?.id ?? null

      /*
       * Pas d'identifiant, pas d'envoi. Une réponse 200 sans `messages`
       * n'est pas une réponse de Meta : c'est un intermédiaire mal réglé,
       * ou une page d'erreur déguisée. Mieux vaut laisser en attente que
       * de marquer « envoyé » sur la foi d'un code HTTP.
       */
      if (!identifiant) {
        return {
          statut: "en_attente",
          raison:
            "Le fournisseur a répondu sans identifiant de message. Rien ne prouve que le message soit parti.",
        }
      }

      return { statut: "sent", providerMessageId: identifiant }
    }

    const detail =
      donnees?.error?.message ??
      donnees?.error?.error_data?.details ??
      `Le fournisseur a répondu ${reponse.status}.`

    /*
     * LA DISTINCTION QUI COMPTE : ce qui se rejouera, et ce qui ne se
     * rejouera jamais.
     *
     * Un jeton expiré, une panne du fournisseur, une limite de débit —
     * tout cela repartira une fois le réglage corrigé. La ligne reste
     * « en_attente », donc rattrapable.
     *
     * Un numéro qui n'est pas sur WhatsApp, lui, ne le sera pas demain
     * parce qu'on aura réessayé. La ligne passe « failed », et l'école
     * sait qu'il faut téléphoner.
     */
    const rejouable =
      reponse.status === 401 ||
      reponse.status === 403 ||
      reponse.status === 429 ||
      reponse.status >= 500

    if (rejouable) {
      return {
        statut: "en_attente",
        raison: `Le fournisseur n'a pas pris le message (${detail}). Il reste en attente.`,
      }
    }

    return { statut: "failed", erreur: detail }
  } catch (erreur) {
    console.error("Envoi WhatsApp :", erreur)

    /*
     * Une coupure réseau n'est pas un échec d'envoi : c'est un envoi qui
     * n'a pas eu lieu. La nuance décide si l'école réessaiera.
     */
    return {
      statut: "en_attente",
      raison: "Le fournisseur n'a pas pu être joint. Le message reste en attente.",
    }
  }
}
