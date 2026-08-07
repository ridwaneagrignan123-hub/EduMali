import { readJson, writeJson } from "@/src/lib/stockage-local"

/*
 * =====================================================================
 * LA FEUILLE D'APPEL HORS LIGNE
 * =====================================================================
 *
 * L'appel est le geste le plus exposé de toute l'application : il se
 * fait debout, dans une cour ou une salle, sur un téléphone, à l'endroit
 * précis où le réseau manque. Jusqu'ici la page appelait Supabase
 * soixante fois d'affilée et annonçait « N présences n'ont pas pu être
 * enregistrées » — l'enseignant perdait son appel et devait tout
 * recommencer, en ligne, de mémoire.
 *
 * ---------------------------------------------------------------------
 * CE QUI REND LE REJEU SÛR : LA CLÉ NATURELLE
 *
 * Les deux tables portent déjà l'unicité qu'il fallait :
 *
 *     attendance ......... UNIQUE (student_id, attendance_date)
 *     lesson_attendance .. UNIQUE (student_id, slot_id, lesson_date)
 *
 * On peut donc réémettre une présence sans connaître l'`id` de la ligne
 * — ce qui est justement le cas hors ligne, où aucun identifiant n'a été
 * rendu. Un `upsert` sur cette clé est IDEMPOTENT : rejouer deux fois la
 * même feuille écrit exactement le même résultat qu'une fois.
 *
 * C'est pour cela que l'enregistrement passe désormais par un upsert
 * MÊME EN LIGNE. Un chemin de rattrapage qui diffère du chemin normal
 * n'est éprouvé que le jour où il sert, c'est-à-dire trop tard.
 *
 * ---------------------------------------------------------------------
 * LIMITE CONNUE ET ASSUMÉE : pas de résolution de conflit
 *
 * Si la même présence est corrigée hors ligne par l'enseignant et en
 * ligne par la surveillance, c'est la dernière synchronisation qui
 * gagne, sans avertissement. Même arbitrage que pour les notes, pour la
 * même raison : le traiter demanderait d'horodater chaque ligne et de
 * présenter les divergences. En pratique un appel est tenu par une seule
 * personne. Mais le cas existe, et il ne doit pas se découvrir par
 * surprise.
 * =====================================================================
 */

const CACHE_KEY = "ridwane.attendance.cache"
const QUEUE_KEY = "ridwane.attendance.queue"

export type AttendanceStatus = "present" | "absent" | "late" | "excused"

export type CachedStudent = {
  id: string
  first_name: string
  last_name: string
}

/**
 * Désigne UNE feuille : une classe, un jour, et la leçon s'il y en a
 * une. C'est la clé du cache comme celle de la déduplication en file.
 *
 * Le littéral « jour » n'est pas un identifiant qui pourrait entrer en
 * collision : les créneaux sont des uuid, qui contiennent des tirets et
 * jamais ce mot.
 */
export function feuilleKey(
  classId: string,
  date: string,
  slotId: string | null
) {
  return `${classId}|${date}|${slotId ?? "jour"}`
}

export type CachedRollCall = {
  feuille: string
  savedAt: string
  className: string
  date: string
  /** Intitulé de la leçon, pour que le hors-ligne reste lisible. */
  leconLabel: string | null
  students: CachedStudent[]
  statuses: Record<string, AttendanceStatus>
}

export type PendingAttendance = {
  /** Identifiant local, sert à retirer l'entrée une fois confirmée. */
  id: string
  feuille: string
  schoolId: string
  classId: string
  studentId: string
  /** Conservé pour pouvoir nommer l'élève sans réseau. */
  studentLabel: string
  date: string
  status: AttendanceStatus
  /*
   * En mode leçon, le créneau et la matière voyagent avec l'entrée : la
   * policy d'écriture de lesson_attendance les exige, et l'emploi du
   * temps peut avoir changé d'ici la reconnexion. Ce qu'on rejoue doit
   * être ce qui a été constaté, pas ce qu'on redéduirait plus tard.
   */
  slotId: string | null
  subjectId: string | null
  queuedAt: string
  /*
   * Raison du dernier échec. Sa présence marque l'entrée comme BLOQUÉE :
   * elle n'est plus retentée automatiquement, seulement sur action
   * explicite. Sans ça, une présence devenue irrécupérable — élève
   * désinscrit, créneau supprimé — relancerait une requête vouée à
   * l'échec à chaque reconnexion, indéfiniment.
   */
  lastError?: string
}

