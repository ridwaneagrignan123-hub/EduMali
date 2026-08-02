/*
 * Les liens d'accès : invitation d'un nouveau compte, relance d'un
 * compte existant.
 *
 * =====================================================================
 * POURQUOI LES LIENS EXPIRAIENT AVANT D'ÊTRE OUVERTS
 * =====================================================================
 *
 * On envoyait le `action_link` produit par Supabase. Il pointe sur
 * `/auth/v1/verify?token=…`, une adresse qui CONSOMME le jeton au
 * moment où elle est appelée — et qui renvoie ensuite vers
 * l'application.
 *
 * Or les messageries d'entreprise, les antivirus et les aperçus de lien
 * ouvrent les adresses contenues dans un courriel avant que le
 * destinataire n'y touche, pour vérifier qu'elles ne sont pas
 * malveillantes. Ce simple contrôle consommait le jeton. La personne
 * cliquait ensuite et lisait « ce lien n'est plus valide » — sur un lien
 * émis quelques secondes plus tôt, jamais utilisé par elle.
 *
 * Ce n'était donc pas une affaire de DURÉE : rallonger l'expiration
 * n'aurait rien changé, puisque le jeton était brûlé immédiatement.
 *
 * =====================================================================
 * CE QU'ON FAIT À LA PLACE
 * =====================================================================
 *
 * `generateLink` rend aussi un `hashed_token`, qui n'a encore rien
 * consommé. On construit notre PROPRE adresse avec lui, vers une page de
 * l'application :
 *
 *     {origine}/update-password?token_hash=…&type=recovery
 *
 * Ouvrir cette page ne consomme rien. L'échange n'a lieu qu'au clic sur
 * un bouton, donc par une action humaine — un robot qui charge la page
 * ne clique pas, et ne peut pas non plus exécuter le JavaScript qui le
 * ferait. Le jeton attend son destinataire.
 *
 * =====================================================================
 * CE QUI RESTE HORS DU CODE
 * =====================================================================
 *
 * Deux réglages du tableau de bord Supabase, qu'aucune ligne d'ici ne
 * peut poser :
 *
 *   1. L'URL de production doit figurer dans Authentication → URL
 *      Configuration → Redirect URLs. Sans elle, Supabase refuse la
 *      redirection et renvoie sur le site par défaut.
 *   2. La durée de vie des jetons (Authentication → Email OTP
 *      expiration). Une invitation se lit parfois le lendemain : 24 h
 *      est un choix raisonnable, l'heure par défaut ne l'est pas.
 */

/** Type de lien, tel que verifyOtp() l'attend côté navigateur. */
export type TypeLienAcces = "recovery" | "invite"

/**
 * L'origine CANONIQUE du site.
 *
 * `NEXT_PUBLIC_SITE_URL` fait foi et n'est pas un simple repli : sans
 * elle, on retomberait sur l'origine de la requête, c'est-à-dire sur
 * l'URL de la préversion Vercel quand le lien est déclenché depuis une
 * préversion. Le destinataire recevrait alors un lien vers un
 * déploiement éphémère, absent de la liste des redirections autorisées.
 */
export function origineDuSite(request: Request) {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL

  if (configuree) {
    return configuree.replace(/\/$/, "")
  }

  console.warn(
    "NEXT_PUBLIC_SITE_URL n'est pas définie : le lien d'accès pointera sur l'origine de la requête."
  )

  const origine = request.headers.get("origin")

  return (origine ?? new URL(request.url).origin).replace(/\/$/, "")
}

/**
 * Construit le lien d'accès à transmettre, à partir du `hashed_token`
 * rendu par `generateLink`.
 *
 * Rend `null` si Supabase n'a pas fourni de jeton : l'appelant doit
 * alors le dire plutôt que de proposer une adresse qui ne mènera nulle
 * part.
 */
export function lienAcces(
  origine: string,
  hashedToken: string | null | undefined,
  type: TypeLienAcces
) {
  if (!hashedToken) {
    return null
  }

  const url = new URL(`${origine}/update-password`)
  url.searchParams.set("token_hash", hashedToken)
  url.searchParams.set("type", type)

  return url.toString()
}
