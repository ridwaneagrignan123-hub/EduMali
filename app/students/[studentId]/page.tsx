"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { CodeAccesParent } from "@/components/code-acces-parent"
import {
  CLASSE_ANNULEE,
  MentionAnnulation,
  estAnnulee,
} from "@/components/mention-annulation"

/*
 * L'historique d'un élève — en lecture seule.
 *
 * ---------------------------------------------------------------------
 * UNE SYNTHÈSE, PAS UNE SOURCE
 *
 * Rien n'est stocké ici. Cet écran rassemble ce que quatre tables savent
 * déjà de l'élève : ses présences à la journée (`attendance`), ses
 * présences par leçon (`lesson_attendance`), ses retenues, ses
 * manquements au règlement, et les messages partis — ou en attente — vers
 * sa famille.
 *
 * On ne corrige rien depuis ici : chaque fait se corrige là où il a été
 * constaté. Un écran de synthèse qui laisserait modifier finirait par
 * diverger de la source.
 * ---------------------------------------------------------------------
 *
 * LE CLOISONNEMENT N'EST PAS RÉÉCRIT ICI. Toutes les lectures passent par
 * le RLS : un directeur de direction ne voit que sa direction, et au
 * second cycle sa filière ; un enseignant ne voit que ses élèves. Cet
 * écran ne fait aucun filtre de sécurité de son côté — il n'aurait pas à
 * en faire, et en ajouter donnerait l'illusion que c'est là que ça se
 * joue.
 */

type Eleve = {
  id: string
  school_id: string
  first_name: string
  last_name: string
  student_number: string | null
  parent_name: string | null
  parent_phone: string | null
}

type PresenceJour = {
  id: string
  attendance_date: string
  status: string
}

type PresenceLecon = {
  id: string
  lesson_date: string
  status: string
  subjects: { name: string } | null
}

type Retenue = {
  cancelled_at: string | null
  cancellation_reason: string | null
  annulePar: { first_name: string | null; last_name: string | null } | null
  id: string
  detention_date: string
  reason: string
}

type Manquement = {
  cancelled_at: string | null
  cancellation_reason: string | null
  annulePar: { first_name: string | null; last_name: string | null } | null
  id: string
  violation_date: string
  note: string | null
  school_rules: { label: string } | null
}

type MessageParent = {
  cancelled_at: string | null
  cancellation_reason: string | null
  annulePar: { first_name: string | null; last_name: string | null } | null
  id: string
  created_at: string
  event_type: string
  status: string
  message: string
  phone: string
  error_message: string | null
}

const LIBELLE_STATUT: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Excusé",
}

const LIBELLE_EVENEMENT: Record<string, string> = {
  absence: "Absence",
  retard: "Retard",
  retenue: "Retenue",
  violation_reglement: "Règlement",
  report_card: "Bulletin",
  fee_overdue: "Frais",
}