/* ------------------------------ Cache ------------------------------ */

export function cacheRollCall(entry: CachedRollCall) {
  const all = readJson<Record<string, CachedRollCall>>(CACHE_KEY, {})

  all[entry.feuille] = entry

  return writeJson(CACHE_KEY, all)
}

export function readCachedRollCall(feuille: string) {
  const all = readJson<Record<string, CachedRollCall>>(CACHE_KEY, {})

  return all[feuille] ?? null
}

export function listCachedRollCalls() {
  return Object.values(readJson<Record<string, CachedRollCall>>(CACHE_KEY, {}))
}

/* --------------------------- File d'attente ------------------------ */

export function readAttendanceQueue() {
  return readJson<PendingAttendance[]>(QUEUE_KEY, [])
}

/*
 * Ajoute des présences à la file.
 *
 * Une nouvelle saisie pour le même couple (feuille, élève) REMPLACE la
 * précédente : sinon la file rejouerait deux statuts successifs pour le
 * même élève, dont le plus ancien en dernier — et l'élève rectifié de
 * « absent » en « présent » redeviendrait absent à la reconnexion.
 *
 * Rend false si l'écriture locale a échoué : l'appelant DOIT alors
 * prévenir, car la saisie n'est conservée nulle part.
 */
export function enqueueAttendance(entries: PendingAttendance[]) {
  const queue = readAttendanceQueue()

  const kept = queue.filter(
    (existing) =>
      !entries.some(
        (entry) =>
          entry.feuille === existing.feuille &&
          entry.studentId === existing.studentId
      )
  )

  return writeJson(QUEUE_KEY, [...kept, ...entries])
}

/* Retire uniquement les entrées confirmées en base ; les autres restent. */
export function removeFromAttendanceQueue(ids: string[]) {
  const queue = readAttendanceQueue()

  return writeJson(
    QUEUE_KEY,
    queue.filter((entry) => !ids.includes(entry.id))
  )
}

/*
 * Mémorise la raison de l'échec sur les entrées concernées, sans quoi
 * une présence bloquée resterait en attente sans que personne ne puisse
 * savoir pourquoi ni comment la débloquer.
 */
export function annotateAttendanceErrors(errors: Record<string, string>) {
  const queue = readAttendanceQueue()

  return writeJson(
    QUEUE_KEY,
    queue.map((entry) =>
      errors[entry.id] ? { ...entry, lastError: errors[entry.id] } : entry
    )
  )
}

/*
 * Lève le blocage d'une entrée pour qu'elle reparte au prochain envoi.
 * Geste explicite : c'est la personne qui décide de réessayer.
 */
export function unblockAttendance(ids: string[]) {
  const queue = readAttendanceQueue()

  return writeJson(
    QUEUE_KEY,
    queue.map((entry) => {
      if (!ids.includes(entry.id)) {
        return entry
      }

      /*
       * On rend une entrée SANS la propriété, et non avec un `undefined` :
       * `lastError` sert de marqueur de blocage, et JSON.stringify écrit
       * la clé absente là où il écrirait aussi bien une clé à undefined.
       * Ne pas la poser du tout évite d'avoir à distinguer les deux.
       */
      const reste: PendingAttendance = { ...entry }
      delete reste.lastError

      return reste
    })
  )
}

/**
 * La ligne à écrire, et la clé sur laquelle elle se réconcilie.
 *
 * Une seule fonction produit ce couple, employée par l'enregistrement
 * en ligne comme par le rejeu : les deux chemins écrivent donc
 * littéralement la même chose.
 */
export function chargeUtile(entry: PendingAttendance) {
  if (entry.slotId) {
    return {
      table: "lesson_attendance" as const,
      onConflict: "student_id,slot_id,lesson_date",
      ligne: {
        school_id: entry.schoolId,
        class_id: entry.classId,
        subject_id: entry.subjectId,
        slot_id: entry.slotId,
        student_id: entry.studentId,
        lesson_date: entry.date,
        status: entry.status,
      },
    }
  }

  return {
    table: "attendance" as const,
    onConflict: "student_id,attendance_date",
    ligne: {
      school_id: entry.schoolId,
      class_id: entry.classId,
      student_id: entry.studentId,
      attendance_date: entry.date,
      status: entry.status,
    },
  }
}
