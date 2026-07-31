/*
 * L'ADAPTATEUR D'ENVOI WHATSAPP — ET LE SEUL.
 *
 * ⚠️ USAGE SERVEUR UNIQUEMENT. Il lit WHATSAPP_API_TOKEN, qui n'est pas
 * préfixé NEXT_PUBLIC_ : l'importer depuis un composant client mettrait
 * un jeton d'envoi dans le paquet livré au navigateur. Ce fichier n'est
 * appelé que depuis app/api/.
 *
 * ---------------------------------------------------------------------
 * CE FICHIER EST LA COUTURE, PAS L'IMPLÉMENTATION
 *
 * Aucun fournisseur n'est branché ici, et c'est délibéré. Envoyer un
 * message WhatsApp à une famille suppose un compte WhatsApp Business
 * (via Meta directement ou un intermédiaire), des modèles de message
 * PRÉ-APPROUVÉS par Meta, et un numéro d'expéditeur vérifié. Rien de
 * cela ne s'obtient depuis le code : c'est une démarche administrative
 * externe, à faire une fois, avec les identifiants de l'établissement.
 *
 * Quand ce jour viendra, tout se branche ICI et nulle part ailleurs.
 * C'est la raison d'être de ce fichier : que le reste de l'application
 * n'ait jamais à connaître le fournisseur.
 * ---------------------------------------------------------------------
 *
 * LA RÈGLE QUI NE SE NÉGOCIE PAS : on ne prétend JAMAIS avoir envoyé.
 *
 * Un message dont le statut passerait à « sent » sans qu'un fournisseur
 * l'ait accepté serait pire qu'un message non envoyé : l'école croirait
 * la famille prévenue. Tant que personne n'a réellement pris le message
 * en charge, il reste « en_attente » — visible comme tel dans
 * l'historique de l'élève, et donc rattrapable à la main.
 */

/** Ce que l'adaptateur a pu faire, dit sans détour. */
export type ResultatEnvoi =
  | { statut: "en_attente"; raison: string }
  | { statut: "sent"; providerMessageId: string | null }
  | { statut: "failed"; erreur: string }

export type MessageParent = {
  /** Numéro WhatsApp du parent, tel que saisi sur la fiche élève. */
  phone: string
  texte: string
}

/**
 * Vrai quand un fournisseur a été déclaré dans l'environnement.
 *
 * Deux variables, parce qu'une passerelle sans jeton ne sert à rien et
 * qu'un jeton sans adresse non plus : les exiger ensemble évite un
 * demi-réglage qui donnerait l'illusion d'être configuré.
 */
export function fournisseurConfigure() {
  return Boolean(
    process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN
  )
}

/**
 * Le point d'envoi unique.
 *
 * Aujourd'hui il ne transmet rien — il n'y a pas de fournisseur à qui
 * transmettre. Il rend « en_attente » dans les deux cas, avec une raison
 * différente, pour qu'on sache s'il manque un réglage ou l'implémentation.
 */
export async function sendWhatsApp(
  message: MessageParent
): Promise<ResultatEnvoi> {
  if (!message.phone?.trim()) {
    return {
      statut: "failed",
      erreur: "Aucun numéro parent : le message n'a pas de destinataire.",
    }
  }

  if (!fournisseurConfigure()) {
    return {
      statut: "en_attente",
      raison:
        "Aucun fournisseur WhatsApp n'est configuré. Le message est enregistré et attend d'être transmis.",
    }
  }

  /*
   * ICI, ET NULLE PART AILLEURS, viendra l'appel au fournisseur :
   *
   *   const reponse = await fetch(process.env.WHATSAPP_API_URL!, {
   *     method: "POST",
   *     headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}` },
   *     body: JSON.stringify({
   *       // normaliserNumeroMalien() vit dans src/lib/contact-parent.ts
   *       to: normaliserNumeroMalien(message.phone),
   *       // Meta impose un MODÈLE pré-approuvé hors fenêtre de 24 h :
   *       // le texte libre ne passe que si la famille a écrit récemment.
   *       template: "...",
   *     }),
   *   })
   *
   * Tant que ce code n'existe pas, on ne rend surtout pas « sent » :
   * déclarer une passerelle dans l'environnement ne fait pas partir un
   * message.
   */
  return {
    statut: "en_attente",
    raison:
      "Une passerelle est déclarée, mais l'appel au fournisseur n'est pas encore implémenté. Le message reste en attente.",
  }
}
