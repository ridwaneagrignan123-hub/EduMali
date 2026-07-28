/*
 * Refus des mots de passe connus des fuites de données.
 *
 * C'est le mécanisme que Supabase réserve à ses offres payantes ; le
 * service qu'il interroge, lui, est public et gratuit. On le fait donc
 * ici, côté navigateur.
 *
 * ---------------------------------------------------------------------
 * LE MOT DE PASSE NE QUITTE JAMAIS L'APPAREIL
 *
 * On calcule son empreinte SHA-1 localement, et on n'envoie que les
 * CINQ premiers caractères hexadécimaux de cette empreinte. Le service
 * renvoie alors toutes les empreintes commençant par ce préfixe —
 * plusieurs centaines — et la comparaison finale se fait ici. C'est le
 * principe dit de k-anonymat : le serveur distant ne peut pas savoir
 * lequel de ces mots de passe nous intéressait, et n'apprend rien.
 *
 * SHA-1 est utilisé parce que c'est le format du service, pas pour
 * protéger quoi que ce soit : l'empreinte n'est jamais stockée.
 * ---------------------------------------------------------------------
 */

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"

// Au-delà, on renonce plutôt que de faire attendre l'utilisateur.
const TIMEOUT_MS = 4000

export type PasswordCheck =
  /** Le mot de passe apparaît dans des fuites connues. */
  | { status: "compromis"; occurrences: number }
  /** Absent des fuites connues. */
  | { status: "sain" }
  /** Vérification impossible (hors ligne, service injoignable). */
  | { status: "indisponible" }

async function sha1Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-1", bytes)

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

export async function checkPasswordExposure(
  password: string
): Promise<PasswordCheck> {
  /*
   * crypto.subtle n'existe qu'en contexte sécurisé (https ou localhost).
   * Ailleurs on ne bloque pas la définition du mot de passe : mieux vaut
   * un contrôle absent qu'un utilisateur incapable de se connecter.
   */
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return { status: "indisponible" }
  }

  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      signal: controller.signal,
      // Le préfixe seul est envoyé ; aucun en-tête d'identification.
      headers: { "Add-Padding": "true" },
    })

    clearTimeout(timer)

    if (!response.ok) {
      return { status: "indisponible" }
    }

    const body = await response.text()

    for (const line of body.split("\n")) {
      const [candidate, count] = line.trim().split(":")

      if (candidate === suffix) {
        return {
          status: "compromis",
          occurrences: Number(count) || 0,
        }
      }
    }

    return { status: "sain" }
  } catch (error) {
    console.warn("Vérification du mot de passe indisponible :", error)
    return { status: "indisponible" }
  }
}

/*
 * Contrôles locaux, sans réseau.
 *
 * Ils attrapent ce que la liste des fuites ne couvre pas : un mot de
 * passe construit à partir de sa propre adresse email, par exemple, peut
 * être unique au monde et rester trivial à deviner pour un proche.
 */
export function findObviousWeakness(
  password: string,
  email: string
): string | null {
  const lower = password.toLowerCase()

  const localPart = email.split("@")[0]?.toLowerCase() ?? ""

  if (localPart.length >= 4 && lower.includes(localPart)) {
    return "Ce mot de passe contient votre adresse email : choisissez-en un sans rapport avec votre compte."
  }

  if (/^(.)\1+$/.test(password)) {
    return "Ce mot de passe ne contient qu'un seul caractère répété."
  }

  if (/^(0123456789|1234567890|azerty|qwerty|motdepasse|password)/i.test(password)) {
    return "Ce mot de passe est parmi les plus courants : il serait deviné immédiatement."
  }

  return null
}
