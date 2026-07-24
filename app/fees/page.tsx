"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type Student = {
  id: string
  first_name: string
  last_name: string
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

export default function FeesPage() {
  const router = useRouter()

  const [schoolId, setSchoolId] = useState("")

  const [loading, setLoading] = useState(true)
  const [loadingFees, setLoadingFees] = useState(false)
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [feesError, setFeesError] = useState<string | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState("")

  const [assessments, setAssessments] = useState<FeeAssessment[]>([])
  const [payments, setPayments] = useState<FeePayment[]>([])

  const [assessmentStudentId, setAssessmentStudentId] = useState("")
  const [assessmentAmount, setAssessmentAmount] = useState("")

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
    if (selectedYearId) {
      loadFeesForYear(selectedYearId)
    }
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

    const [studentsResult, yearsResult] = await Promise.all([
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
    ])

    if (studentsResult.error) {
      console.error("Erreur élèves :", studentsResult.error)
      loadErrors.push("les élèves")
    } else {
      setStudents((studentsResult.data as Student[]) ?? [])
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
      .select("id, fee_assessment_id, amount_paid, payment_date, payment_method")
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

  function getTotalPaid(assessmentId: string) {
    return payments
      .filter((payment) => payment.fee_assessment_id === assessmentId)
      .reduce((total, payment) => total + Number(payment.amount_paid), 0)
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

  const totalDue = assessments.reduce(
    (total, assessment) => total + Number(assessment.amount_due),
    0
  )

  const totalPaid = payments.reduce(
    (total, payment) => total + Number(payment.amount_paid),
    0
  )

  const totalRemaining = totalDue - totalPaid

  function getMethodLabel(method: string | null) {
    return (
      paymentMethods.find((item) => item.value === method)?.label ??
      "Non précisé"
    )
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
            <h1 className="text-xl font-bold">EduMali</h1>
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

        <div className="rounded-xl border bg-background p-6">
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
              className="w-full max-w-sm rounded-md border bg-background px-3 py-3"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedYearId && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-6">
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.58 0.15 45 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-sm"
                    style={{ background: "oklch(0.58 0.15 45)" }}
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
                  style={{ background: "oklch(0.56 0.13 150 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ background: "oklch(0.56 0.13 150)" }}
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
                  style={{ background: "oklch(0.78 0.14 85 / 0.18)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[3px]"
                    style={{ background: "oklch(0.6 0.14 85)" }}
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
                          setAssessmentStudentId(event.target.value)
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
                        value={paymentAmount}
                        onChange={(event) =>
                          setPaymentAmount(event.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        required
                      />
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
                  ) : (
                    <div className="mt-6 overflow-x-auto">
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
                          {assessments.map((assessment) => {
                            const paid = getTotalPaid(assessment.id)
                            const balance = Number(assessment.amount_due) - paid

                            const statusLabel =
                              balance <= 0
                                ? "Soldé"
                                : paid > 0
                                  ? "Partiel"
                                  : "Impayé"

                            const statusColor =
                              balance <= 0
                                ? "oklch(0.56 0.13 150)"
                                : paid > 0
                                  ? "oklch(0.6 0.14 85)"
                                  : "oklch(0.577 0.245 27.325)"

                            return (
                              <tr
                                key={assessment.id}
                                className="border-b last:border-0"
                              >
                                <td className="px-4 py-4 font-medium">
                                  {assessment.students?.last_name ?? "—"}{" "}
                                  {assessment.students?.first_name ?? ""}
                                </td>

                                <td className="px-4 py-4">
                                  {formatAmount(Number(assessment.amount_due))}
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
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b">
                          <tr>
                            <th className="px-4 py-3">Élève</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Montant</th>
                            <th className="px-4 py-3">Méthode</th>
                          </tr>
                        </thead>

                        <tbody>
                          {payments.map((payment) => {
                            const assessment = assessments.find(
                              (item) => item.id === payment.fee_assessment_id
                            )

                            return (
                              <tr
                                key={payment.id}
                                className="border-b last:border-0"
                              >
                                <td className="px-4 py-4 font-medium">
                                  {assessment?.students?.last_name ?? "—"}{" "}
                                  {assessment?.students?.first_name ?? ""}
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
