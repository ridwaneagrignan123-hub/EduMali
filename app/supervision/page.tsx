"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { VIE_SCOLAIRE } from "@/src/lib/roles"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"
import {
  COULEUR_STATUT,
  Comptage,
  LIBELLE_STATUT,
  composerMessage,
  debutSemaine,
  joursSemaine,
  niveauMessage,
  versDateISO,
} from "@/src/lib/vie-scolaire"

/*
 * Tableau de la vie scolaire.
 *
 * Trois choses qui vont ensemble dans la journée du surveillant :
 * relever les retards des enseignants, poser le thème que chacun
 * débattra au rang avant d'entrer, et publier les rappels du jour.
 *
 * Les avertissements ne partent pas tout seuls : ni le courriel ni le
 * SMS ne sont opérationnels sur ce projet. Le surveillant obtient donc
 * un texte prêt à transmettre, par WhatsApp ou de la main à la main —
 * le même parti pris que pour les liens d'accès.
 */

type Enseignant = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
}

type Releve = {
  id: string
  teacher_id: string
  occurred_on: string
  status: string
  minutes_late: number | null
  note: string | null
}

type Theme = {
  id: string
  teacher_id: string
  scheduled_on: string
  theme: string
}

type Rappel = {
  id: string
  reminder_date: string
  message: string
}

/*
 * Un créneau de la journée, tel que `slots_a_pointer` le rend : ce qui
 * était PROGRAMMÉ ce jour-là, avec l'état de son pointage. La liste ne
 * peut pas contenir un enseignant qui n'a pas cours — elle sort de
 * l'emploi du temps, jamais d'un choix libre.
 *
 * Aucun montant n'y figure, et c'est ce qui rend cet écran ouvert au
 * surveillant : il confirme des heures, il ne voit pas ce qu'elles
 * coûtent.
 */
type CreneauAPointer = {
  slot_id: string
  class_id: string
  classe: string
  matiere: string
  filiere: string | null
  teacher_id: string | null
  enseignant: string | null
  start_time: string
  end_time: string
  duree: number
  checkin_id: string | null
  heures_pointees: number | null
  pointe_par: string | null
  pointe_le: string | null
  annule: boolean | null
  motif_annulation: string | null
  mois_cloture: boolean
}

/* Un élève de l'établissement, pour la saisie disciplinaire. */
type EleveSimple = {
  id: string
  first_name: string
  last_name: string
  parent_phone: string | null
}

type Retenue = {
  id: string
  student_id: string
  detention_date: string
  reason: string
  students: { first_name: string; last_name: string } | null
}

type Onglet = "retards" | "pointage" | "retenues" | "themes" | "rappels"

