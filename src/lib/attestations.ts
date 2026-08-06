/*
 * Les libellés des documents.
 *
 * Ce module n'est NI « use client » NI « server-only », et c'est
 * exactement ce qu'il faut : il est lu des deux côtés — par le document
 * imprimable, qui est un composant client, et par la page publique de
 * vérification, qui est un composant serveur.
 *
 * Ils vivaient auparavant dans `attestation-document.tsx`. Importée
 * depuis un module marqué « use client », une constante n'arrive pas
 * telle quelle dans un composant serveur : Next n'en transmet qu'une
 * référence de module. La page de vérification affichait donc
 * « attestation_scolarite » au lieu du libellé — un identifiant
 * technique montré à une banque qui vérifie un document.
 */

export const TITRES: Record<string, string> = {
  attestation_scolarite: "ATTESTATION DE SCOLARITÉ",
  attestation_travail: "ATTESTATION DE TRAVAIL",
  certificat_scolarite: "CERTIFICAT DE SCOLARITÉ",
  certificat_travail: "CERTIFICAT DE TRAVAIL",
}
