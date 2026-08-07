import { readJson, writeJson } from "@/src/lib/stockage-local"

/*
 * Le choix de localStorage et la plomberie de lecture/écriture sont
 * expliqués et partagés dans src/lib/stockage-local.ts, que la feuille
 * d'appel emploie aussi.
 *
 * Réexportés ici : app/grades/page.tsx les importe de ce module depuis
 * toujours, et rien ne justifie de lui faire changer de porte.
 */
export {
  describeSupabaseError,
  createPendingId,
} from "@/src/lib/stockage-local"

/*
 * Stockage local de la saisie des notes, pour tolérer les coupures.
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
