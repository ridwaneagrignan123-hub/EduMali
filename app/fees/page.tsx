"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { matchesSearch } from "@/src/lib/search"
import { AccesRefuse, ChargementPage, useRoleGate } from "@/components/role-gate"
import { can } from "@/src/lib/roles"

type Student = {
  id: string
  first_name: string
  last_name: string
}

type Enrollment = {
  student_id: string
  academic_year_id: string
  classes: {
    id: string
    name: string
  } | null
}

type FeeClassDefault = {
  class_id: string
  academic_year_id: string
  default_amount: number
}

type AcademicYear = {
  id: string
  name: string
  is_active: boolean
}

type FeeAssessment = {
  id: string
  student_id: string
  amount_due: number
  students: {
    first_name: string
    last_name: string
  } | null
}

type FeePayment = {
  id: string
  fee_assessment_id: string
  amount_paid: number
  payment_date: string
  payment_method: string | null
  receipt_number: number
  cancelled_at: string | null
  cancellation_reason: string | null
}

const paymentMethods: { value: string; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "cheque", label: "Chèque" },
]

function formatAmount(value: number) {
  return `${value.toLocaleString("fr-FR")} FCFA`
}

// Libellé du groupe pour les élèves sans inscription en classe sur l'année sélectionnée.
const UNASSIGNED_CLASS_LABEL = "Sans classe"

/* Le directeur général en est exclu : voir supabase/rls-roles.sql. */
const ROLES_AUTORISES = ["promoteur", "comptable"]

