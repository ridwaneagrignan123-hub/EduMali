"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"
import {
  AttestationDocument,
  AttestationImprimable,
  EnTeteEcole,
} from "@/components/attestation-document"
import { TITRES } from "@/src/lib/attestations"

/*
 * Attestations et certificats.
 *
 * =====================================================================
 * QUI ENTRE, QUI SIGNE
 * =====================================================================
 *
 * La page s'ouvre à tout l'encadrement — le registre des documents émis
 * au nom de l'établissement est exactement ce qu'un promoteur doit
 * pouvoir consulter. Mais le formulaire d'émission n'apparaît que pour
 * le DIRECTEUR GÉNÉRAL.
 *
 * Ce masquage ne protège rien par lui-même : la policy d'insertion en
 * base repose sur `private.dg_ecrit()`, mesurée à 0 ligne pour le
 * promoteur. L'écran ne fait qu'éviter de proposer un bouton qui
 * échouerait — un menu se contourne en tapant l'adresse, une policy non.
 *
 * =====================================================================
 * LE FORMULAIRE MONTRE CE QUI SERA GRAVÉ
 * =====================================================================
 *
 * Avant d'émettre, l'écran affiche la phrase exacte que portera le
 * papier. C'est délibéré : une attestation ne se corrige pas après coup
 * — le déclencheur en base refuse toute modification — et la seule
 * réparation possible est d'annuler puis de rééditer, ce qui consomme un
 * numéro et laisse une trace. Mieux vaut relire avant de signer.
 */

const ROLES_PAGE = ["promoteur", "directeur_general", "directeur_direction"]

type Eleve = {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  matricule: string | null
  classe: string | null
  annee: string | null
}

type Enseignant = {
  id: string
  first_name: string
  last_name: string
  specialty: string | null
  hire_date: string | null
}

type Ligne = AttestationImprimable & {
  id: string
  student_id: string | null
  teacher_id: string | null
}

const GENRES: { kind: string; libelle: string; sujet: "eleve" | "enseignant" }[] = [
  { kind: "attestation_scolarite", libelle: "Attestation de scolarité", sujet: "eleve" },
  { kind: "certificat_scolarite", libelle: "Certificat de scolarité (fin)", sujet: "eleve" },
  { kind: "attestation_travail", libelle: "Attestation de travail", sujet: "enseignant" },
  { kind: "certificat_travail", libelle: "Certificat de travail (fin)", sujet: "enseignant" },
]

