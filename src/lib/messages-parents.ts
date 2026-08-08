import { ETIQUETTES_LOCALE, Langue, versLangue } from "@/src/i18n/langues"

/*
 * Les messages aux parents, dans les trois langues.
 *
 * =====================================================================
 * POURQUOI CE FICHIER EXISTE À PART DES DICTIONNAIRES D'INTERFACE
 * =====================================================================
 *
 * Un message aux parents n'est pas une chaîne d'interface. La langue de
 * l'interface est celle de l'UTILISATEUR — le surveillant qui saisit
 * l'absence ; celle du message est celle du DESTINATAIRE, la famille.
 * Les deux n'ont aucune raison de coïncider : un surveillant peut tenir
 * son écran en français et écrire à une famille arabophone.
 *
 * Mélanger les deux dans `src/i18n/` aurait fini par faire partir un
 * message dans la langue de celui qui clique. C'est exactement l'erreur
 * qu'on veut rendre impossible.
 *
 * =====================================================================
 * COMMENT LA LANGUE EST CHOISIE
 * =====================================================================
 *
 * `langueDuMessage()` tranche, dans cet ordre :
 *
 *   1. LA FILIÈRE de la matière concernée, en école franco-arabe. Un
 *      message qui porte sur un cours d'arabe part en arabe ; sur un
 *      cours de français, en français. C'est le seul cas où le contenu
 *      du message décide de sa langue, et il est le plus parlant : la
 *      famille reconnaît la matière dont on lui parle.
 *
 *   2. LA LANGUE PAR DÉFAUT DE L'ÉCOLE, sinon. Une école classique
 *      n'a pas de filière : elle a une langue, et c'est celle-là.
 *
 * La filière ne s'applique qu'en franco-arabe, jamais ailleurs : une
 * école classique dont une matière porterait une filière par accident
 * ne verrait pas ses messages changer de langue sans prévenir.
 */

export type TypeEvenement =
  | "absence"
  | "retard"
  | "retenue"
  | "violation_reglement"
  | "devoir"

/** Ce qu'on sait du contexte au moment de composer. */
export type ContexteLangue = {
  /** `schools.default_language`. */
  langueEcole: unknown
  /** `schools.school_type` — la filière ne joue qu'en franco-arabe. */
  typeEcole: unknown
  /** `subjects.filiere` de la matière concernée, si le fait en a une. */
  filiereMatiere?: unknown
}

/**
 * La langue dans laquelle ce message doit partir.
 *
 * Rendue explicitement plutôt que déduite au fil de la composition :
 * elle est ensuite ÉCRITE dans `sms_logs.language`, et une valeur qu'on
 * enregistre mérite d'être décidée à un seul endroit.
 */
export function langueDuMessage(contexte: ContexteLangue): Langue {
  const langueEcole = versLangue(contexte.langueEcole)

  if (contexte.typeEcole !== "franco_arabe") {
    return langueEcole
  }

  if (contexte.filiereMatiere === "arabe") {
    return "ar"
  }

  if (contexte.filiereMatiere === "francais") {
    return "fr"
  }

  // Franco-arabe, mais le fait ne porte aucune matière — une absence à
  // la journée, par exemple. Rien ne désigne une filière : l'école
  // tranche.
  return langueEcole
}

type Details = {
  date?: string
  matiere?: string
  motif?: string
  regle?: string
  note?: string
  classe?: string
  page?: string
  exercices?: string
  enonce?: string
  lienPhoto?: string
}

/*
 * Les gabarits. Un par langue et par événement, écrits en entier plutôt
 * qu'assemblés par morceaux : l'arabe ne place ni le verbe ni le
 * complément là où le français les met, et une phrase montée pièce par
 * pièce y serait fausse ou ridicule.
 */
type Gabarit = (eleve: string, ecole: string, d: Details) => string

