import "server-only"
import { cookies } from "next/headers"
import { createHash, randomBytes } from "crypto"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Le dossier qu'un parent a le droit de voir.
 *
 * =====================================================================
 * UNE PROJECTION ARRÊTÉE, PAS UN ACCÈS
 * =====================================================================
 *
 * Ce fichier est la seule chose qui se tienne entre un code à huit
 * caractères et la base d'un établissement. Il ne donne pas « accès à
 * l'élève » : il construit un objet précis, colonne par colonne, et rend
 * cet objet-là.
 *
 * La différence est tout sauf théorique. Ouvrir une policy à `anon` sur
 * `grades` ou `fee_payments`, même conditionnée au code, exposerait ces
 * tables entières à l'API publique — et il faudrait que la condition
 * soit parfaite pour toujours, y compris après chaque colonne ajoutée
 * par un futur développeur. Ici, une colonne ajoutée demain ne sortira
 * pas tant que personne ne l'aura écrite dans ce fichier.
 *
 * =====================================================================
 * CE QUE LE PARENT NE VOIT PAS
 * =====================================================================
 *
 *   les lignes ANNULÉES — une retenue levée ou un paiement annulé ne
 *   doivent pas apparaître comme vivants ; le parent n'a pas le contexte
 *   pour lire une correction interne ;
 *
 *   le journal des messages, les notes des autres élèves, les noms des
 *   personnels, les montants de rémunération, l'identité de qui a saisi
 *   quoi. Rien de tout cela ne le concerne, donc rien n'est lu.
 *
 * =====================================================================
 * LA SESSION
 * =====================================================================
 *
 * Le code ne voyage JAMAIS dans une URL : ni en chemin, ni en paramètre.
 * Une URL se retrouve dans l'historique du navigateur, dans les journaux
 * d'un serveur mandataire, et dans l'en-tête `Referer` envoyé au site
 * suivant. Le parent le saisit dans un formulaire ; le serveur pose
 * ensuite un cookie `httpOnly`, que le JavaScript de la page ne peut pas
 * lire.
 *
 * Le cookie ne contient pas le code : il contient un JETON DE SESSION
 * tiré au hasard, dont seule l'empreinte est conservée. Un cookie volé
 * se révoque donc sans changer le papier remis à la famille.
 */

const COOKIE = "ridwane_parent"

/* Une année scolaire tient dans six mois de session ; au-delà, on retape. */
const DUREE_SESSION = 60 * 60 * 24 * 180

export type DossierParent = {
  eleve: {
    nom: string
    matricule: string | null
    classe: string | null
    annee: string | null
  }
  ecole: { nom: string; telephone: string | null }
  matieres: { matiere: string; moyenne: number | null; notes: number }[]
  moyenneGenerale: number | null
  absences: { date: string; statut: string; matiere: string | null }[]
  discipline: { date: string; type: string; motif: string | null }[]
  scolarite: { du: number; paye: number; reste: number } | null
}

function empreinte(valeur: string) {
  return createHash("sha256").update(valeur).digest("hex")
}

/* ------------------------------------------------------------------ */
/*                              SESSION                                */
/* ------------------------------------------------------------------ */

/**
 * Échange un code contre une session, et rend l'identifiant du code.
 *
 * Rend `null` si le code est inconnu ou révoqué — **le même `null` dans
 * les deux cas**. Distinguer « ce code n'existe pas » de « ce code a été
 * révoqué » dirait à qui essaie des codes au hasard quand il a touché
 * juste.
 */
