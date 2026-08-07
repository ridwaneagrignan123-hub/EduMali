/*
 * La plomberie du stockage local, partagée par les écrans qui tolèrent
 * la coupure — la saisie des notes et la feuille d'appel.
 *
 * Elle vivait dans grades-offline.ts, seule à en avoir besoin. L'appel
 * en a eu besoin à son tour : plutôt que d'en recopier quarante lignes
 * qui auraient divergé au premier correctif, on l'extrait ici. Le
 * comportement est inchangé.
 *
 * ---------------------------------------------------------------------
 * CHOIX : localStorage plutôt qu'IndexedDB
 *
 * Le volume est minuscule — une classe de 60 élèves pèse quelques
 * kilo-octets, très loin des 5 Mo disponibles. L'API synchrone évite
 * toute une couche d'état asynchrone dans la page, là où IndexedDB
 * imposerait transactions et promesses pour le même résultat. Si un jour
 * on met en cache toute une école sur une année, il faudra rebasculer.
 * ---------------------------------------------------------------------
 */

export function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

/*
 * localStorage peut lever : quota dépassé, navigation privée sur
 * certains navigateurs, stockage désactivé par une politique
 * d'entreprise. Toute lecture échouée rend la valeur de repli ; toute
 * écriture échouée est SIGNALÉE à l'appelant, jamais avalée — c'est ce
 * qui permet de prévenir la personne au lieu de lui laisser croire que
 * sa saisie est conservée.
 */
export function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) {
    return fallback
  }

  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch (error) {
    console.error("Lecture du stockage local impossible :", error)
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  if (!isBrowser()) {
    return false
  }

  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.error("Écriture dans le stockage local impossible :", error)
    return false
  }
}

/**
 * Rend une erreur Supabase lisible.
 *
 * PostgrestError hérite d'Error, dont `message` et `stack` sont des
 * propriétés NON énumérables : passer l'objet tel quel à console.error
 * ou à JSON.stringify affiche « {} » et ne renseigne sur rien. Il faut
 * donc lire les champs explicitement.
 */
export function describeSupabaseError(error: unknown) {
  if (!error) {
    return "Erreur inconnue."
  }

  if (typeof error === "string") {
    return error
  }

  const candidate = error as {
    message?: string
    details?: string
    hint?: string
    code?: string
  }

  const parts = [
    candidate.message,
    candidate.details,
    candidate.hint,
  ].filter((part) => typeof part === "string" && part.trim() !== "")

  const description = parts.join(" — ")

  if (candidate.code) {
    return description
      ? `${description} (code ${candidate.code})`
      : `Code ${candidate.code}`
  }

  return description || "Erreur inconnue."
}

/** Identifiant local d'une entrée en file, le temps qu'elle soit confirmée. */
export function createPendingId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