const MESSAGES: Record<Langue, Record<TypeEvenement, Gabarit>> = {
  fr: {
    absence: (eleve, ecole, d) =>
      d.matiere
        ? `Bonjour, votre enfant ${eleve} a manqué la leçon de ${d.matiere} du ${d.date} à ${ecole}.`
        : `Bonjour, votre enfant ${eleve} a été absent(e) le ${d.date} à ${ecole}.`,

    retard: (eleve, ecole, d) =>
      d.matiere
        ? `Bonjour, votre enfant ${eleve} est arrivé(e) en retard à la leçon de ${d.matiere} du ${d.date} à ${ecole}.`
        : `Bonjour, votre enfant ${eleve} est arrivé(e) en retard le ${d.date} à ${ecole}.`,

    retenue: (eleve, ecole, d) =>
      `Bonjour, votre enfant ${eleve} a été mis(e) en retenue le ${d.date} à ${ecole}${
        d.motif ? ` — motif : ${d.motif}` : ""
      }.`,

    violation_reglement: (eleve, ecole, d) =>
      `Bonjour, votre enfant ${eleve} n'a pas respecté le règlement intérieur de ${ecole} le ${d.date}${
        d.regle ? ` — règle concernée : ${d.regle}` : ""
      }${d.note ? `. ${d.note}` : "."}`,

    devoir: (eleve, ecole, d) =>
      [
        `Bonjour, devoir à la maison pour ${eleve}${
          d.classe ? ` (${d.classe})` : ""
        }${d.matiere ? ` en ${d.matiere}` : ""}, à rendre le ${d.date}.`,
        d.page ? `Page ${d.page}.` : "",
        d.exercices ? `Exercices ${d.exercices}.` : "",
        d.enonce ?? "",
        d.lienPhoto ? `Photo de l'exercice : ${d.lienPhoto}` : "",
        `— ${ecole}`,
      ]
        .filter(Boolean)
        .join(" "),
  },

  en: {
    absence: (eleve, ecole, d) =>
      d.matiere
        ? `Hello, your child ${eleve} missed the ${d.matiere} lesson on ${d.date} at ${ecole}.`
        : `Hello, your child ${eleve} was absent on ${d.date} at ${ecole}.`,

    retard: (eleve, ecole, d) =>
      d.matiere
        ? `Hello, your child ${eleve} arrived late to the ${d.matiere} lesson on ${d.date} at ${ecole}.`
        : `Hello, your child ${eleve} arrived late on ${d.date} at ${ecole}.`,

    retenue: (eleve, ecole, d) =>
      `Hello, your child ${eleve} was given detention on ${d.date} at ${ecole}${
        d.motif ? ` — reason: ${d.motif}` : ""
      }.`,

    violation_reglement: (eleve, ecole, d) =>
      `Hello, your child ${eleve} broke the school rules of ${ecole} on ${d.date}${
        d.regle ? ` — rule concerned: ${d.regle}` : ""
      }${d.note ? `. ${d.note}` : "."}`,

    devoir: (eleve, ecole, d) =>
      [
        `Hello, homework for ${eleve}${d.classe ? ` (${d.classe})` : ""}${
          d.matiere ? ` in ${d.matiere}` : ""
        }, due on ${d.date}.`,
        d.page ? `Page ${d.page}.` : "",
        d.exercices ? `Exercises ${d.exercices}.` : "",
        d.enonce ?? "",
        d.lienPhoto ? `Photo of the exercise: ${d.lienPhoto}` : "",
        `— ${ecole}`,
      ]
        .filter(Boolean)
        .join(" "),
  },

  ar: {
    absence: (eleve, ecole, d) =>
      d.matiere
        ? `السلام عليكم، تغيّب ابنكم ${eleve} عن حصة ${d.matiere} بتاريخ ${d.date} في ${ecole}.`
        : `السلام عليكم، تغيّب ابنكم ${eleve} بتاريخ ${d.date} في ${ecole}.`,

    retard: (eleve, ecole, d) =>
      d.matiere
        ? `السلام عليكم، تأخّر ابنكم ${eleve} عن حصة ${d.matiere} بتاريخ ${d.date} في ${ecole}.`
        : `السلام عليكم، تأخّر ابنكم ${eleve} بتاريخ ${d.date} في ${ecole}.`,

    retenue: (eleve, ecole, d) =>
      `السلام عليكم، خضع ابنكم ${eleve} لعقوبة الاحتجاز بتاريخ ${d.date} في ${ecole}${
        d.motif ? ` — السبب: ${d.motif}` : ""
      }.`,

    violation_reglement: (eleve, ecole, d) =>
      `السلام عليكم، خالف ابنكم ${eleve} النظام الداخلي لـ ${ecole} بتاريخ ${d.date}${
        d.regle ? ` — القاعدة المعنية: ${d.regle}` : ""
      }${d.note ? `. ${d.note}` : "."}`,

    devoir: (eleve, ecole, d) =>
      [
        `السلام عليكم، واجب منزلي للتلميذ ${eleve}${
          d.classe ? ` (${d.classe})` : ""
        }${d.matiere ? ` في مادة ${d.matiere}` : ""}، يُسلَّم بتاريخ ${d.date}.`,
        d.page ? `الصفحة ${d.page}.` : "",
        d.exercices ? `التمارين ${d.exercices}.` : "",
        d.enonce ?? "",
        d.lienPhoto ? `صورة التمرين: ${d.lienPhoto}` : "",
        `— ${ecole}`,
      ]
        .filter(Boolean)
        .join(" "),
  },
}