export default function SupervisionPage() {
  const router = useRouter()
  const gate = useRoleGate(VIE_SCOLAIRE)

  const [onglet, setOnglet] = useState<Onglet>("retards")
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const [ecole, setEcole] = useState("")
  const [enseignants, setEnseignants] = useState<Enseignant[]>([])
  const [releves, setReleves] = useState<Releve[]>([])
  const [themes, setThemes] = useState<Theme[]>([])
  const [rappels, setRappels] = useState<Rappel[]>([])

  /* Retenues : la saisie et l'historique récent. */
  const [eleves, setEleves] = useState<EleveSimple[]>([])
  const [retenues, setRetenues] = useState<Retenue[]>([])
  const [retenueEleveId, setRetenueEleveId] = useState("")
  const [retenueDate, setRetenueDate] = useState(versDateISO(new Date()))
  const [retenueMotif, setRetenueMotif] = useState("")
  const [retenueEnCours, setRetenueEnCours] = useState(false)
  const [retenueErreur, setRetenueErreur] = useState<string | null>(null)
  const [retenueMessage, setRetenueMessage] = useState<string | null>(null)
  const [signalementEnCours, setSignalementEnCours] = useState<string | null>(null)

  /* Pointage : la journée examinée et ses créneaux programmés. */
  const [datePointage, setDatePointage] = useState(versDateISO(new Date()))
  const [creneaux, setCreneaux] = useState<CreneauAPointer[]>([])
  const [chargementCreneaux, setChargementCreneaux] = useState(false)
  const [pointageEnCours, setPointageEnCours] = useState<string | null>(null)
  const [erreurPointage, setErreurPointage] = useState<string | null>(null)

  // Saisie d'un relevé
  const [enseignantId, setEnseignantId] = useState("")
  const [dateReleve, setDateReleve] = useState(versDateISO(new Date()))
  const [statut, setStatut] = useState("retard")
  const [minutes, setMinutes] = useState("")
  const [noteReleve, setNoteReleve] = useState("")
  const [enregistrement, setEnregistrement] = useState(false)

  // Semaine affichée pour les thèmes
  const [lundi, setLundi] = useState(() => debutSemaine(new Date()))

  // Rappel du jour
  const [messageRappel, setMessageRappel] = useState("")
  const [dateRappel, setDateRappel] = useState(versDateISO(new Date()))

  // Message d'avertissement en cours de composition
  const [messagePour, setMessagePour] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)

  const chargerDonnees = useCallback(async (schoolId: string) => {
    const debut = versDateISO(lundi)
    const finDate = new Date(lundi)
    finDate.setDate(finDate.getDate() + 5)

    const [
      ecoleResultat,
      enseignantsResultat,
      relevesResultat,
      themesResultat,
      rappelsResultat,
    ] = await Promise.all([
      supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
      supabase
        .from("teachers")
        .select("id, first_name, last_name, phone")
        .eq("status", "active")
        .order("last_name"),
      supabase
        .from("teacher_attendance")
        .select("id, teacher_id, occurred_on, status, minutes_late, note")
        .order("occurred_on", { ascending: false })
        .limit(400),
      supabase
        .from("lineup_themes")
        .select("id, teacher_id, scheduled_on, theme")
        .gte("scheduled_on", debut)
        .lte("scheduled_on", versDateISO(finDate)),
      supabase
        .from("daily_reminders")
        .select("id, reminder_date, message")
        .order("reminder_date", { ascending: false })
        .limit(30),
    ])

    const premiereErreur =
      enseignantsResultat.error ??
      relevesResultat.error ??
      themesResultat.error ??
      rappelsResultat.error

    if (premiereErreur) {
      console.error("Erreur vie scolaire :", premiereErreur)
      setErreur(
        "Certaines données n'ont pas pu être chargées. Rechargez la page."
      )
    } else {
      setErreur(null)
    }

    setEcole(ecoleResultat.data?.name ?? "votre établissement")
    setEnseignants(enseignantsResultat.data ?? [])
    setReleves(relevesResultat.data ?? [])
    setThemes(themesResultat.data ?? [])
    setRappels(rappelsResultat.data ?? [])
    setChargement(false)
  }, [lundi])

  useEffect(() => {
    if (gate.statut !== "autorise") {
      return
    }

    const schoolId = gate.schoolId

    /*
     * Le chargement passe par une fonction interne : appeler
     * directement chargerDonnees dans le corps de l'effet reviendrait à
     * y déclencher une mise à jour d'état synchrone, et à enchaîner les
     * rendus.
     */
    async function lancer() {
      await chargerDonnees(schoolId)
    }

    lancer()
  }, [gate, chargerDonnees])

  /*
   * Les créneaux programmés le jour choisi. `slots_a_pointer` écarte
   * déjà les jours fériés, les dates hors année scolaire et les jours
   * où le créneau n'a pas lieu : la liste ne contient que du pointable.
   */
  /* Les élèves de l'école et les retenues récentes. */
  const chargerDiscipline = useCallback(async () => {
    const [elevesResultat, retenuesResultat] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name, parent_phone")
        .order("last_name"),
      supabase
        .from("detentions")
        .select("id, student_id, detention_date, reason, students ( first_name, last_name )")
        .order("detention_date", { ascending: false })
        .limit(50),
    ])

    if (elevesResultat.error || retenuesResultat.error) {
      console.error(
        "Erreur discipline :",
        elevesResultat.error ?? retenuesResultat.error
      )
      setRetenueErreur("Les élèves ou les retenues n'ont pas pu être lus.")
      return
    }

    setEleves((elevesResultat.data as EleveSimple[]) ?? [])
    setRetenues((retenuesResultat.data as unknown as Retenue[]) ?? [])
  }, [])

  useEffect(() => {
    if (gate.statut !== "autorise" || onglet !== "retenues") {
      return
    }

    async function lancer() {
      await chargerDiscipline()
    }

    lancer()
  }, [gate, onglet, chargerDiscipline])

  async function enregistrerRetenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (gate.statut !== "autorise" || !retenueEleveId) {
      return
    }

    if (retenueMotif.trim().length < 3) {
      setRetenueErreur("Le motif de la retenue est obligatoire.")
      return
    }

    setRetenueEnCours(true)
    setRetenueErreur(null)
    setRetenueMessage(null)

    const { error } = await supabase.from("detentions").insert({
      school_id: gate.schoolId,
      student_id: retenueEleveId,
      detention_date: retenueDate,
      reason: retenueMotif.trim(),
    })

    setRetenueEnCours(false)

    if (error) {
      console.error("Erreur retenue :", error)
      setRetenueErreur(error.message)
      return
    }

    setRetenueMotif("")
    setRetenueMessage("Retenue enregistrée.")
    await chargerDiscipline()
  }

  /*
   * « Signaler aux parents » — un clic, un message dans la file. Comme
   * partout, le geste est délibéré : enregistrer une retenue ne prévient
   * pas la famille tout seul.
   */
  async function signalerRetenue(retenue: Retenue) {
    setSignalementEnCours(retenue.id)
    setRetenueErreur(null)
    setRetenueMessage(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setRetenueErreur("Votre session a expiré. Reconnectez-vous.")
        return
      }

      const response = await fetch("/api/parent-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          studentId: retenue.student_id,
          eventType: "retenue",
          relatedId: retenue.id,
          details: { date: retenue.detention_date, motif: retenue.reason },
        }),
      })

      const resultat = await response.json()

      if (!response.ok) {
        setRetenueErreur(resultat.error ?? "Le message n'a pas pu être créé.")
        return
      }

      setRetenueMessage(
        resultat.statut === "sent"
          ? "Message envoyé au parent."
          : `Message enregistré. ${resultat.raison ?? ""}`
      )
    } catch (error) {
      console.error("Erreur signalement :", error)
      setRetenueErreur("Le serveur n'a pas répondu.")
    } finally {
      setSignalementEnCours(null)
    }
  }

  const chargerCreneaux = useCallback(async (jour: string) => {
    setChargementCreneaux(true)
    setErreurPointage(null)

    const { data, error } = await supabase.rpc("slots_a_pointer", {
      p_date: jour,
    })

    if (error) {
      console.error("Erreur créneaux :", error)
      setErreurPointage("Les créneaux de cette journée n'ont pas pu être lus.")
      setCreneaux([])
    } else {
      setCreneaux((data as CreneauAPointer[]) ?? [])
    }

    setChargementCreneaux(false)
  }, [])

  useEffect(() => {
    if (gate.statut !== "autorise" || onglet !== "pointage") {
      return
    }

    async function lancer() {
      await chargerCreneaux(datePointage)
    }

    lancer()
  }, [gate, onglet, datePointage, chargerCreneaux])

  /* Confirme une heure assurée. La durée par défaut est celle du créneau. */
  async function pointer(creneau: CreneauAPointer, heuresAPointer: number) {
    if (gate.statut !== "autorise") {
      return
    }

    setPointageEnCours(creneau.slot_id)
    setErreurPointage(null)

    const { error } = await supabase.from("timetable_checkins").insert({
      school_id: gate.schoolId,
      slot_id: creneau.slot_id,
      occurred_on: datePointage,
      hours: heuresAPointer,
    })

    setPointageEnCours(null)

    if (error) {
      console.error("Erreur pointage :", error)
      // Les déclencheurs renvoient déjà une phrase lisible.
      setErreurPointage(error.message || "Le pointage a échoué.")
      return
    }

    await chargerCreneaux(datePointage)
  }

  /*
   * Un pointage erroné ne s'efface pas : il s'annule avec un motif, qui
   * part dans le journal d'activité. La ligne reste visible.
   */
  async function annulerPointage(creneau: CreneauAPointer) {
    if (!creneau.checkin_id) {
      return
    }

    const motif = window.prompt(
      "Pourquoi annuler ce pointage ? Le motif est conservé dans le journal d'activité."
    )

    if (motif === null) {
      return
    }

    if (motif.trim().length < 3) {
      setErreurPointage("Le motif d'annulation est obligatoire.")
      return
    }

    setPointageEnCours(creneau.slot_id)
    setErreurPointage(null)

    const { error } = await supabase
      .from("timetable_checkins")
      /*
       * cancelled_by n'est pas envoyé : le déclencheur l'impose depuis
       * auth.uid(), comme pour une annulation de reçu. Ce que le client
       * enverrait serait de toute façon écrasé.
       */
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motif.trim(),
      })
      .eq("id", creneau.checkin_id)

    setPointageEnCours(null)

    if (error) {
      console.error("Erreur annulation :", error)
      setErreurPointage(error.message || "L'annulation a échoué.")
      return
    }

    await chargerCreneaux(datePointage)
  }

  async function enregistrerReleve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!enseignantId) return

    setEnregistrement(true)

    const { error } = await supabase.from("teacher_attendance").insert({
      school_id: gate.statut === "autorise" ? gate.schoolId : null,
      teacher_id: enseignantId,
      occurred_on: dateReleve,
      status: statut,
      minutes_late: statut === "retard" && minutes ? Number(minutes) : null,
      note: noteReleve.trim() || null,
    })

    setEnregistrement(false)

    if (error) {
      console.error("Erreur enregistrement :", error)

      setErreur(
        error.code === "23505"
          ? "Ce relevé existe déjà pour cet enseignant à cette date."
          : "Le relevé n'a pas pu être enregistré."
      )
      return
    }

    setErreur(null)
    setMinutes("")
    setNoteReleve("")

    if (gate.statut === "autorise") {
      await chargerDonnees(gate.schoolId)
    }
  }

  async function supprimerReleve(id: string) {
    const { error } = await supabase
      .from("teacher_attendance")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Erreur suppression :", error)
      setErreur("Ce relevé n'a pas pu être retiré.")
      return
    }

    setReleves((actuels) => actuels.filter((releve) => releve.id !== id))
  }

  async function enregistrerTheme(
    teacherId: string,
    jour: string,
    texte: string
  ) {
    const existant = themes.find(
      (theme) => theme.teacher_id === teacherId && theme.scheduled_on === jour
    )

    if (!texte.trim()) {
      if (!existant) return

      await supabase.from("lineup_themes").delete().eq("id", existant.id)
      setThemes((actuels) => actuels.filter((t) => t.id !== existant.id))
      return
    }

    if (existant) {
      const { error } = await supabase
        .from("lineup_themes")
        .update({ theme: texte.trim() })
        .eq("id", existant.id)

      if (error) {
        console.error("Erreur thème :", error)
        setErreur("Ce thème n'a pas pu être enregistré.")
        return
      }

      setThemes((actuels) =>
        actuels.map((t) =>
          t.id === existant.id ? { ...t, theme: texte.trim() } : t
        )
      )
      return
    }

    const { data, error } = await supabase
      .from("lineup_themes")
      .insert({
        school_id: gate.statut === "autorise" ? gate.schoolId : null,
        teacher_id: teacherId,
        scheduled_on: jour,
        theme: texte.trim(),
      })
      .select("id, teacher_id, scheduled_on, theme")
      .single()

    if (error) {
      console.error("Erreur thème :", error)
      setErreur("Ce thème n'a pas pu être enregistré.")
      return
    }

    setErreur(null)
    setThemes((actuels) => [...actuels, data])
  }

  async function publierRappel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!messageRappel.trim()) return

    const { error } = await supabase.from("daily_reminders").insert({
      school_id: gate.statut === "autorise" ? gate.schoolId : null,
      reminder_date: dateRappel,
      message: messageRappel.trim(),
    })

    if (error) {
      console.error("Erreur rappel :", error)
      setErreur("Ce rappel n'a pas pu être publié.")
      return
    }

    setErreur(null)
    setMessageRappel("")

    if (gate.statut === "autorise") {
      await chargerDonnees(gate.schoolId)
    }
  }

  async function retirerRappel(id: string) {
    const { error } = await supabase.from("daily_reminders").delete().eq("id", id)

    if (error) {
      console.error("Erreur suppression rappel :", error)
      return
    }

    setRappels((actuels) => actuels.filter((rappel) => rappel.id !== id))
  }

  /* Comptage du mois en cours, par enseignant. */
  const comptages = useMemo(() => {
    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)

    const table = new Map<string, Comptage>()

    for (const releve of releves) {
      if (new Date(releve.occurred_on) < debutMois) continue

      const actuel = table.get(releve.teacher_id) ?? {
        retards: 0,
        absences: 0,
        absencesExcusees: 0,
      }

      if (releve.status === "retard") actuel.retards += 1
      else if (releve.status === "absence") actuel.absences += 1
      else actuel.absencesExcusees += 1

      table.set(releve.teacher_id, actuel)
    }

    return table
  }, [releves])

  const jours = useMemo(() => joursSemaine(lundi), [lundi])

  const enseignantsParId = useMemo(
    () => new Map(enseignants.map((e) => [e.id, e])),
    [enseignants]
  )

  const enseignantCible = messagePour
    ? enseignantsParId.get(messagePour)
    : undefined

  const messageCompose = enseignantCible
    ? composerMessage(
        enseignantCible.first_name,
        comptages.get(enseignantCible.id) ?? {
          retards: 0,
          absences: 0,
          absencesExcusees: 0,
        },
        "ce mois-ci",
        ecole
      )
    : ""

  async function copierMessage() {
    try {
      await navigator.clipboard.writeText(messageCompose)
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      setCopie(false)
    }
  }

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  if (chargement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement de la vie scolaire...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Vie scolaire</h1>

            <p className="mt-2 text-muted-foreground">
              Retards des enseignants, thèmes au rang et rappels du jour.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["retards", "Retards et absences"],
              ["pointage", "Pointage des cours"],
              ["retenues", "Retenues"],
              ["themes", "Thèmes au rang"],
              ["rappels", "Rappels"],
            ] as [Onglet, string][]
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              onClick={() => setOnglet(valeur)}
              className={
                onglet === valeur
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border px-4 py-1.5 text-sm hover:bg-muted"
              }
            >
              {libelle}
            </button>
          ))}
        </div>

        {/* ============ RETARDS ============ */}
        {onglet === "retards" && (
          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <div className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">Noter un retard</h2>

              {enseignants.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun enseignant actif n&apos;est enregistré.
                </p>
              ) : (
                <form onSubmit={enregistrerReleve} className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="enseignant" className="text-sm font-medium">
                      Enseignant
                    </label>

                    <select
                      id="enseignant"
                      value={enseignantId}
                      onChange={(event) => setEnseignantId(event.target.value)}
                      required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">À choisir</option>

                      {enseignants.map((enseignant) => (
                        <option key={enseignant.id} value={enseignant.id}>
                          {enseignant.last_name} {enseignant.first_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="date" className="text-sm font-medium">
                      Date
                    </label>

                    <input
                      id="date"
                      type="date"
                      value={dateReleve}
                      onChange={(event) => setDateReleve(event.target.value)}
                      required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="statut" className="text-sm font-medium">
                      Motif
                    </label>

                    <select
                      id="statut"
                      value={statut}
                      onChange={(event) => setStatut(event.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="retard">Retard</option>
                      <option value="absence">Absence</option>
                      <option value="absence_excusee">Absence excusée</option>
                    </select>
                  </div>

                  {statut === "retard" && (
                    <div className="space-y-2">
                      <label htmlFor="minutes" className="text-sm font-medium">
                        Minutes de retard
                      </label>

                      <input
                        id="minutes"
                        type="number"
                        min="0"
                        value={minutes}
                        onChange={(event) => setMinutes(event.target.value)}
                        placeholder="15"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label htmlFor="note" className="text-sm font-medium">
                      Remarque
                    </label>

                    <input
                      id="note"
                      type="text"
                      value={noteReleve}
                      onChange={(event) => setNoteReleve(event.target.value)}
                      placeholder="Facultatif"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={enregistrement}
                    className="w-full rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {enregistrement ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </form>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border bg-background p-6">
                <h2 className="text-lg font-semibold">Ce mois-ci</h2>

                {comptages.size === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Aucun retard relevé ce mois-ci. C&apos;est la meilleure
                    des nouvelles.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {[...comptages.entries()]
                      .sort(
                        (a, b) =>
                          b[1].retards +
                          b[1].absences * 2 -
                          (a[1].retards + a[1].absences * 2)
                      )
                      .map(([teacherId, comptage]) => {
                        const enseignant = enseignantsParId.get(teacherId)

                        if (!enseignant) return null

                        const niveau = niveauMessage(comptage)

                        return (
                          <div
                            key={teacherId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                          >
                            <div>
                              <p className="font-medium">
                                {enseignant.last_name} {enseignant.first_name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {comptage.retards} retard
                                {comptage.retards > 1 ? "s" : ""} ·{" "}
                                {comptage.absences} absence
                                {comptage.absences > 1 ? "s" : ""}
                                {comptage.absencesExcusees > 0 &&
                                  ` · ${comptage.absencesExcusees} excusée${comptage.absencesExcusees > 1 ? "s" : ""}`}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                style={{
                                  color:
                                    niveau === "serieux"
                                      ? "oklch(0.5 0.19 25)"
                                      : niveau === "attentif"
                                        ? "oklch(0.45 0.14 78)"
                                        : "oklch(0.45 0.13 155)",
                                  background:
                                    niveau === "serieux"
                                      ? "oklch(0.55 0.19 25 / 0.13)"
                                      : niveau === "attentif"
                                        ? "oklch(0.80 0.14 78 / 0.2)"
                                        : "oklch(0.55 0.13 155 / 0.15)",
                                }}
                              >
                                {niveau === "serieux"
                                  ? "À recevoir"
                                  : niveau === "attentif"
                                    ? "À suivre"
                                    : "Léger"}
                              </span>

                              <button
                                onClick={() => setMessagePour(teacherId)}
                                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                              >
                                Préparer le message
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              {enseignantCible && (
                <div
                  className="rounded-xl border p-6"
                  style={{
                    background: "oklch(0.80 0.14 78 / 0.12)",
                    borderColor: "oklch(0.57 0.14 78 / 0.5)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-medium">
                      Message pour {enseignantCible.first_name}{" "}
                      {enseignantCible.last_name}
                    </h3>

                    <button
                      onClick={() => setMessagePour(null)}
                      aria-label="Fermer"
                      className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Ni le courriel ni le SMS ne sont configurés sur cet
                    établissement : ce texte est à transmettre vous-même.
                  </p>

                  <textarea
                    readOnly
                    value={messageCompose}
                    rows={6}
                    className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={copierMessage}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      {copie ? "Message copié" : "Copier le message"}
                    </button>

                    <a
                      href={
                        enseignantCible.phone
                          ? `https://wa.me/${enseignantCible.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(messageCompose)}`
                          : `https://wa.me/?text=${encodeURIComponent(messageCompose)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                    >
                      Envoyer par WhatsApp
                    </a>
                  </div>

                  {!enseignantCible.phone && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aucun numéro n&apos;est enregistré pour cet enseignant :
                      WhatsApp vous demandera le destinataire.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-xl border bg-background p-6">
                <h2 className="text-lg font-semibold">Derniers relevés</h2>

                {releves.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Rien n&apos;a encore été relevé.
                  </p>
                ) : (
                  <div className="mt-4 space-y-1">
                    {releves.slice(0, 15).map((releve) => {
                      const enseignant = enseignantsParId.get(releve.teacher_id)

                      return (
                        <div
                          key={releve.id}
                          className="flex flex-wrap items-center gap-3 border-b py-2 text-sm last:border-0"
                        >
                          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                            {new Date(releve.occurred_on).toLocaleDateString(
                              "fr-FR",
                              { day: "2-digit", month: "short" }
                            )}
                          </span>

                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                            style={{ background: COULEUR_STATUT[releve.status] }}
                          >
                            {LIBELLE_STATUT[releve.status]}
                            {releve.minutes_late
                              ? ` ${releve.minutes_late} min`
                              : ""}
                          </span>

                          <span className="flex-1">
                            {enseignant
                              ? `${enseignant.last_name} ${enseignant.first_name}`
                              : "Enseignant retiré"}
                          </span>

                          {releve.note && (
                            <span className="text-xs text-muted-foreground">
                              {releve.note}
                            </span>
                          )}

                          <button
                            onClick={() => supprimerReleve(releve.id)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Retirer
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ POINTAGE DES COURS ============ */}
        {onglet === "pointage" && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Confirmer les cours assurés
                </h2>

                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Seuls les créneaux réellement programmés ce jour-là
                  apparaissent. Confirmer une heure engage l&apos;école à la
                  payer : le pointage porte votre nom et l&apos;heure exacte à
                  laquelle vous l&apos;avez posé.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="date-pointage" className="block text-sm">
                  Journée
                </label>

                <input
                  id="date-pointage"
                  type="date"
                  value={datePointage}
                  max={versDateISO(new Date())}
                  onChange={(event) => setDatePointage(event.target.value)}
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            {erreurPointage && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {erreurPointage}
              </div>
            )}

            {creneaux.length > 0 && creneaux[0].mois_cloture && (
              <div className="mt-4 rounded-lg border p-3 text-sm">
                La paie de ce mois est <strong>clôturée</strong> : ses
                pointages sont figés et ne peuvent plus être modifiés.
              </div>
            )}

            {chargementCreneaux ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Lecture de l&apos;emploi du temps...
              </p>
            ) : creneaux.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Aucun cours n&apos;est programmé ce jour-là. Ce peut être un
                jour de vacances, un jour férié, une date hors année
                scolaire, ou un jour sans créneau à l&apos;emploi du temps.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {creneaux.map((creneau) => {
                  const pointe = Boolean(creneau.checkin_id) && !creneau.annule
                  const enCours = pointageEnCours === creneau.slot_id

                  return (
                    <div
                      key={creneau.slot_id}
                      className="flex flex-wrap items-center gap-4 rounded-lg border p-4"
                    >
                      <span className="w-28 shrink-0 tabular-nums text-sm text-muted-foreground">
                        {creneau.start_time.slice(0, 5)} –{" "}
                        {creneau.end_time.slice(0, 5)}
                      </span>

                      <div className="min-w-[200px] flex-1">
                        <p className="font-medium">
                          {creneau.enseignant ?? "Aucun enseignant"}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {creneau.classe} — {creneau.matiere}
                          {creneau.filiere ? ` (${creneau.filiere})` : ""} —{" "}
                          {creneau.duree} h
                        </p>
                      </div>

                      {creneau.annule ? (
                        <div className="text-sm">
                          <p className="font-medium">Pointage annulé</p>

                          <p className="text-xs text-muted-foreground">
                            {creneau.motif_annulation}
                          </p>
                        </div>
                      ) : pointe ? (
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <p className="font-medium">
                              {creneau.heures_pointees} h confirmée(s)
                            </p>

                            <p className="text-xs text-muted-foreground">
                              par {creneau.pointe_par ?? "—"}
                              {creneau.pointe_le
                                ? ` le ${new Date(creneau.pointe_le).toLocaleString("fr-FR")}`
                                : ""}
                            </p>
                          </div>

                          {!creneau.mois_cloture && (
                            <button
                              onClick={() => annulerPointage(creneau)}
                              disabled={enCours}
                              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      ) : !creneau.teacher_id ? (
                        <span className="text-sm text-muted-foreground">
                          Créneau sans enseignant — rien à pointer
                        </span>
                      ) : creneau.mois_cloture ? (
                        <span className="text-sm text-muted-foreground">
                          Mois clôturé
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/*
                            Une durée réduite se pointe quand le cours n'a
                            été que partiellement assuré : on ne paie pas
                            deux heures là où une seule a été faite.
                          */}
                          <button
                            onClick={() => pointer(creneau, creneau.duree)}
                            disabled={enCours}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                          >
                            {enCours ? "..." : `Assuré (${creneau.duree} h)`}
                          </button>

                          <button
                            onClick={() => {
                              const saisie = window.prompt(
                                `Combien d'heures ont été réellement assurées ? (maximum ${creneau.duree})`,
                                String(creneau.duree)
                              )

                              if (saisie === null) return

                              const valeur = Number(saisie.replace(",", "."))

                              if (
                                Number.isNaN(valeur) ||
                                valeur <= 0 ||
                                valeur > creneau.duree
                              ) {
                                setErreurPointage(
                                  `La durée doit être comprise entre 0 et ${creneau.duree} h.`
                                )
                                return
                              }

                              pointer(creneau, valeur)
                            }}
                            disabled={enCours}
                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                          >
                            Partiel
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ RETENUES ============ */}
        {onglet === "retenues" && (
          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <div className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">Enregistrer une retenue</h2>

              <form onSubmit={enregistrerRetenue} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="retenue-eleve">Élève *</label>

                  <select
                    id="retenue-eleve"
                    value={retenueEleveId}
                    onChange={(event) => setRetenueEleveId(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  >
                    <option value="">Choisir un élève</option>

                    {eleves.map((eleve) => (
                      <option key={eleve.id} value={eleve.id}>
                        {eleve.last_name} {eleve.first_name}
                        {eleve.parent_phone ? "" : " — sans numéro parent"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="retenue-date">Date *</label>

                  <input
                    id="retenue-date"
                    type="date"
                    value={retenueDate}
                    onChange={(event) => setRetenueDate(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="retenue-motif">Motif *</label>

                  <textarea
                    id="retenue-motif"
                    value={retenueMotif}
                    onChange={(event) => setRetenueMotif(event.target.value)}
                    rows={3}
                    placeholder="Ex : bavardages répétés en classe"
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />

                  <p className="text-xs text-muted-foreground">
                    Le motif figure dans le message aux parents : écrivez-le
                    comme la famille doit le lire.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={retenueEnCours}
                  className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
                >
                  {retenueEnCours ? "Enregistrement..." : "Enregistrer la retenue"}
                </button>
              </form>
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">Retenues récentes</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Enregistrer une retenue ne prévient pas la famille : le
                signalement est un geste à part, pour qu&apos;il reste
                délibéré.
              </p>

              {retenueErreur && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {retenueErreur}
                </div>
              )}

              {retenueMessage && (
                <p className="mt-4 rounded-lg border p-3 text-sm">
                  {retenueMessage}
                </p>
              )}

              {retenues.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  Aucune retenue enregistrée.
                </p>
              ) : (
                <div className="mt-6 space-y-3">
                  {retenues.map((retenue) => (
                    <div
                      key={retenue.id}
                      className="flex flex-wrap items-center gap-4 rounded-lg border p-4"
                    >
                      <span className="w-24 shrink-0 tabular-nums text-sm text-muted-foreground">
                        {new Date(
                          `${retenue.detention_date}T00:00:00`
                        ).toLocaleDateString("fr-FR")}
                      </span>

                      <div className="min-w-[200px] flex-1">
                        <p className="font-medium">
                          {retenue.students?.last_name}{" "}
                          {retenue.students?.first_name}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {retenue.reason}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => signalerRetenue(retenue)}
                        disabled={signalementEnCours === retenue.id}
                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                      >
                        {signalementEnCours === retenue.id
                          ? "..."
                          : "Signaler aux parents"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ THEMES AU RANG ============ */}
        {onglet === "themes" && (
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Thèmes au rang</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Le thème que chaque enseignant débattra avec ses élèves
                  avant d&apos;entrer en classe.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const precedent = new Date(lundi)
                    precedent.setDate(precedent.getDate() - 7)
                    setLundi(precedent)
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  ← Semaine
                </button>

                <span className="text-sm tabular-nums text-muted-foreground">
                  {lundi.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>

                <button
                  onClick={() => {
                    const suivant = new Date(lundi)
                    suivant.setDate(suivant.getDate() + 7)
                    setLundi(suivant)
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Semaine →
                </button>
              </div>
            </div>

            {enseignants.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Aucun enseignant actif n&apos;est enregistré.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Enseignant</th>

                      {jours.map((jour) => (
                        <th
                          key={jour.toISOString()}
                          className="pb-2 pr-2 font-medium capitalize"
                        >
                          {jour.toLocaleDateString("fr-FR", {
                            weekday: "short",
                            day: "numeric",
                          })}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {enseignants.map((enseignant) => (
                      <tr key={enseignant.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">
                          {enseignant.last_name} {enseignant.first_name}
                        </td>

                        {jours.map((jour) => {
                          const cle = versDateISO(jour)
                          const existant = themes.find(
                            (theme) =>
                              theme.teacher_id === enseignant.id &&
                              theme.scheduled_on === cle
                          )

                          return (
                            <td key={cle} className="py-2 pr-2">
                              <input
                                type="text"
                                defaultValue={existant?.theme ?? ""}
                                placeholder="—"
                                onBlur={(event) =>
                                  enregistrerTheme(
                                    enseignant.id,
                                    cle,
                                    event.target.value
                                  )
                                }
                                className="w-full min-w-[110px] rounded-md border bg-background px-2 py-1.5 text-xs"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Chaque case s&apos;enregistre dès que vous la quittez. Videz-la
              pour retirer le thème.
            </p>
          </div>
        )}

        {/* ============ RAPPELS ============ */}
        {onglet === "rappels" && (
          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <div className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">Publier un rappel</h2>

              <form onSubmit={publierRappel} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="dateRappel" className="text-sm font-medium">
                    Date
                  </label>

                  <input
                    id="dateRappel"
                    type="date"
                    value={dateRappel}
                    onChange={(event) => setDateRappel(event.target.value)}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="messageRappel" className="text-sm font-medium">
                    Rappel
                  </label>

                  <textarea
                    id="messageRappel"
                    value={messageRappel}
                    onChange={(event) => setMessageRappel(event.target.value)}
                    rows={4}
                    required
                    placeholder="Rassemblement à 7h55 dans la cour."
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  Publier
                </button>
              </form>
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="text-lg font-semibold">Rappels publiés</h2>

              {rappels.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun rappel publié.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {rappels.map((rappel) => (
                    <div key={rappel.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {new Date(rappel.reminder_date).toLocaleDateString(
                            "fr-FR",
                            { weekday: "long", day: "numeric", month: "long" }
                          )}
                        </p>

                        <button
                          onClick={() => retirerRappel(rappel.id)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Retirer
                        </button>
                      </div>

                      <p className="mt-1 text-sm">{rappel.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
