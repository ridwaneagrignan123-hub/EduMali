/*
 * Stockage local de la saisie des notes, pour tolérer les coupures.
 *
 * ---------------------------------------------------------------------
 * CHOIX : localStorage plutôt qu'IndexedDB
 *
 * Le volume est minuscule : une classe de 60 élèves représente quelques
 * kilo-octets, très loin des 5 Mo de localStorage. Son API synchrone
 * évite toute une couche d'état asynchrone dans la page, alors
 * qu'IndexedDB imposerait transactions et promesses pour le même
 * résultat. Si un jour on met en cache toutes les classes d'une école
 * sur une année, il faudra rebasculer sur IndexedDB.
 *
 * ---------------------------------------------------------------------
 * LIMITE CONNUE ET ASSUMÉE : pas de résolution de conflit
 *
 * Si la même note est modifiée hors ligne par un enseignant et en ligne
 * par quelqu'un d'autre, c'est la dernière synchronisation qui gagne :
 * la valeur saisie hors ligne écrasera celle du serveur au moment de la
 * reconnexion, sans avertissement et sans trace de l'ancienne valeur.
 *
 * Ce cas n'est volontairement pas traité pour l'instant. Le résoudre
 * demanderait d'horodater chaque note côté serveur et de présenter les
 * divergences à l'utilisateur. En pratique le risque est faible : une
 * évaluation est saisie par un seul enseignant. Mais il existe, et il ne
 * doit pas être découvert par surprise.
 * ---------------------------------------------------------------------
 */

const CACHE_KEY = "ridwane.grades.cache"
const QUEUE_KEY = "ridwane.grades.queue"

export type CachedStudent = {
  id: string
  first_name: string
  last_name: string
}

export type CachedAssessment = {
  assessmentId: string
  savedAt: string
  title: string
  className: string
  maxScore: number
  students: CachedStudent[]
  grades: Record<string, { gradeId: string | null; score: string }>
}

export type PendingGrade = {
  /** Identifiant local, sert à retirer l'entrée une fois confirmée. */
  id: string
  assessmentId: string
  schoolId: string
  studentId: string
  /** Conservé pour pouvoir nommer l'élève même sans réseau. */
  studentLabel: string
  /** Note existante à mettre à jour, si elle était connue à la saisie. */
  gradeId: string | null
  score: number
  queuedAt: string
  /*
   * Raison du dernier échec. Sa présence marque l'entrée comme BLOQUÉE :
   * elle n'est plus retentée automatiquement, seulement sur action
   * explicite de l'utilisateur. Sans ça, une note définitivement
   * irrécupérable (élève supprimé entre-temps, par exemple) relancerait
   * une requête vouée à l'échec à chaque reconnexion, indéfiniment.
   */
  lastError?: string
}

/*
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

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

/*
 * localStorage peut lever : quota dépassé, navigation privée sur
 * certains navigateurs, stockage désactivé. Toute lecture échouée
 * renvoie une valeur vide ; toute écriture échouée est signalée à
 * l'appelant, jamais avalée — c'est ce qui permet de prévenir
 * l'utilisateur au lieu de lui laisser croire que c'est enregistré.
 */
function readJson<T>(key: string, fallback: T): T {
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

function writeJson(key: string, value: unknown) {
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

/* ------------------------------ Cache ------------------------------ */

export function cacheAssessment(entry: CachedAssessment) {
  const all = readJson<Record<string, CachedAssessment>>(CACHE_KEY, {})

  all[entry.assessmentId] = entry

  return writeJson(CACHE_KEY, all)
}

export function readCachedAssessment(assessmentId: string) {
  const all = readJson<Record<string, CachedAssessment>>(CACHE_KEY, {})

  return all[assessmentId] ?? null
}

export function listCachedAssessments() {
  return Object.values(
    readJson<Record<string, CachedAssessment>>(CACHE_KEY, {})
  )
}

/* --------------------------- File d'attente ------------------------ */

export function readQueue() {
  return readJson<PendingGrade[]>(QUEUE_KEY, [])
}

/*
 * Ajoute des notes à la file.
 *
 * Une nouvelle saisie pour le même couple (évaluation, élève) remplace
 * l'entrée précédente : sinon la file rejouerait deux valeurs
 * successives pour la même note, dont la plus ancienne en dernier.
 *
 * Renvoie false si l'écriture locale a échoué — l'appelant DOIT alors
 * prévenir l'utilisateur que sa saisie n'est pas conservée.
 */
export function enqueueGrades(entries: PendingGrade[]) {
  const queue = readQueue()

  const kept = queue.filter(
    (existing) =>
      !entries.some(
        (entry) =>
          entry.assessmentId === existing.assessmentId &&
          entry.studentId === existing.studentId
      )
  )

  return writeJson(QUEUE_KEY, [...kept, ...entries])
}

/*
 * Retire uniquement les entrées confirmées en base.
 * Celles qui ont échoué restent dans la file.
 */
export function removeFromQueue(ids: string[]) {
  const queue = readQueue()

  return writeJson(
    QUEUE_KEY,
    queue.filter((entry) => !ids.includes(entry.id))
  )
}

/*
 * Mémorise la raison de l'échec sur les entrées concernées.
 * Sans ça, une note bloquée resterait en attente indéfiniment sans que
 * personne ne puisse savoir pourquoi ni comment la débloquer.
 */
export function annotateQueueErrors(errors: Record<string, string>) {
  const queue = readQueue()

  return writeJson(
    QUEUE_KEY,
    queue.map((entry) =>
      errors[entry.id] ? { ...entry, lastError: errors[entry.id] } : entry
    )
  )
}

export function createPendingId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