export async function ouvrirSession(codeSaisi: string) {
  const code = codeSaisi.trim().toUpperCase().replace(/[\s-]/g, "")

  if (!/^[A-Z0-9]{8}$/.test(code)) {
    return null
  }

  const { data } = await supabaseAdmin
    .from("student_access_codes")
    .select("id, student_id, school_id")
    .eq("code", code)
    .is("revoked_at", null)
    .maybeSingle()

  if (!data) {
    return null
  }

  const jeton = randomBytes(32).toString("hex")

  /*
   * `last_used_at` répond à la seule question que le secrétariat se
   * posera : ce parent s'en sert-il ? Faut-il lui réexpliquer, ou est-ce
   * inutile de réimprimer.
   */
  await supabaseAdmin
    .from("student_access_codes")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)

  const boite = await cookies()

  boite.set(COOKIE, `${data.id}.${jeton}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DUREE_SESSION,
  })

  return data.id as string
}

export async function fermerSession() {
  const boite = await cookies()
  boite.delete(COOKIE)
}

/**
 * L'identifiant du code porté par la session, s'il est toujours valide.
 *
 * La révocation est revérifiée À CHAQUE LECTURE, jamais mémorisée dans
 * le cookie : c'est ce qui fait qu'un code retiré ferme la porte tout de
 * suite, y compris pour un parent déjà connecté.
 */
export async function sessionCourante() {
  const boite = await cookies()
  const brut = boite.get(COOKIE)?.value

  if (!brut) {
    return null
  }

  const id = brut.split(".")[0]

  if (!id) {
    return null
  }

  const { data } = await supabaseAdmin
    .from("student_access_codes")
    .select("id")
    .eq("id", id)
    .is("revoked_at", null)
    .maybeSingle()

  return data ? id : null
}

/* ------------------------------------------------------------------ */
/*                             LE DOSSIER                              */
/* ------------------------------------------------------------------ */

export async function lireDossier(codeId: string): Promise<DossierParent | null> {
  const { data: acces } = await supabaseAdmin
    .from("student_access_codes")
    .select("student_id, school_id")
    .eq("id", codeId)
    .is("revoked_at", null)
    .maybeSingle()

  if (!acces) {
    return null
  }

  const { student_id: eleveId, school_id: ecoleId } = acces

  const [eleveRes, ecoleRes, anneeRes] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("first_name, last_name, matricule")
      .eq("id", eleveId)
      .maybeSingle(),
    supabaseAdmin
      .from("schools")
      .select("name, phone, grading_scale")
      .eq("id", ecoleId)
      .maybeSingle(),
    supabaseAdmin
      .from("academic_years")
      .select("id, name, start_date, end_date")
      .eq("school_id", ecoleId)
      .eq("is_active", true)
      .maybeSingle(),
  ])

  if (!eleveRes.data || !ecoleRes.data) {
    return null
  }

  const annee = anneeRes.data
  const debut = annee?.start_date ?? "1900-01-01"
  const fin = annee?.end_date ?? "2999-12-31"

  const [inscriptionRes, notesRes, journeeRes, leconRes, retenuesRes, manquementsRes, fraisRes] =
    await Promise.all([
      supabaseAdmin
        .from("student_class_enrollments")
        .select("classes ( name )")
        .eq("student_id", eleveId)
        .eq("academic_year_id", annee?.id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle(),

      /*
       * Les notes annulées sont écartées ici, à la source. Un parent qui
       * verrait une note corrigée à côté de la bonne n'aurait aucun
       * moyen de savoir laquelle compte.
       */
      supabaseAdmin
        .from("grades")
        .select("score, assessments ( max_score, coefficient, subjects ( name ) )")
        .eq("student_id", eleveId)
        .is("cancelled_at", null),

      supabaseAdmin
        .from("attendance")
        .select("attendance_date, status")
        .eq("student_id", eleveId)
        .is("cancelled_at", null)
        .gte("attendance_date", debut)
        .lte("attendance_date", fin)
        .order("attendance_date", { ascending: false })
        .limit(60),

      supabaseAdmin
        .from("lesson_attendance")
        .select("lesson_date, status, subjects ( name )")
        .eq("student_id", eleveId)
        .is("cancelled_at", null)
        .gte("lesson_date", debut)
        .lte("lesson_date", fin)
        .order("lesson_date", { ascending: false })
        .limit(60),

      supabaseAdmin
        .from("detentions")
        .select("detention_date, reason")
        .eq("student_id", eleveId)
        .is("cancelled_at", null)
        .gte("detention_date", debut)
        .lte("detention_date", fin),

      supabaseAdmin
        .from("rule_violations")
        .select("violation_date, note, school_rules ( label )")
        .eq("student_id", eleveId)
        .is("cancelled_at", null)
        .gte("violation_date", debut)
        .lte("violation_date", fin),

      supabaseAdmin
        .from("fee_assessments")
        .select("amount_due, fee_payments ( amount_paid, cancelled_at )")
        .eq("student_id", eleveId)
        .is("cancelled_at", null),
    ])

  /* ------------------------------------------------ les moyennes */
  const bareme = Number(ecoleRes.data.grading_scale ?? 20)

  const parMatiere = new Map<string, { somme: number; coef: number; nb: number }>()

  for (const g of notesRes.data ?? []) {
    const evaluation = g.assessments as unknown as {
      max_score: number | null
      coefficient: number | null
      subjects: { name: string } | null
    } | null

    if (!evaluation?.max_score) continue

    const matiere = evaluation.subjects?.name ?? "Sans matière"
    const coef = Number(evaluation.coefficient ?? 1)
    const sur20 = (Number(g.score) / Number(evaluation.max_score)) * bareme

    const cumul = parMatiere.get(matiere) ?? { somme: 0, coef: 0, nb: 0 }

    parMatiere.set(matiere, {
      somme: cumul.somme + sur20 * coef,
      coef: cumul.coef + coef,
      nb: cumul.nb + 1,
    })
  }

  const matieres = [...parMatiere.entries()]
    .map(([matiere, c]) => ({
      matiere,
      moyenne: c.coef > 0 ? Math.round((c.somme / c.coef) * 100) / 100 : null,
      notes: c.nb,
    }))
    .sort((a, b) => a.matiere.localeCompare(b.matiere, "fr"))

  const avecMoyenne = matieres.filter((m) => m.moyenne !== null)

  const moyenneGenerale =
    avecMoyenne.length > 0
      ? Math.round(
          (avecMoyenne.reduce((t, m) => t + (m.moyenne ?? 0), 0) /
            avecMoyenne.length) *
            100
        ) / 100
      : null

  /* ------------------------------------------------ les absences */
  const absences = [
    ...(journeeRes.data ?? []).map((a) => ({
      date: a.attendance_date as string,
      statut: a.status as string,
      matiere: null as string | null,
    })),
    ...(leconRes.data ?? []).map((a) => ({
      date: a.lesson_date as string,
      statut: a.status as string,
      matiere:
        (a.subjects as unknown as { name: string } | null)?.name ?? null,
    })),
  ]
    .filter((a) => a.statut !== "present" && a.statut !== "présent")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40)

  /* ----------------------------------------------- la discipline */
  const discipline = [
    ...(retenuesRes.data ?? []).map((d) => ({
      date: d.detention_date as string,
      type: "Retenue",
      motif: d.reason as string | null,
    })),
    ...(manquementsRes.data ?? []).map((m) => ({
      date: m.violation_date as string,
      type:
        (m.school_rules as unknown as { label: string } | null)?.label ??
        "Manquement",
      motif: m.note as string | null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  /* ----------------------------------------------- la scolarité */
  let du = 0
  let paye = 0

  for (const f of fraisRes.data ?? []) {
    du += Number(f.amount_due ?? 0)

    const versements = (f.fee_payments ?? []) as unknown as {
      amount_paid: number
      cancelled_at: string | null
    }[]

    for (const v of versements) {
      if (!v.cancelled_at) {
        paye += Number(v.amount_paid ?? 0)
      }
    }
  }

  const scolarite =
    (fraisRes.data ?? []).length > 0
      ? { du, paye, reste: Math.max(du - paye, 0) }
      : null

  return {
    eleve: {
      nom: `${eleveRes.data.last_name} ${eleveRes.data.first_name}`.trim(),
      matricule: eleveRes.data.matricule,
      classe:
        (inscriptionRes.data?.classes as unknown as { name: string } | null)
          ?.name ?? null,
      annee: annee?.name ?? null,
    },
    ecole: { nom: ecoleRes.data.name ?? "", telephone: ecoleRes.data.phone },
    matieres,
    moyenneGenerale,
    absences,
    discipline,
    scolarite,
  }
}

/** Sert au journal des essais : on compte par empreinte, jamais par IP. */
export function empreinteVisiteur(sel: string, adresse: string) {
  return empreinte(`${sel}:${adresse}`).slice(0, 32)
}