/**
 * La date, écrite comme on l'écrit dans cette langue.
 *
 * Une date française collée dans une phrase arabe se lit mal et se
 * recopie mal. Le calendrier reste GRÉGORIEN en arabe (`ar-MA`) : c'est
 * celui de l'année scolaire, et l'école comme la famille comptent en
 * jours d'école, pas en mois lunaires.
 */
export function dateDuMessage(dateIso: string, langue: Langue) {
  if (!dateIso) {
    return ""
  }

  const valeur = dateIso.length === 10 ? `${dateIso}T00:00:00` : dateIso

  return new Date(valeur).toLocaleDateString(ETIQUETTES_LOCALE[langue])
}

/*
 * LE NUMÉRO DE L'ÉCOLE, AJOUTÉ À LA FIN.
 *
 * Le message part du numéro de la PLATEFORME, pas de celui de l'école :
 * un seul expéditeur sert tous les établissements. Une famille qui
 * répondrait au message tomberait donc chez l'éditeur, et non au
 * secrétariat qui vient de lui écrire.
 *
 * Un parent qui apprend que son enfant est absent veut appeler l'école
 * dans la minute. Sans ce numéro, il ne l'a pas sous les yeux — et il
 * appellera le mauvais interlocuteur, ou personne.
 *
 * Ajouté ici, à la fin, plutôt que tissé dans les vingt-et-un gabarits :
 * une phrase de service se pose après le fait, dans toutes les langues,
 * sans toucher à la formulation de chacun.
 */
const CONTACT: Record<Langue, (tel: string) => string> = {
  fr: (tel) => `Pour joindre l'école : ${tel}.`,
  en: (tel) => `To reach the school: ${tel}.`,
  ar: (tel) => `للتواصل مع المدرسة: ${tel}.`,
}

/**
 * Compose le message.
 *
 * La langue est un PARAMÈTRE, jamais devinée ici : elle a été décidée
 * par `langueDuMessage()`, et c'est la même valeur qui sera écrite dans
 * `sms_logs.language`. Le texte enregistré et la langue enregistrée ne
 * peuvent donc pas se contredire.
 *
 * `telephoneEcole` est facultatif : une école qui n'a pas renseigné son
 * numéro voit simplement le message se terminer sans lui, plutôt qu'une
 * phrase de contact vide ou un « undefined » envoyé à une famille.
 */
export function composerMessage(
  langue: Langue,
  type: TypeEvenement,
  eleve: string,
  ecole: string,
  details: Details,
  telephoneEcole?: string | null
) {
  const texte = MESSAGES[langue][type](eleve, ecole, details)
  const numero = telephoneEcole?.trim()

  return numero ? `${texte} ${CONTACT[langue](numero)}` : texte
}
