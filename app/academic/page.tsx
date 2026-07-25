"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

type AcademicYear = {
  id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

type AcademicPeriod = {
  id: string
  academic_year_id: string
  name: string
  period_type: string
  start_date: string
  end_date: string
  is_active: boolean
}

export default function AcademicPage() {
  const router = useRouter()

  const [schoolId, setSchoolId] = useState("")
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<AcademicPeriod[]>([])

  const [loading, setLoading] = useState(true)
  const [creatingYear, setCreatingYear] = useState(false)
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [yearName, setYearName] = useState("")
  const [yearStartDate, setYearStartDate] = useState("")
  const [yearEndDate, setYearEndDate] = useState("")

  const [selectedYearId, setSelectedYearId] = useState("")
  const [periodName, setPeriodName] = useState("")
  const [periodType, setPeriodType] = useState("trimester")
  const [periodStartDate, setPeriodStartDate] = useState("")
  const [periodEndDate, setPeriodEndDate] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle()

    if (profileError) {
      console.error("Erreur profil :", profileError)
      setLoading(false)
      return
    }

    if (!profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)

    const [yearsResult, periodsResult] = await Promise.all([
      supabase
        .from("academic_years")
        .select(
          "id, name, start_date, end_date, is_active"
        )
        .eq("school_id", profile.school_id)
        .order("start_date", {
          ascending: false,
        }),

      supabase
        .from("academic_periods")
        .select(
          "id, academic_year_id, name, period_type, start_date, end_date, is_active"
        )
        .eq("school_id", profile.school_id)
        .order("start_date", {
          ascending: true,
        }),
    ])

    const { data: yearsData, error: yearsError } = yearsResult
    const { data: periodsData, error: periodsError } = periodsResult

    const loadErrors: string[] = []

    if (yearsError) {
      console.error(
        "Erreur années scolaires :",
        yearsError
      )
      loadErrors.push("les années scolaires")
    }

    if (periodsError) {
      console.error(
        "Erreur périodes scolaires :",
        periodsError
      )
      loadErrors.push("les périodes scolaires")
    }

    if (loadErrors.length > 0) {
      setLoadError(
        `Impossible de charger ${loadErrors.join(", ")}. Réessayez.`
      )
    }

    const loadedYears = yearsData ?? []

    setYears(loadedYears)
    setPeriods(periodsData ?? [])

    if (
      !selectedYearId &&
      loadedYears.length > 0
    ) {
      const activeYear =
        loadedYears.find(
          (year) => year.is_active
        ) || loadedYears[0]

      setSelectedYearId(activeYear.id)
    }

    setLoading(false)
  }

  async function createYear(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!yearName.trim()) {
      alert("Le nom de l'année scolaire est obligatoire.")
      return
    }

    if (!yearStartDate || !yearEndDate) {
      alert("Veuillez renseigner les deux dates.")
      return
    }

    if (yearEndDate <= yearStartDate) {
      alert(
        "La date de fin doit être après la date de début."
      )
      return
    }

    setCreatingYear(true)

    const { error } = await supabase
      .from("academic_years")
      .insert({
        school_id: schoolId,
        name: yearName.trim(),
        start_date: yearStartDate,
        end_date: yearEndDate,
        is_active: years.length === 0,
      })

    if (error) {
      console.error(
        "Erreur création année scolaire :",
        error
      )

      if (error.code === "23505") {
        alert(
          "Cette année scolaire existe déjà."
        )
      } else {
        alert(error.message)
      }

      setCreatingYear(false)
      return
    }

    setYearName("")
    setYearStartDate("")
    setYearEndDate("")

    await loadData()

    setCreatingYear(false)
  }

  async function activateYear(
    yearId: string
  ) {
    const { error: deactivateError } =
      await supabase
        .from("academic_years")
        .update({
          is_active: false,
        })
        .eq("school_id", schoolId)

    if (deactivateError) {
      alert(deactivateError.message)
      return
    }

    const { error: activateError } =
      await supabase
        .from("academic_years")
        .update({
          is_active: true,
        })
        .eq("id", yearId)

    if (activateError) {
      alert(activateError.message)
      return
    }

    await loadData()
  }

  async function deleteYear(
    yearId: string
  ) {
    const confirmed = window.confirm(
      "Supprimer cette année scolaire ? Les périodes liées seront également supprimées."
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("academic_years")
      .delete()
      .eq("id", yearId)

    if (error) {
      alert(error.message)
      return
    }

    if (selectedYearId === yearId) {
      setSelectedYearId("")
    }

    await loadData()
  }

  async function createPeriod(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (!selectedYearId) {
      alert(
        "Veuillez d'abord sélectionner une année scolaire."
      )
      return
    }

    if (!periodName.trim()) {
      alert(
        "Le nom de la période est obligatoire."
      )
      return
    }

    if (!periodStartDate || !periodEndDate) {
      alert("Veuillez renseigner les deux dates.")
      return
    }

    if (periodEndDate <= periodStartDate) {
      alert(
        "La date de fin doit être après la date de début."
      )
      return
    }

    const selectedYear = years.find(
      (year) => year.id === selectedYearId
    )

    if (!selectedYear) {
      alert("Année scolaire introuvable.")
      return
    }

    if (
      periodStartDate < selectedYear.start_date ||
      periodEndDate > selectedYear.end_date
    ) {
      alert(
        "La période doit être comprise dans les dates de l'année scolaire."
      )
      return
    }

    setCreatingPeriod(true)

    const { error } = await supabase
      .from("academic_periods")
      .insert({
        school_id: schoolId,
        academic_year_id: selectedYearId,
        name: periodName.trim(),
        period_type: periodType,
        start_date: periodStartDate,
        end_date: periodEndDate,
        is_active: false,
      })

    if (error) {
      console.error(
        "Erreur création période :",
        error
      )

      if (error.code === "23505") {
        alert(
          "Cette période existe déjà pour cette année scolaire."
        )
      } else {
        alert(error.message)
      }

      setCreatingPeriod(false)
      return
    }

    setPeriodName("")
    setPeriodStartDate("")
    setPeriodEndDate("")

    await loadData()

    setCreatingPeriod(false)
  }

  async function activatePeriod(
    periodId: string
  ) {
    const period = periods.find(
      (item) => item.id === periodId
    )

    if (!period) {
      return
    }

    const { error: deactivateError } =
      await supabase
        .from("academic_periods")
        .update({
          is_active: false,
        })
        .eq(
          "academic_year_id",
          period.academic_year_id
        )

    if (deactivateError) {
      alert(deactivateError.message)
      return
    }

    const { error: activateError } =
      await supabase
        .from("academic_periods")
        .update({
          is_active: true,
        })
        .eq("id", periodId)

    if (activateError) {
      alert(activateError.message)
      return
    }

    await loadData()
  }

  async function deletePeriod(
    periodId: string
  ) {
    const confirmed = window.confirm(
      "Voulez-vous vraiment supprimer cette période ?"
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from("academic_periods")
      .delete()
      .eq("id", periodId)

    if (error) {
      alert(error.message)
      return
    }

    await loadData()
  }

  const selectedYearPeriods =
    periods.filter(
      (period) =>
        period.academic_year_id === selectedYearId
    )

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">
              EduMali
            </h1>

            <p className="text-sm text-muted-foreground">
              Années scolaires et périodes
            </p>
          </div>

          <button
            onClick={() =>
              router.push("/dashboard")
            }
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">
            Année scolaire
          </h2>

          <p className="mt-2 text-muted-foreground">
            Gérez les années scolaires et leurs périodes d'évaluation.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Nouvelle année scolaire
            </h3>

            <form
              onSubmit={createYear}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="year-name">
                  Nom *
                </label>

                <input
                  id="year-name"
                  type="text"
                  placeholder="Ex : 2025-2026"
                  value={yearName}
                  onChange={(event) =>
                    setYearName(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="year-start">
                  Date de début *
                </label>

                <input
                  id="year-start"
                  type="date"
                  value={yearStartDate}
                  onChange={(event) =>
                    setYearStartDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="year-end">
                  Date de fin *
                </label>

                <input
                  id="year-end"
                  type="date"
                  value={yearEndDate}
                  onChange={(event) =>
                    setYearEndDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creatingYear}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creatingYear
                  ? "Enregistrement..."
                  : "Créer l'année scolaire"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Années scolaires
            </h3>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement...
              </p>
            ) : years.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune année scolaire enregistrée.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {years.map((year) => (
                  <div
                    key={year.id}
                    className={`rounded-lg border p-4 ${
                      selectedYearId === year.id
                        ? "border-primary"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <button
                        onClick={() =>
                          setSelectedYearId(
                            year.id
                          )
                        }
                        className="text-left"
                      >
                        <p className="font-semibold">
                          {year.name}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {year.start_date} →{" "}
                          {year.end_date}
                        </p>
                      </button>

                      <div className="flex items-center gap-2">
                        {year.is_active ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              activateYear(
                                year.id
                              )
                            }
                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                          >
                            Activer
                          </button>
                        )}

                        <button
                          onClick={() =>
                            deleteYear(
                              year.id
                            )
                          }
                          className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Nouvelle période
            </h3>

            <form
              onSubmit={createPeriod}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="period-year">
                  Année scolaire *
                </label>

                <select
                  id="period-year"
                  value={selectedYearId}
                  onChange={(event) =>
                    setSelectedYearId(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une année
                  </option>

                  {years.map((year) => (
                    <option
                      key={year.id}
                      value={year.id}
                    >
                      {year.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="period-name">
                  Nom de la période *
                </label>

                <input
                  id="period-name"
                  type="text"
                  placeholder="Ex : Trimestre 1"
                  value={periodName}
                  onChange={(event) =>
                    setPeriodName(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="period-type">
                  Type
                </label>

                <select
                  id="period-type"
                  value={periodType}
                  onChange={(event) =>
                    setPeriodType(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="trimester">
                    Trimestre
                  </option>

                  <option value="semester">
                    Semestre
                  </option>

                  <option value="term">
                    Période
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="period-start">
                  Date de début *
                </label>

                <input
                  id="period-start"
                  type="date"
                  value={periodStartDate}
                  onChange={(event) =>
                    setPeriodStartDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="period-end">
                  Date de fin *
                </label>

                <input
                  id="period-end"
                  type="date"
                  value={periodEndDate}
                  onChange={(event) =>
                    setPeriodEndDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creatingPeriod}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creatingPeriod
                  ? "Enregistrement..."
                  : "Créer la période"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Périodes de l'année sélectionnée
            </h3>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement...
              </p>
            ) : selectedYearId === "" ? (
              <p className="mt-6 text-muted-foreground">
                Sélectionnez une année scolaire.
              </p>
            ) : selectedYearPeriods.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucune période pour cette année.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {selectedYearPeriods.map(
                  (period) => (
                    <div
                      key={period.id}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold">
                            {period.name}
                          </p>

                          <p className="text-sm text-muted-foreground">
                            {period.start_date} →{" "}
                            {period.end_date}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {period.period_type}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {period.is_active ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                activatePeriod(
                                  period.id
                                )
                              }
                              className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                            >
                              Activer
                            </button>
                          )}

                          <button
                            onClick={() =>
                              deletePeriod(
                                period.id
                              )
                            }
                            className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}