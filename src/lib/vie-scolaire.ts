/*
 * Messages adressés à un enseignant en retard ou absent.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CE TON
 *
 * Ces messages sont lus par un collègue, pas par un fautif. Un rappel
 * sec braque, et un enseignant braqué ne devient pas ponctuel — il
 * devient distant. Le ton monte donc avec le nombre, sans jamais
 * humilier : on plaisante à un retard, on s'inquiète à cinq, on convoque
 * au-delà. Le dernier palier reste courtois : c'est une convocation, pas
 * une sanction écrite.
 *
 * Le prénom est utilisé seul, comme on s'adresse à quelqu'un qu'on
 * connaît.
 * ---------------------------------------------------------------------
 */

export type Comptage = {
  retards: number
  absences: number
  absencesExcusees: number
}

export type NiveauMessage = "leger" | "attentif" | "serieux"

export function niveauMessage(comptage: Comptage): NiveauMessage {
  // Une absence pèse plus lourd qu'un retard : elle laisse une classe
  // entière sans personne devant elle.
  const poids = comptage.retards + comptage.absences * 2

  if (poids >= 6) return "serieux"
  if (poids >= 3) return "attentif"
  return "leger"
}

function accorder(nombre: number, singulier: string, pluriel: string) {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`
}

function resumer(comptage: Comptage) {
  const morceaux: string[] = []

  if (comptage.retards > 0) {
    morceaux.push(accorder(comptage.retards, "retard", "retards"))
  }

  if (comptage.absences > 0) {
    morceaux.push(accorder(comptage.absences, "absence", "absences"))
  }

  if (comptage.absencesExcusees > 0) {
    morceaux.push(
      `${accorder(comptage.absencesExcusees, "absence excusée", "absences excusées")}`
    )
  }

  if (morceaux.length === 0) return ""
  if (morceaux.length === 1) return morceaux[0]

  return `${morceaux.slice(0, -1).join(", ")} et ${morceaux[morceaux.length - 1]}`
}

export function composerMessage(
  prenom: string,
  comptage: Comptage,
  periode: string,
  ecole: string
) {
  const resume = resumer(comptage)

  if (!resume) {
    return `Bonjour ${prenom}, rien à signaler ${periode} : merci pour votre régularité, elle se remarque autant que le contraire. — ${ecole}`
  }

  const niveau = niveauMessage(comptage)

  if (niveau === "leger") {
    return (
      `Bonjour ${prenom}, un petit mot de la surveillance : nous avons noté ${resume} ${periode}. ` +
      `Rien de grave, mais les élèves arrivent avant vous et ils le remarquent ! ` +
      `Un réveil avancé de dix minutes et l'affaire est réglée. Bonne journée. — ${ecole}`
    )
  }

  if (niveau === "attentif") {
    return (
      `Bonjour ${prenom}, la surveillance a relevé ${resume} ${periode}. ` +
      `Cela commence à se voir dans les classes : une heure qui démarre en retard, c'est une heure qui finit incomplète. ` +
      `Nous comptons sur vous pour redresser cela dès cette semaine — et si quelque chose vous gêne (transport, horaires, santé), venez nous en parler, on trouvera une solution ensemble. — ${ecole}`
    )
  }

  return (
    `Bonjour ${prenom}, la surveillance a relevé ${resume} ${periode}. ` +
    `Nous ne pouvons plus le laisser passer : les élèves perdent des heures de cours et la direction en est informée. ` +
    `Merci de passer nous voir avant la fin de la semaine pour en discuter de vive voix. ` +
    `Si une difficulté explique ces absences, c'est le moment de nous le dire — nous préférons vous aider que vous sanctionner. — ${ecole}`
  )
}

export const LIBELLE_STATUT: Record<string, string> = {
  retard: "Retard",
  absence: "Absence",
  absence_excusee: "Absence excusée",
}

export const COULEUR_STATUT: Record<string, string> = {
  retard: "oklch(0.585 0.16 78)",
  absence: "oklch(0.55 0.19 25)",
  absence_excusee: "oklch(0.55 0.09 250)",
}

/** Lundi de la semaine contenant la date donnée. */
export function debutSemaine(date: Date) {
  const copie = new Date(date)
  const jour = copie.getDay()

  // getDay() rend 0 pour dimanche : on recule alors de six jours.
  copie.setDate(copie.getDate() - (jour === 0 ? 6 : jour - 1))
  copie.setHours(0, 0, 0, 0)

  return copie
}

/** Les six jours travaillés, lundi à samedi. */
export function joursSemaine(lundi: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const jour = new Date(lundi)
    jour.setDate(lundi.getDate() + index)
    return jour
  })
}

export function versDateISO(date: Date) {
  // toISOString() bascule en UTC et peut reculer d'un jour au Mali.
  const mois = String(date.getMonth() + 1).padStart(2, "0")
  const jour = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${mois}-${jour}`
}