export default function AttestationsPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_PAGE)

  const [ecole, setEcole] = useState<(EnTeteEcole & { name: string }) | null>(null)
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [enseignants, setEnseignants] = useState<Enseignant[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)

  const [kind, setKind] = useState(GENRES[0].kind)
  const [sujetId, setSujetId] = useState("")
  const [purpose, setPurpose] = useState("")
  const [fin, setFin] = useState("")
  const [lieuNaissance, setLieuNaissance] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /** Le document affiché et imprimable. Rien n'est imprimé sans sélection. */
  const [apercu, setApercu] = useState<Ligne | null>(null)

  const estDG = gate.statut === "autorise" && gate.role === "directeur_general"
  const genre = GENRES.find((g) => g.kind === kind) ?? GENRES[0]

  const charger = useCallback(async () => {
    if (gate.statut !== "autorise") return

    const schoolId = gate.schoolId

    const [ecoleRes, anneeRes, elevesRes, enseignantsRes, attestationsRes] =
      await Promise.all([
        supabase
          .from("schools")
          .select("name, address, phone, logo_url")
          .eq("id", schoolId)
          .maybeSingle(),
        supabase
          .from("academic_years")
          .select("id, name")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("students")
          .select("id, first_name, last_name, date_of_birth, matricule")
          .eq("school_id", schoolId)
          .order("last_name"),
        supabase
          .from("teachers")
          .select("id, first_name, last_name, specialty, hire_date")
          .eq("school_id", schoolId)
          .order("last_name"),
        supabase
          .from("attestations")
          .select("*")
          .eq("school_id", schoolId)
          .order("issued_at", { ascending: false })
          .limit(300),
      ])

    setEcole(ecoleRes.data ? { ...ecoleRes.data, name: ecoleRes.data.name ?? "" } : null)

    /*
     * La classe de l'élève est lue pour l'ANNÉE ACTIVE seulement. Une
     * attestation qui reprendrait une inscription de l'an dernier
     * certifierait une scolarité révolue en la présentant au présent.
     */
    const annee = anneeRes.data

    let parEleve = new Map<string, string>()

    if (annee) {
      const { data: inscriptions } = await supabase
        .from("student_class_enrollments")
        .select("student_id, classes(name)")
        .eq("school_id", schoolId)
        .eq("academic_year_id", annee.id)

      parEleve = new Map(
        (inscriptions ?? []).map((i) => [
          i.student_id as string,
          (i.classes as unknown as { name: string } | null)?.name ?? "",
        ])
      )
    }

    setEleves(
      (elevesRes.data ?? []).map((e) => ({
        ...e,
        classe: parEleve.get(e.id) ?? null,
        annee: annee?.name ?? null,
      }))
    )

    setEnseignants(enseignantsRes.data ?? [])
    setLignes((attestationsRes.data ?? []) as Ligne[])
    setChargement(false)
  }, [gate])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  /* Ce que portera le papier, calculé avant l'émission. */
  const photographie = useMemo(() => {
    if (!sujetId || !ecole) return null

    if (genre.sujet === "eleve") {
      const e = eleves.find((x) => x.id === sujetId)
      if (!e) return null

      return {
        subject_full_name: `${e.last_name} ${e.first_name}`.trim(),
        subject_birth_date: e.date_of_birth,
        subject_matricule: e.matricule,
        class_label: e.classe,
        academic_year_label: e.annee,
        role_label: null as string | null,
        start_date: null as string | null,
      }
    }

    const t = enseignants.find((x) => x.id === sujetId)
    if (!t) return null

    return {
      subject_full_name: `${t.last_name} ${t.first_name}`.trim(),
      subject_birth_date: null as string | null,
      subject_matricule: null as string | null,
      class_label: null as string | null,
      academic_year_label: null as string | null,
      role_label: t.specialty,
      start_date: t.hire_date,
    }
  }, [sujetId, genre.sujet, eleves, enseignants, ecole])

  async function emettre(event: React.FormEvent) {
    event.preventDefault()
    setErreur(null)

    if (!photographie || gate.statut !== "autorise" || !ecole) return

    if (kind.startsWith("certificat") && !fin) {
      setErreur("Un certificat clôt quelque chose : indiquez la date de fin.")
      return
    }

    setEnvoi(true)

    const { data, error } = await supabase
      .from("attestations")
      .insert({
        school_id: gate.schoolId,
        kind,
        subject_type: genre.sujet,
        student_id: genre.sujet === "eleve" ? sujetId : null,
        teacher_id: genre.sujet === "enseignant" ? sujetId : null,
        school_name: ecole.name,
        subject_birth_place: lieuNaissance.trim() || null,
        end_date: kind.startsWith("certificat") ? fin : null,
        purpose: purpose.trim() || null,
        /*
         * `number`, `reference`, `issued_at`, `issued_by` et
         * `signatory_name` sont posés par le déclencheur en base. Ce
         * qu'on envoie ici serait écrasé — mesuré : une tentative
         * d'usurpation du signataire est ignorée. On envoie donc un
         * marqueur, pas une valeur crédible.
         */
        number: 0,
        reference: "",
        signatory_name: "—",
        ...photographie,
      })
      .select("*")
      .single()

    setEnvoi(false)

    if (error) {
      console.error("Émission d'une attestation :", error)
      setErreur(
        error.message.includes("row-level security")
          ? "Seul le directeur général émet une attestation."
          : "L'attestation n'a pas pu être émise."
      )
      return
    }

    setSujetId("")
    setPurpose("")
    setFin("")
    setLieuNaissance("")
    setApercu(data as Ligne)
    await charger()
  }

  async function annuler(ligne: Ligne) {
    const motif = prompt(
      `Annuler l'attestation ${ligne.reference} ?\n\nLe motif est obligatoire et restera inscrit au registre. Une annulation ne se lève pas.`
    )

    if (motif === null) return

    if (motif.trim().length < 3) {
      setErreur("Le motif d'annulation doit être renseigné.")
      return
    }

    const { error } = await supabase
      .from("attestations")
      .update({
        /*
         * `cancelled_by` n'est PAS envoyé, et c'est volontaire : le
         * déclencheur le pose depuis `auth.uid()`. L'envoyer donnerait
         * l'illusion que le client choisit l'auteur d'une annulation.
         *
         * L'heure envoyée ici sert seulement à déclencher le passage à
         * l'état annulé ; la base la remplace par la sienne.
         */
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motif.trim(),
      })
      .eq("id", ligne.id)

    if (error) {
      console.error("Annulation d'une attestation :", error)
      setErreur("L'attestation n'a pas pu être annulée.")
      return
    }

    setApercu(null)
    await charger()
  }

  if (gate.statut === "chargement") return <ChargementPage />
  if (gate.statut === "refuse") return <AccesRefuse role={gate.role} />

  return (
    <main className="attestations-main min-h-screen bg-muted/30">
      <style>{`
        @media print {
          /* Seul le document part à l'imprimante. */
          .print-hidden { display: none !important; }

          .attestations-main { background: white !important; min-height: 0 !important; }
          .attestation-feuille { padding: 0 !important; max-width: none !important; }

          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <div className="print-hidden border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 p-6">
          <div>
            <h1 className="font-heading text-2xl font-bold">
              Attestations et certificats
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Chaque document reçoit un numéro et fige ce qu&apos;il certifie.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="ms-auto rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour
          </button>
        </div>
      </div>

      <div className="print-hidden mx-auto max-w-5xl space-y-8 p-6">
        {erreur && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erreur}
          </p>
        )}

        {/* ------------------------------------------------- émission */}
        {estDG ? (
          <form
            onSubmit={emettre}
            className="space-y-4 rounded-xl border bg-background p-6"
          >
            <h2 className="text-xl font-semibold">Émettre</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Document</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value)
                    setSujetId("")
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  {GENRES.map((g) => (
                    <option key={g.kind} value={g.kind}>
                      {g.libelle}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  {genre.sujet === "eleve" ? "Élève" : "Enseignant"}
                </span>
                <select
                  value={sujetId}
                  onChange={(e) => setSujetId(e.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">— choisir —</option>

                  {genre.sujet === "eleve"
                    ? eleves.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.last_name} {e.first_name}
                          {e.classe ? ` — ${e.classe}` : ""}
                        </option>
                      ))
                    : enseignants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.last_name} {t.first_name}
                        </option>
                      ))}
                </select>
              </label>

              {genre.sujet === "eleve" && (
                <label className="text-sm">
                  <span className="mb-1 block font-medium">
                    Lieu de naissance{" "}
                    <span className="font-normal text-muted-foreground">
                      (facultatif)
                    </span>
                  </span>
                  <input
                    value={lieuNaissance}
                    onChange={(e) => setLieuNaissance(e.target.value)}
                    placeholder="Bamako"
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>
              )}

              {kind.startsWith("certificat") && (
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Date de fin</span>
                  <input
                    type="date"
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>
              )}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Destination{" "}
                <span className="font-normal text-muted-foreground">
                  — par défaut « pour servir et valoir ce que de droit »
                </span>
              </span>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="en vue d'une demande de bourse"
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>

            {/*
              L'aperçu de ce qui sera GRAVÉ. Une attestation ne se corrige
              pas : la seule réparation est d'annuler et de rééditer, ce
              qui consomme un numéro et laisse une trace au registre.
            */}
            {photographie && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Ce qui sera gravé sur le papier</p>

                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>Nom : {photographie.subject_full_name}</li>
                  {photographie.class_label && (
                    <li>
                      Classe : {photographie.class_label}
                      {photographie.academic_year_label
                        ? ` — ${photographie.academic_year_label}`
                        : ""}
                    </li>
                  )}
                  {genre.sujet === "eleve" && !photographie.class_label && (
                    <li className="text-destructive">
                      Cet élève n&apos;est inscrit dans aucune classe pour
                      l&apos;année active : l&apos;attestation ne pourra pas
                      nommer sa classe.
                    </li>
                  )}
                  {photographie.role_label && (
                    <li>Fonction : {photographie.role_label}</li>
                  )}
                  {photographie.start_date && (
                    <li>Depuis le : {photographie.start_date}</li>
                  )}
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={envoi || !photographie}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-50"
            >
              {envoi ? "Émission…" : "Émettre et imprimer"}
            </button>
          </form>
        ) : (
          <p className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
            Vous consultez le registre. L&apos;émission d&apos;une attestation
            est un acte de direction : elle revient au directeur général, qui
            signe au nom de l&apos;établissement.
          </p>
        )}

        {/* ------------------------------------------------- registre */}
        <div>
          <h2 className="text-xl font-semibold">
            Registre{" "}
            <span className="text-muted-foreground">({lignes.length})</span>
          </h2>

          {chargement ? (
            <p className="mt-3 text-sm text-muted-foreground">Chargement…</p>
          ) : lignes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune attestation émise à ce jour.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {lignes.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="min-w-[240px] flex-1">
                    <p className="text-xs text-muted-foreground">
                      {l.reference} ·{" "}
                      {new Date(l.issued_at).toLocaleDateString("fr-FR")} ·{" "}
                      {TITRES[l.kind] ?? l.kind}
                    </p>

                    <p className="font-medium">
                      {l.subject_full_name}
                      {l.cancelled_at && (
                        <span className="ms-2 rounded bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                          ANNULÉE
                        </span>
                      )}
                    </p>

                    {l.cancelled_at && l.cancellation_reason && (
                      <p className="text-sm text-muted-foreground">
                        {l.cancellation_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setApercu(l)}
                      className="rounded border px-3 py-1.5 hover:bg-muted"
                    >
                      Afficher
                    </button>

                    {estDG && !l.cancelled_at && (
                      <button
                        type="button"
                        onClick={() => annuler(l)}
                        className="rounded border px-3 py-1.5 text-destructive hover:bg-muted"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- document */}
      {apercu && (
        <>
          <div className="print-hidden mx-auto flex max-w-5xl justify-end gap-2 px-6">
            <button
              onClick={() => setApercu(null)}
              className="rounded-md border bg-background px-4 py-2 text-sm hover:bg-muted"
            >
              Fermer
            </button>

            <button
              onClick={() => window.print()}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              Imprimer
            </button>
          </div>

          <div className="mx-auto max-w-5xl p-6">
            <AttestationDocument attestation={apercu} enTete={ecole} />
          </div>
        </>
      )}
    </main>
  )
}