export default function FeesPage() {
  const router = useRouter()
  const gate = useRoleGate(ROLES_AUTORISES, { comptabilite: true })

  /* Le promoteur lit les finances, il ne les saisit pas. */
  const peutSaisir =
    gate.statut === "autorise" && can(gate.role, "finances.saisir")

  const [schoolId, setSchoolId] = useState("")

  const [loading, setLoading] = useState(true)
  const [loadingFees, setLoadingFees] = useState(false)
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [feesError, setFeesError] = useState<string | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState("")

  const [searchTerm, setSearchTerm] = useState("")

  const [assessments, setAssessments] = useState<FeeAssessment[]>([])
  const [payments, setPayments] = useState<FeePayment[]>([])

  const [feeDefaults, setFeeDefaults] = useState<FeeClassDefault[]>([])

  const [assessmentStudentId, setAssessmentStudentId] = useState("")
  const [assessmentAmount, setAssessmentAmount] = useState("")

  // Explique d'où vient le montant pré-rempli, pour éviter toute surprise.
  const [assessmentAmountHint, setAssessmentAmountHint] = useState<
    string | null
  >(null)

  const [paymentAssessmentId, setPaymentAssessmentId] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [paymentMethod, setPaymentMethod] = useState("cash")

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    /*
     * Le tout passe par une fonction interne : mettre l'état à jour
     * directement dans le corps de l'effet enchaîne les rendus.
     */
    async function appliquer() {
      /*
       * Le montant pré-rempli dépend de l'année : on repart d'un
       * formulaire vierge plutôt que de laisser un montant qui ne
       * correspond plus. La remise à zéro passe AVANT le chargement,
       * pour qu'aucun rendu n'affiche l'ancien montant sur la nouvelle
       * année.
       */
      setAssessmentStudentId("")
      setAssessmentAmount("")
      setAssessmentAmountHint(null)

      if (selectedYearId) {
        await loadFeesForYear(selectedYearId)
      }
    }

    appliquer()
  }, [selectedYearId])

  async function loadInitialData() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoadError(
        "Impossible de charger votre profil. Réessayez ou reconnectez-vous."
      )
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const loadErrors: string[] = []

    const [
      studentsResult,
      yearsResult,
      enrollmentsResult,
      feeDefaultsResult,
    ] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", profile.school_id)
        .order("last_name"),

      supabase
        .from("academic_years")
        .select("id, name, is_active")
        .eq("school_id", profile.school_id)
        .order("start_date", { ascending: false }),

      // Sert au regroupement par classe et au pré-remplissage du montant dû.
      supabase
        .from("student_class_enrollments")
        .select(`
          student_id,
          academic_year_id,
          classes ( id, name )
        `)
        .eq("school_id", profile.school_id),

      supabase
        .from("fee_class_defaults")
        .select("class_id, academic_year_id, default_amount")
        .eq("school_id", profile.school_id),
    ])

    if (studentsResult.error) {
      console.error("Erreur élèves :", studentsResult.error)
      loadErrors.push("les élèves")
    } else {
      setStudents((studentsResult.data as Student[]) ?? [])
    }

    if (enrollmentsResult.error) {
      console.error("Erreur inscriptions :", enrollmentsResult.error)
      loadErrors.push("les classes des élèves")
    } else {
      setEnrollments(
        (enrollmentsResult.data as unknown as Enrollment[]) ?? []
      )
    }

    if (feeDefaultsResult.error) {
      console.error("Erreur montants par défaut :", feeDefaultsResult.error)
      loadErrors.push("les montants par défaut")
    } else {
      setFeeDefaults((feeDefaultsResult.data as FeeClassDefault[]) ?? [])
    }

    if (yearsResult.error) {
      console.error("Erreur années scolaires :", yearsResult.error)
      loadErrors.push("les années scolaires")
    } else {
      const loadedYears = (yearsResult.data as AcademicYear[]) ?? []
      setAcademicYears(loadedYears)

      const activeYear = loadedYears.find((year) => year.is_active)
      setSelectedYearId(activeYear?.id ?? loadedYears[0]?.id ?? "")
    }

    if (loadErrors.length > 0) {
      setLoadError(
        `Impossible de charger ${loadErrors.join(", ")}. Réessayez.`
      )
    }

    setLoading(false)
  }

  async function loadFeesForYear(yearId: string) {
    setLoadingFees(true)
    setFeesError(null)

    const { data: assessmentsData, error: assessmentsError } = await supabase
      .from("fee_assessments")
      .select(`
        id,
        student_id,
        amount_due,
        students ( first_name, last_name )
      `)
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)

    if (assessmentsError) {
      console.error("Erreur frais dus :", assessmentsError)
      setFeesError("Impossible de charger les frais dus pour cette année.")
      setAssessments([])
      setPayments([])
      setLoadingFees(false)
      return
    }

    const loadedAssessments = (assessmentsData as unknown as FeeAssessment[]) ?? []
    setAssessments(loadedAssessments)

    const assessmentIds = loadedAssessments.map((assessment) => assessment.id)

    if (assessmentIds.length === 0) {
      setPayments([])
      setLoadingFees(false)
      return
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from("fee_payments")
      .select(
        "id, fee_assessment_id, amount_paid, payment_date, payment_method, receipt_number, cancelled_at, cancellation_reason"
      )
      .eq("school_id", schoolId)
      .in("fee_assessment_id", assessmentIds)
      .order("payment_date", { ascending: false })

    if (paymentsError) {
      console.error("Erreur paiements :", paymentsError)
      setFeesError(
        "Les frais dus ont été chargés, mais les paiements n'ont pas pu être récupérés."
      )
      setPayments([])
    } else {
      setPayments((paymentsData as FeePayment[]) ?? [])
    }

    setLoadingFees(false)
  }

  /*
   * Un paiement annulé n'a jamais été encaissé : l'inclure ici gonflerait
   * le règlement de l'élève et masquerait un impayé.
   */
  function getTotalPaid(assessmentId: string) {
    return payments
      .filter(
        (payment) =>
          payment.fee_assessment_id === assessmentId && !payment.cancelled_at
      )
      .reduce((total, payment) => total + Number(payment.amount_paid), 0)
  }

  /*
   * Le reste à payer d'un frais — dû moins versé non annulé.
   *
   * L'écran s'en sert pour prévenir AVANT l'aller-retour ; la base garde
   * le dernier mot. Le déclencheur fee_payments_plafond refuse de toute
   * façon un versement qui dépasserait, y compris envoyé depuis la
   * console du navigateur avec la clé anon.
   */
  function getResteAPayer(assessmentId: string) {
    const frais = assessments.find((item) => item.id === assessmentId)

    if (!frais) {
      return 0
    }

    return Number(frais.amount_due) - getTotalPaid(assessmentId)
  }

  /*
   * Annulation d'un encaissement. Le motif est obligatoire, et la base le
   * vérifie aussi : la contrainte exige trois caractères au moins, sinon
   * un espace suffirait à contourner l'obligation.
   */
  async function cancelPayment(payment: FeePayment) {
    const motif = window.prompt(
      `Annuler le reçu n° ${payment.receipt_number} de ${formatAmount(
        Number(payment.amount_paid)
      )} ?\n\nLe reçu restera visible dans l'état de caisse avec ce motif.\nMotif de l'annulation :`
    )

    if (motif === null) {
      return
    }

    if (motif.trim().length < 3) {
      setFeesError("Le motif d'annulation doit être renseigné.")
      return
    }

    const { error } = await supabase
      .from("fee_payments")
      .update({
        // cancelled_at et cancelled_by sont imposés par un déclencheur :
        // ce qu'on envoie ici ne fait que déclencher la transition.
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motif.trim(),
      })
      .eq("id", payment.id)

    if (error) {
      console.error("Erreur annulation :", error)
      setFeesError(
        error.message || "L'annulation n'a pas pu être enregistrée."
      )
      return
    }

    setFeesError(null)

    if (selectedYearId) {
      await loadFeesForYear(selectedYearId)
    }
  }

  async function createOrUpdateAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!assessmentStudentId) {
      alert("Veuillez sélectionner un élève.")
      return
    }

    if (!selectedYearId) {
      alert("Veuillez sélectionner une année scolaire.")
      return
    }

    const amountNumber = Number(assessmentAmount)

    if (!assessmentAmount || Number.isNaN(amountNumber) || amountNumber < 0) {
      alert("Le montant dû doit être un nombre positif.")
      return
    }

    setSavingAssessment(true)

    const existing = assessments.find(
      (assessment) => assessment.student_id === assessmentStudentId
    )

    const { error } = existing
      ? await supabase
          .from("fee_assessments")
          .update({ amount_due: amountNumber })
          .eq("id", existing.id)
      : await supabase.from("fee_assessments").insert({
          school_id: schoolId,
          student_id: assessmentStudentId,
          academic_year_id: selectedYearId,
          amount_due: amountNumber,
        })

    if (error) {
      console.error("Erreur lors de l'enregistrement des frais dus :", error)
      alert(error.message)
      setSavingAssessment(false)
      return
    }

    setAssessmentStudentId("")
    setAssessmentAmount("")
    setAssessmentAmountHint(null)

    await loadFeesForYear(selectedYearId)
    setSavingAssessment(false)
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!paymentAssessmentId) {
      alert("Veuillez sélectionner un élève ayant des frais dus définis.")
      return
    }

    const amountNumber = Number(paymentAmount)

    if (!paymentAmount || Number.isNaN(amountNumber) || amountNumber <= 0) {
      alert("Le montant payé doit être supérieur à 0.")
      return
    }

    if (!paymentDate) {
      alert("Veuillez indiquer la date du paiement.")
      return
    }

    /*
     * Même règle qu'en base, dite plus tôt. Le message reprend les
     * mêmes trois chiffres — dû, déjà versé, reste — pour que
     * l'utilisateur voie la même chose des deux côtés.
     */
    const frais = assessments.find((item) => item.id === paymentAssessmentId)
    const dejaVerse = getTotalPaid(paymentAssessmentId)
    const reste = Number(frais?.amount_due ?? 0) - dejaVerse

    if (amountNumber > reste) {
      alert(
        `Ce frais est de ${formatAmount(
          Number(frais?.amount_due ?? 0)
        )}, dont ${formatAmount(
          dejaVerse
        )} déjà versés : il reste ${formatAmount(
          reste
        )} à payer. Vous ne pouvez pas encaisser ${formatAmount(
          amountNumber
        )}.`
      )
      return
    }

    setSavingPayment(true)

    const { error } = await supabase.from("fee_payments").insert({
      school_id: schoolId,
      fee_assessment_id: paymentAssessmentId,
      amount_paid: amountNumber,
      payment_date: paymentDate,
      payment_method: paymentMethod,
    })

    if (error) {
      console.error("Erreur lors de l'enregistrement du paiement :", error)
      alert(error.message)
      setSavingPayment(false)
      return
    }

    setPaymentAssessmentId("")
    setPaymentAmount("")
    setPaymentDate(new Date().toISOString().split("T")[0])
    setPaymentMethod("cash")

    await loadFeesForYear(selectedYearId)
    setSavingPayment(false)
  }

  /*
   * Classe de chaque élève pour l'année scolaire sélectionnée.
   * Un élève change de classe d'une année à l'autre : le regroupement
   * doit donc suivre l'année affichée.
   */
  const classNameByStudentId = useMemo(() => {
    const map = new Map<string, string>()

    enrollments
      .filter(
        (enrollment) => enrollment.academic_year_id === selectedYearId
      )
      .forEach((enrollment) => {
        if (enrollment.classes?.name) {
          map.set(enrollment.student_id, enrollment.classes.name)
        }
      })

    return map
  }, [enrollments, selectedYearId])

  function getStudentClassName(studentId: string) {
    return classNameByStudentId.get(studentId) ?? UNASSIGNED_CLASS_LABEL
  }

  // Identifiant de classe, nécessaire pour retrouver le montant par défaut.
  const classIdByStudentId = useMemo(() => {
    const map = new Map<string, string>()

    enrollments
      .filter(
        (enrollment) => enrollment.academic_year_id === selectedYearId
      )
      .forEach((enrollment) => {
        if (enrollment.classes?.id) {
          map.set(enrollment.student_id, enrollment.classes.id)
        }
      })

    return map
  }, [enrollments, selectedYearId])

  /*
   * Pré-remplissage du montant dû à la sélection d'un élève.
   *
   * Si l'élève a déjà des frais définis pour l'année, on affiche le montant
   * existant : le formulaire fait une mise à jour, il ne faut pas l'écraser
   * par le défaut de la classe. Sinon on propose le défaut de sa classe.
   * Dans les deux cas, la valeur reste librement modifiable.
   */
  function handleAssessmentStudentChange(studentId: string) {
    setAssessmentStudentId(studentId)

    if (!studentId) {
      setAssessmentAmount("")
      setAssessmentAmountHint(null)
      return
    }

    const existing = assessments.find(
      (assessment) => assessment.student_id === studentId
    )

    if (existing) {
      setAssessmentAmount(String(Number(existing.amount_due)))
      setAssessmentAmountHint(
        "Montant déjà défini pour cet élève. L'enregistrement le mettra à jour."
      )
      return
    }

    const classId = classIdByStudentId.get(studentId)

    const classDefault = classId
      ? feeDefaults.find(
          (item) =>
            item.class_id === classId &&
            item.academic_year_id === selectedYearId
        )
      : undefined

    if (classDefault) {
      setAssessmentAmount(String(Number(classDefault.default_amount)))
      setAssessmentAmountHint(
        `Pré-rempli avec le montant par défaut de la classe ${getStudentClassName(
          studentId
        )}. Vous pouvez l'ajuster.`
      )
      return
    }

    setAssessmentAmount("")
    setAssessmentAmountHint(
      classId
        ? "Aucun montant par défaut défini pour cette classe."
        : "Cet élève n'est inscrit dans aucune classe pour cette année."
    )
  }

  /*
   * Frais regroupés par classe, filtrés par la recherche.
   * Le filtrage se fait sur les données déjà chargées.
   */
  const assessmentGroups = useMemo(() => {
    const groups = new Map<string, FeeAssessment[]>()

    assessments
      .filter((assessment) =>
        matchesSearch(
          searchTerm,
          assessment.students?.first_name,
          assessment.students?.last_name
        )
      )
      .forEach((assessment) => {
        const className =
          classNameByStudentId.get(assessment.student_id) ??
          UNASSIGNED_CLASS_LABEL

        const group = groups.get(className)

        if (group) {
          group.push(assessment)
        } else {
          groups.set(className, [assessment])
        }
      })

    return Array.from(groups.entries())
      .map(([className, groupAssessments]) => ({
        className,
        assessments: [...groupAssessments].sort((a, b) =>
          `${a.students?.last_name ?? ""} ${a.students?.first_name ?? ""}`
            .localeCompare(
              `${b.students?.last_name ?? ""} ${b.students?.first_name ?? ""}`,
              "fr"
            )
        ),
      }))
      .sort((a, b) => {
        // « Sans classe » reste toujours en dernier.
        if (a.className === UNASSIGNED_CLASS_LABEL) return 1
        if (b.className === UNASSIGNED_CLASS_LABEL) return -1

        return a.className.localeCompare(b.className, "fr")
      })
  }, [assessments, classNameByStudentId, searchTerm])

  const matchedAssessmentCount = assessmentGroups.reduce(
    (total, group) => total + group.assessments.length,
    0
  )

  const filteredPayments = payments.filter((payment) => {
    const assessment = assessments.find(
      (item) => item.id === payment.fee_assessment_id
    )

    return matchesSearch(
      searchTerm,
      assessment?.students?.first_name,
      assessment?.students?.last_name
    )
  })

  const totalDue = assessments.reduce(
    (total, assessment) => total + Number(assessment.amount_due),
    0
  )

  // Les annulations sortent du total encaissé, ici comme en caisse.
  const totalPaid = payments
    .filter((payment) => !payment.cancelled_at)
    .reduce((total, payment) => total + Number(payment.amount_paid), 0)

  const totalRemaining = totalDue - totalPaid

  function getMethodLabel(method: string | null) {
    return (
      paymentMethods.find((item) => item.value === method)?.label ??
      "Non précisé"
    )
  }

  /*
   * Cette page n'avait aucun contrôle de rôle : un enseignant qui tapait
   * l'adresse voyait la comptabilité de l'établissement. Le RLS le
   * bloque désormais — il ne verrait qu'une page vide — mais autant le
   * lui dire clairement.
   */
  if (gate.statut === "chargement") {
    return <ChargementPage />
  }

  if (gate.statut === "refuse") {
    return <AccesRefuse role={gate.role} />
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Chargement des frais scolaires...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">
              Frais scolaires
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">Frais scolaires</h2>
          <p className="mt-2 text-muted-foreground">
            Suivez les frais dus et les paiements des élèves par année scolaire.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-6 rounded-xl border bg-background p-6 md:grid-cols-2">
          <div>
            <label htmlFor="year" className="mb-2 block font-medium">
              Année scolaire
            </label>

            {academicYears.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune année scolaire n'a encore été créée.{" "}
                <button
                  onClick={() => router.push("/academic")}
                  className="font-medium text-primary underline"
                >
                  Créer une année scolaire
                </button>
              </p>
            ) : (
              <select
                id="year"
                value={selectedYearId}
                onChange={(event) => setSelectedYearId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-3"
              >
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="student-search" className="mb-2 block font-medium">
              Rechercher un élève
            </label>

            <input
              id="student-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nom ou prénom de l'élève"
              className="w-full rounded-md border bg-background px-3 py-3"
            />

            <p className="mt-2 text-sm text-muted-foreground">
              {searchTerm.trim()
                ? `${matchedAssessmentCount} élève(s) trouvé(s)`
                : "Filtre la liste des frais et l'historique des paiements."}
            </p>
          </div>
        </div>

        {selectedYearId && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-6">
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.585 0.16 38 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-sm"
                    style={{ background: "oklch(0.585 0.16 38)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">Total dû</p>

                <p className="mt-1 font-heading text-2xl font-extrabold">
                  {formatAmount(totalDue)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.55 0.13 155 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ background: "oklch(0.55 0.13 155)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">Total payé</p>

                <p className="mt-1 font-heading text-2xl font-extrabold">
                  {formatAmount(totalPaid)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.80 0.14 78 / 0.18)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[3px]"
                    style={{ background: "oklch(0.57 0.14 78)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">Solde restant</p>

                <p className="mt-1 font-heading text-2xl font-extrabold">
                  {formatAmount(totalRemaining)}
                </p>
              </div>
            </div>

            {feesError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {feesError}
              </div>
            )}

            <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
              <div className="space-y-8">
                {/*
                  Le promoteur consulte les finances sans les écrire : il
                  ne change pas les montants en cours d'année. Lui
                  montrer ces deux formulaires reviendrait à lui proposer
                  des boutons que le RLS refuse.
                */}
                {peutSaisir && (
                <>
                <div className="rounded-xl border bg-background p-6">
                  <h3 className="text-xl font-semibold">
                    Définir les frais dus
                  </h3>

                  <form
                    onSubmit={createOrUpdateAssessment}
                    className="mt-6 space-y-4"
                  >
                    <div className="space-y-2">
                      <label htmlFor="assessment-student">Élève *</label>

                      <select
                        id="assessment-student"
                        value={assessmentStudentId}
                        onChange={(event) =>
                          handleAssessmentStudentChange(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      >
                        <option value="">Sélectionner un élève</option>

                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.last_name} {student.first_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="assessment-amount">
                        Montant dû (FCFA) *
                      </label>

                      <input
                        id="assessment-amount"
                        type="number"
                        min="0"
                        step="1"
                        value={assessmentAmount}
                        onChange={(event) =>
                          setAssessmentAmount(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      />

                      {assessmentAmountHint && (
                        <p className="text-xs text-muted-foreground">
                          {assessmentAmountHint}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={savingAssessment}
                      className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
                    >
                      {savingAssessment
                        ? "Enregistrement..."
                        : "Enregistrer le montant dû"}
                    </button>
                  </form>

                  {students.length === 0 && (
                    <p className="mt-4 text-sm text-amber-600">
                      Vous devez d'abord créer un élève.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border bg-background p-6">
                  <h3 className="text-xl font-semibold">
                    Enregistrer un paiement
                  </h3>

                  <form onSubmit={createPayment} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="payment-student">
                        Élève (avec frais dus) *
                      </label>

                      <select
                        id="payment-student"
                        value={paymentAssessmentId}
                        onChange={(event) =>
                          setPaymentAssessmentId(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      >
                        <option value="">Sélectionner un élève</option>

                        {assessments.map((assessment) => (
                          <option key={assessment.id} value={assessment.id}>
                            {assessment.students?.last_name ?? "—"}{" "}
                            {assessment.students?.first_name ?? ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="payment-amount">
                        Montant payé (FCFA) *
                      </label>

                      <input
                        id="payment-amount"
                        type="number"
                        min="1"
                        step="1"
                        /*
                          Le plafond est le reste à payer, pas le montant
                          dû : sur un frais déjà réglé pour moitié, offrir
                          le total inviterait à un trop-perçu que la base
                          refuserait ensuite.
                        */
                        max={
                          paymentAssessmentId
                            ? getResteAPayer(paymentAssessmentId)
                            : undefined
                        }
                        value={paymentAmount}
                        onChange={(event) =>
                          setPaymentAmount(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      />

                      {paymentAssessmentId && (
                        <p className="text-xs text-muted-foreground">
                          Reste à payer :{" "}
                          <strong>
                            {formatAmount(getResteAPayer(paymentAssessmentId))}
                          </strong>{" "}
                          — un versement ne peut pas dépasser ce montant.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="payment-date">Date du paiement *</label>

                      <input
                        id="payment-date"
                        type="date"
                        value={paymentDate}
                        onChange={(event) =>
                          setPaymentDate(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="payment-method">
                        Méthode de paiement
                      </label>

                      <select
                        id="payment-method"
                        value={paymentMethod}
                        onChange={(event) =>
                          setPaymentMethod(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                      >
                        {paymentMethods.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={savingPayment || assessments.length === 0}
                      className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingPayment
                        ? "Enregistrement..."
                        : "Enregistrer le paiement"}
                    </button>
                  </form>

                  {assessments.length === 0 && (
                    <p className="mt-4 text-sm text-amber-600">
                      Définissez d'abord les frais dus d'un élève.
                    </p>
                  )}
                </div>
                </>
                )}

                {!peutSaisir && (
                  <div className="rounded-xl border bg-background p-6">
                    <h3 className="text-xl font-semibold">Consultation</h3>

                    <p className="mt-3 text-sm text-muted-foreground">
                      Votre rôle donne accès aux frais et aux paiements en
                      lecture. Leur saisie revient à la comptabilité.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-8">
                <div className="rounded-xl border bg-background p-6">
                  <h3 className="text-xl font-semibold">Frais par élève</h3>

                  {loadingFees ? (
                    <p className="mt-6 text-muted-foreground">
                      Chargement des frais...
                    </p>
                  ) : assessments.length === 0 ? (
                    <p className="mt-6 text-muted-foreground">
                      Aucun frais défini pour cette année scolaire.
                    </p>
                  ) : assessmentGroups.length === 0 ? (
                    <p className="mt-6 text-muted-foreground">
                      Aucun élève ne correspond à « {searchTerm.trim()} ».
                    </p>
                  ) : (
                    <div className="mt-6 space-y-8">
                      {assessmentGroups.map((group) => {
                        const groupDue = group.assessments.reduce(
                          (total, assessment) =>
                            total + Number(assessment.amount_due),
                          0
                        )

                        const groupPaid = group.assessments.reduce(
                          (total, assessment) =>
                            total + getTotalPaid(assessment.id),
                          0
                        )

                        return (
                          <div key={group.className}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                              <h4 className="font-heading text-lg font-bold">
                                {group.className}

                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                  {group.assessments.length} élève(s)
                                </span>
                              </h4>

                              <p className="text-sm text-muted-foreground">
                                Reste à percevoir :{" "}
                                <span className="font-semibold text-foreground">
                                  {formatAmount(
                                    Math.max(groupDue - groupPaid, 0)
                                  )}
                                </span>
                              </p>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="border-b">
                                  <tr>
                                    <th className="px-4 py-3">Élève</th>
                                    <th className="px-4 py-3">Montant dû</th>
                                    <th className="px-4 py-3">Payé</th>
                                    <th className="px-4 py-3">Solde</th>
                                    <th className="px-4 py-3">Statut</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {group.assessments.map((assessment) => {
                                    const paid = getTotalPaid(assessment.id)

                                    const balance =
                                      Number(assessment.amount_due) - paid

                                    const statusLabel =
                                      balance <= 0
                                        ? "Soldé"
                                        : paid > 0
                                          ? "Partiel"
                                          : "Impayé"

                                    const statusColor =
                                      balance <= 0
                                        ? "oklch(0.55 0.13 155)"
                                        : paid > 0
                                          ? "oklch(0.57 0.14 78)"
                                          : "oklch(0.577 0.245 27.325)"

                                    return (
                                      <tr
                                        key={assessment.id}
                                        className="border-b last:border-0"
                                      >
                                        <td className="px-4 py-4 font-medium">
                                          {assessment.students?.last_name ??
                                            "—"}{" "}
                                          {assessment.students?.first_name ??
                                            ""}
                                        </td>

                                        <td className="px-4 py-4">
                                          {formatAmount(
                                            Number(assessment.amount_due)
                                          )}
                                        </td>

                                        <td className="px-4 py-4">
                                          {formatAmount(paid)}
                                        </td>

                                        <td className="px-4 py-4">
                                          {formatAmount(Math.max(balance, 0))}
                                        </td>

                                        <td className="px-4 py-4">
                                          <span
                                            className="rounded-full border px-3 py-1 text-xs font-semibold"
                                            style={{
                                              color: statusColor,
                                              borderColor: statusColor,
                                            }}
                                          >
                                            {statusLabel}
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-background p-6">
                  <h3 className="text-xl font-semibold">
                    Historique des paiements
                  </h3>

                  {payments.length === 0 ? (
                    <p className="mt-6 text-muted-foreground">
                      Aucun paiement enregistré pour cette année scolaire.
                    </p>
                  ) : filteredPayments.length === 0 ? (
                    <p className="mt-6 text-muted-foreground">
                      Aucun paiement ne correspond à « {searchTerm.trim()} ».
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b">
                          <tr>
                            <th className="px-4 py-3">N° reçu</th>
                            <th className="px-4 py-3">Élève</th>
                            <th className="px-4 py-3">Classe</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Montant</th>
                            <th className="px-4 py-3">Méthode</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>

                        <tbody>
                          {filteredPayments.map((payment) => {
                            const assessment = assessments.find(
                              (item) => item.id === payment.fee_assessment_id
                            )

                            return (
                              <tr
                                key={payment.id}
                                className="border-b last:border-0"
                                style={
                                  payment.cancelled_at
                                    ? { opacity: 0.6 }
                                    : undefined
                                }
                              >
                                <td className="px-4 py-4 tabular-nums">
                                  {payment.receipt_number}
                                </td>

                                <td className="px-4 py-4 font-medium">
                                  <span
                                    style={
                                      payment.cancelled_at
                                        ? { textDecoration: "line-through" }
                                        : undefined
                                    }
                                  >
                                    {assessment?.students?.last_name ?? "—"}{" "}
                                    {assessment?.students?.first_name ?? ""}
                                  </span>

                                  {payment.cancelled_at && (
                                    <span
                                      className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                                      style={{
                                        color: "oklch(0.5 0.19 25)",
                                        background: "oklch(0.55 0.19 25 / 0.13)",
                                      }}
                                      title={payment.cancellation_reason ?? ""}
                                    >
                                      Annulé
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-4 text-muted-foreground">
                                  {assessment
                                    ? getStudentClassName(assessment.student_id)
                                    : "—"}
                                </td>

                                <td className="px-4 py-4">
                                  {new Date(
                                    payment.payment_date
                                  ).toLocaleDateString("fr-FR")}
                                </td>

                                <td className="px-4 py-4">
                                  {formatAmount(Number(payment.amount_paid))}
                                </td>

                                <td className="px-4 py-4">
                                  {getMethodLabel(payment.payment_method)}
                                </td>

                                <td className="px-4 py-4 text-right">
                                  {payment.cancelled_at ? (
                                    <span
                                      className="text-xs text-muted-foreground"
                                      title={payment.cancellation_reason ?? ""}
                                    >
                                      {payment.cancellation_reason}
                                    </span>
                                  ) : (
                                    peutSaisir && (
                                      <button
                                        onClick={() => cancelPayment(payment)}
                                        className="text-xs font-medium text-destructive hover:underline"
                                      >
                                        Annuler
                                      </button>
                                    )
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}