const LIBELLE_ENVOI: Record<string, string> = {
  en_attente: "En attente",
  sent: "Envoyé",
  failed: "Échec",
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

/** Premier et dernier jour du mois, au format ISO comparable en base. */
function bornesDuMois(annee: number, mois: number) {
  const debut = new Date(Date.UTC(annee, mois - 1, 1))
  const fin = new Date(Date.UTC(annee, mois, 0))

  return {
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  }
}

function formatDate(valeur: string) {
  return new Date(`${valeur}T00:00:00`).toLocaleDateString("fr-FR")
}

export default function StudentHistoryPage() {
  const router = useRouter()
  const params = useParams<{ studentId: string }>()
  const studentId = params?.studentId ?? ""

  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois, setMois] = useState(maintenant.getMonth() + 1)

  const [eleve, setEleve] = useState<Eleve | null>(null)
  const [presencesJour, setPresencesJour] = useState<PresenceJour[]>([])
  const [presencesLecon, setPresencesLecon] = useState<PresenceLecon[]>([])
  const [retenues, setRetenues] = useState<Retenue[]>([])
  const [manquements, setManquements] = useState<Manquement[]>([])
  const [messages, setMessages] = useState<MessageParent[]>([])

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  /*
   * Le rôle sert UNIQUEMENT à masquer les boutons d'ouverture et de
   * retrait de l'accès famille. Le partage réel est en base : la policy
   * d'insertion repose sur `private.encadrement_ecrit()`, qui exclut le
   * promoteur — mesuré à « refusé ».
   */
  const [role, setRole] = useState("")

  const charger = useCallback(async () => {
    if (!studentId) {
      return
    }

    setChargement(true)
    setErreur(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: profil } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      setRole(profil?.role ?? "")
    }

    const { debut, fin } = bornesDuMois(annee, mois)

    const [
      eleveResultat,
      jourResultat,
      leconResultat,
      retenuesResultat,
      manquementsResultat,
      messagesResultat,
    ] = await Promise.all([
      supabase
        .from("students")
        .select(
          "id, school_id, first_name, last_name, student_number, parent_name, parent_phone"
        )
        .eq("id", studentId)
        .maybeSingle(),

      supabase
        .from("attendance")
        .select("id, attendance_date, status")
        .eq("student_id", studentId)
        .gte("attendance_date", debut)
        .lte("attendance_date", fin)
        .order("attendance_date", { ascending: false }),

      supabase
        .from("lesson_attendance")
        .select("id, lesson_date, status, subjects ( name )")
        .eq("student_id", studentId)
        .gte("lesson_date", debut)
        .lte("lesson_date", fin)
        .order("lesson_date", { ascending: false }),

      supabase
        .from("detentions")
        .select(
          "id, detention_date, reason, cancelled_at, cancellation_reason, annulePar:cancelled_by ( first_name, last_name )"
        )
        .eq("student_id", studentId)
        .gte("detention_date", debut)
        .lte("detention_date", fin)
        .order("detention_date", { ascending: false }),

      supabase
        .from("rule_violations")
        .select(
          "id, violation_date, note, school_rules ( label ), cancelled_at, cancellation_reason, annulePar:cancelled_by ( first_name, last_name )"
        )
        .eq("student_id", studentId)
        .gte("violation_date", debut)
        .lte("violation_date", fin)
        .order("violation_date", { ascending: false }),

      supabase
        .from("sms_logs")
        .select(
          "id, created_at, event_type, status, message, phone, error_message, cancelled_at, cancellation_reason, annulePar:cancelled_by ( first_name, last_name )"
        )
        .eq("student_id", studentId)
        .gte("created_at", `${debut}T00:00:00`)
        .lte("created_at", `${fin}T23:59:59`)
        .order("created_at", { ascending: false }),
    ])

    if (eleveResultat.error || !eleveResultat.data) {
      console.error("Erreur élève :", eleveResultat.error)

      setErreur(
        "Cet élève est introuvable, ou vous n'avez pas accès à son dossier."
      )
      setChargement(false)
      return
    }

    setEleve(eleveResultat.data as Eleve)
    setPresencesJour((jourResultat.data as PresenceJour[]) ?? [])
    setPresencesLecon(
      (leconResultat.data as unknown as PresenceLecon[]) ?? []
    )
    setRetenues((retenuesResultat.data as unknown as Retenue[]) ?? [])
    setManquements(
      (manquementsResultat.data as unknown as Manquement[]) ?? []
    )
    setMessages((messagesResultat.data as unknown as MessageParent[]) ?? [])

    setChargement(false)
  }, [studentId, annee, mois])

  useEffect(() => {
    /*
     * Le chargement passe par une fonction interne : appeler `charger`
     * directement dans le corps de l'effet y déclencherait une mise à
     * jour d'état synchrone, et enchaînerait les rendus.
     */
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  /*
   * Les compteurs additionnent les DEUX modèles de présence. Un élève de
   * second cycle peut avoir des relevés à la journée d'une année
   * antérieure, et un élève de premier cycle n'en a que par jour : compter
   * les deux évite un total faux selon le cycle.
   */
  const compteurs = useMemo(() => {
    const tous = [
      ...presencesJour.map((p) => p.status),
      ...presencesLecon.map((p) => p.status),
    ]

    return {
      absences: tous.filter((s) => s === "absent").length,
      retards: tous.filter((s) => s === "late").length,
      excuses: tous.filter((s) => s === "excused").length,
    }
  }, [presencesJour, presencesLecon])

  const libelleMois = `${MOIS[mois - 1]} ${annee}`

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">
              {eleve
                ? `${eleve.last_name} ${eleve.first_name}`
                : "Historique de l'élève"}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Historique en lecture seule — {libelleMois}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/*
              Le rapport reprend le mois choisi ici : on passe d'un survol
              a un document, sans avoir a re-selectionner la periode.
            */}
            <button
              onClick={() =>
                router.push(
                  `/students/${studentId}/rapport?annee=${annee}&mois=${mois}`
                )
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Rapport mensuel
            </button>

            <button
              onClick={() => router.push("/students")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              ← Élèves
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={mois}
            onChange={(event) => setMois(Number(event.target.value))}
            aria-label="Mois"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {MOIS.map((nom, index) => (
              <option key={nom} value={index + 1}>
                {nom}
              </option>
            ))}
          </select>

          <select
            value={annee}
            onChange={(event) => setAnnee(Number(event.target.value))}
            aria-label="Année"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {[annee - 1, annee, annee + 1].map((valeur) => (
              <option key={valeur} value={valeur}>
                {valeur}
              </option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erreur}
          </div>
        )}

        {chargement ? (
          <p className="text-muted-foreground">Chargement de l&apos;historique...</p>
        ) : !eleve ? null : (
          <>
            <div className="rounded-xl border bg-background p-6">
              <p className="text-sm text-muted-foreground">
                {eleve.student_number
                  ? `Matricule ${eleve.student_number} — `
                  : ""}
                Parent : {eleve.parent_name || "non renseigné"}
                {eleve.parent_phone
                  ? ` (${eleve.parent_phone})`
                  : " — aucun numéro WhatsApp"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Absences", compteurs.absences],
                ["Retards", compteurs.retards],
                ["Absences excusées", compteurs.excuses],
              ].map(([libelle, valeur]) => (
                <div
                  key={libelle}
                  className="rounded-xl border bg-background p-6"
                >
                  <p className="text-sm text-muted-foreground">{libelle}</p>

                  <p className="mt-1 font-heading text-3xl font-bold tabular-nums">
                    {valeur}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="font-semibold">Présences relevées</h2>

              {presencesJour.length === 0 && presencesLecon.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun relevé ce mois-ci.
                </p>
              ) : (
                <div className="mt-4 space-y-2 text-sm">
                  {presencesLecon.map((presence) => (
                    <div
                      key={presence.id}
                      className="flex flex-wrap gap-3 border-b pb-2 last:border-0"
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {formatDate(presence.lesson_date)}
                      </span>

                      <span className="flex-1">
                        Leçon de{" "}
                        {presence.subjects?.name ?? "matière inconnue"}
                      </span>

                      <span className="font-medium">
                        {LIBELLE_STATUT[presence.status] ?? presence.status}
                      </span>
                    </div>
                  ))}

                  {presencesJour.map((presence) => (
                    <div
                      key={presence.id}
                      className="flex flex-wrap gap-3 border-b pb-2 last:border-0"
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {formatDate(presence.attendance_date)}
                      </span>

                      <span className="flex-1">Journée</span>

                      <span className="font-medium">
                        {LIBELLE_STATUT[presence.status] ?? presence.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="font-semibold">
                Retenues ({retenues.length})
              </h2>

              {retenues.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucune retenue ce mois-ci.
                </p>
              ) : (
                <div className="mt-4 space-y-2 text-sm">
                  {retenues.map((retenue) => (
                    <div
                      key={retenue.id}
                      className={`flex flex-wrap gap-3 border-b pb-2 last:border-0 ${
                        estAnnulee(retenue) ? CLASSE_ANNULEE : ""
                      }`}
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {formatDate(retenue.detention_date)}
                      </span>

                      <span className="flex-1">{retenue.reason}</span>
                      {/*
                        La ligne annulee reste, barree et grisee, avec qui
                        l'a annulee et pourquoi. Une case vide poserait la
                        meme question a chaque lecture.
                      */}
                      <MentionAnnulation
                        ligne={{
                          cancelled_at: retenue.cancelled_at,
                          cancellation_reason: retenue.cancellation_reason,
                          cancelled_by_name: retenue.annulePar
                            ? `${retenue.annulePar.last_name ?? ""} ${retenue.annulePar.first_name ?? ""}`.trim()
                            : null,
                        }}
                      />

                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="font-semibold">
                Règles enfreintes ({manquements.length})
              </h2>

              {manquements.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun manquement ce mois-ci.
                </p>
              ) : (
                <div className="mt-4 space-y-2 text-sm">
                  {manquements.map((manquement) => (
                    <div
                      key={manquement.id}
                      className={`flex flex-wrap gap-3 border-b pb-2 last:border-0 ${
                        estAnnulee(manquement) ? CLASSE_ANNULEE : ""
                      }`}
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {formatDate(manquement.violation_date)}
                      </span>

                      <span className="flex-1">
                        {manquement.school_rules?.label ?? "règle retirée"}
                        {manquement.note ? ` — ${manquement.note}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-background p-6">
              <h2 className="font-semibold">
                Messages au parent ({messages.length})
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Un message « en attente » a bien été enregistré, mais aucun
                fournisseur ne l&apos;a encore transmis. Il reste à
                communiquer à la famille par un autre moyen.
              </p>

              {messages.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Aucun message ce mois-ci.
                </p>
              ) : (
                <div className="mt-4 space-y-3 text-sm">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`border-b pb-3 last:border-0 ${
                        estAnnulee(message) ? CLASSE_ANNULEE : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">
                          {new Date(message.created_at).toLocaleDateString(
                            "fr-FR"
                          )}
                        </span>

                        <span className="font-medium">
                          {LIBELLE_EVENEMENT[message.event_type] ??
                            message.event_type}
                        </span>

                        <span className="rounded-full border px-3 py-0.5 text-xs">
                          {LIBELLE_ENVOI[message.status] ?? message.status}
                        </span>

                        <span className="text-xs text-muted-foreground">
                          {message.phone}
                        </span>
                      </div>

                      <p className="mt-1 text-muted-foreground">
                        {message.message}
                      </p>

                      {message.error_message && (
                        <p className="mt-1 text-xs text-destructive">
                          {message.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/*
              L'accès de la famille vit sur la fiche de l'élève, et non
              dans un écran séparé : c'est ici qu'on est quand un parent
              se présente au secrétariat.
            */}
            {eleve && (
              <CodeAccesParent
                studentId={eleve.id}
                schoolId={eleve.school_id}
                nomEleve={`${eleve.last_name} ${eleve.first_name}`}
                peutEcrire={
                  role === "directeur_general" || role === "directeur_direction"
                }
              />
            )}
          </>
        )}
      </section>
    </main>
  )
}
