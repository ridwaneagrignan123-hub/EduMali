"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { ImportReglement } from "@/components/import-reglement"
import {
  SCHOOL_TYPES,
  SCHOOL_TYPE_HINTS,
  SCHOOL_TYPE_LABELS,
  SchoolType,
  toSchoolType,
} from "@/src/lib/etablissement"

type AcademicYear = {
  id: string
  name: string
  is_active: boolean
}

type ClassItem = {
  id: string
  name: string
  level: string | null
}

type FeeClassDefault = {
  id: string
  class_id: string
  academic_year_id: string
  default_amount: number
}

type SchoolRule = {
  id: string
  label: string
  rule_text: string
  is_active: boolean
}

type SchoolHoliday = {
  id: string
  name: string
  start_date: string
  end_date: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}


type School = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  grading_scale: number
  appreciation_excellent: number
  appreciation_very_good: number
  appreciation_good: number
  appreciation_fair: number
  school_type: string
}

function formatScore(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
  })
}

export default function SettingsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")
  const [role, setRole] = useState("")

  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [schoolType, setSchoolType] = useState<SchoolType>("classique")

  // Paramètres pédagogiques : saisis en texte, convertis en nombre à l'enregistrement.
  const [gradingScale, setGradingScale] = useState("20")
  const [appreciationExcellent, setAppreciationExcellent] = useState("18")
  const [appreciationVeryGood, setAppreciationVeryGood] = useState("16")
  const [appreciationGood, setAppreciationGood] = useState("14")
  const [appreciationFair, setAppreciationFair] = useState("10")

  const [savingPedagogy, setSavingPedagogy] = useState(false)
  const [pedagogyError, setPedagogyError] = useState<string | null>(null)
  const [pedagogyMessage, setPedagogyMessage] = useState<string | null>(null)

  // Montants de frais par défaut, par classe et par année scolaire.
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [feeDefaults, setFeeDefaults] = useState<FeeClassDefault[]>([])

  const [selectedFeeYearId, setSelectedFeeYearId] = useState("")
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({})

  const [savingFees, setSavingFees] = useState(false)
  const [feesError, setFeesError] = useState<string | null>(null)
  const [feesMessage, setFeesMessage] = useState<string | null>(null)

  /*
   * Règlement intérieur. Chaque école écrit le sien : il n'y a pas de
   * règlement générique qui vaudrait partout, et les violations
   * enregistrées renvoient à CES règles-là.
   */
  const [rules, setRules] = useState<SchoolRule[]>([])
  const [ruleLabel, setRuleLabel] = useState("")
  const [ruleText, setRuleText] = useState("")
  const [savingRule, setSavingRule] = useState(false)
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [ruleMessage, setRuleMessage] = useState<string | null>(null)

  // Calendrier scolaire : vacances et jours fériés.
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([])

  const [holidayName, setHolidayName] = useState("")
  const [holidayStart, setHolidayStart] = useState("")
  const [holidayEnd, setHolidayEnd] = useState("")

  const [savingHoliday, setSavingHoliday] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(
    null
  )
  const [holidayError, setHolidayError] = useState<string | null>(null)
  const [holidayMessage, setHolidayMessage] = useState<string | null>(null)

  /*
   * Les parametres de l'etablissement appartiennent au directeur
   * general : c'est le seul role a vue ecole entiere qui ecrive. Le
   * promoteur les consulte, comme tout le reste.
   */
  const isAdmin = role === "directeur_general"

  /*
   * Les champs de montants suivent l'année scolaire sélectionnée :
   * une classe sans montant défini pour cette année reste vide.
   */
  useEffect(() => {
    // Fonction interne : voir la note sur les rendus en cascade.
    function appliquer() {
      const amounts: Record<string, string> = {}

      feeDefaults
        .filter((item) => item.academic_year_id === selectedFeeYearId)
        .forEach((item) => {
          amounts[item.class_id] = String(Number(item.default_amount))
        })

      setFeeAmounts(amounts)
    }

    appliquer()
  }, [feeDefaults, selectedFeeYearId])

  async function loadSchool() {
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
      .select("school_id, role")
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
    setRole(profile.role ?? "")

    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select(
        "id, name, address, phone, email, logo_url, grading_scale, appreciation_excellent, appreciation_very_good, appreciation_good, appreciation_fair, school_type"
      )
      .eq("id", profile.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error("Erreur école :", schoolError)
      setLoadError(
        "Impossible de charger les informations de l'établissement."
      )
      setLoading(false)
      return
    }

    if (school) {
      const schoolData = school as School
      setName(schoolData.name ?? "")
      setAddress(schoolData.address ?? "")
      setPhone(schoolData.phone ?? "")
      setEmail(schoolData.email ?? "")
      setLogoUrl(schoolData.logo_url ?? "")
      setSchoolType(toSchoolType(schoolData.school_type))

      setGradingScale(String(Number(schoolData.grading_scale)))
      setAppreciationExcellent(
        String(Number(schoolData.appreciation_excellent))
      )
      setAppreciationVeryGood(
        String(Number(schoolData.appreciation_very_good))
      )
      setAppreciationGood(String(Number(schoolData.appreciation_good)))
      setAppreciationFair(String(Number(schoolData.appreciation_fair)))
    }

    const [
      yearsResult,
      classesResult,
      defaultsResult,
      holidaysResult,
      rulesResult,
    ] = await Promise.all([
      supabase
        .from("academic_years")
        .select("id, name, is_active")
        .eq("school_id", profile.school_id)
        .order("start_date", { ascending: false }),

      supabase
        .from("classes")
        .select("id, name, level")
        .eq("school_id", profile.school_id)
        .order("name"),

      supabase
        .from("fee_class_defaults")
        .select("id, class_id, academic_year_id, default_amount")
        .eq("school_id", profile.school_id),

      supabase
        .from("school_holidays")
        .select("id, name, start_date, end_date")
        .eq("school_id", profile.school_id)
        .order("start_date", { ascending: true }),

      supabase
        .from("school_rules")
        .select("id, label, rule_text, is_active")
        .eq("school_id", profile.school_id)
        .order("label"),
    ])

    if (yearsResult.error) {
      console.error("Erreur années scolaires :", yearsResult.error)
    } else {
      const loadedYears = (yearsResult.data as AcademicYear[]) ?? []
      setAcademicYears(loadedYears)

      const activeYear = loadedYears.find((year) => year.is_active)
      setSelectedFeeYearId(activeYear?.id ?? loadedYears[0]?.id ?? "")
    }

    if (classesResult.error) {
      console.error("Erreur classes :", classesResult.error)
    } else {
      setClasses((classesResult.data as ClassItem[]) ?? [])
    }

    if (defaultsResult.error) {
      console.error("Erreur montants par défaut :", defaultsResult.error)
    } else {
      setFeeDefaults((defaultsResult.data as FeeClassDefault[]) ?? [])
    }

    if (rulesResult.error) {
      console.error("Erreur règlement intérieur :", rulesResult.error)
    } else {
      setRules((rulesResult.data as SchoolRule[]) ?? [])
    }

    if (holidaysResult.error) {
      console.error("Erreur calendrier scolaire :", holidaysResult.error)
    } else {
      setHolidays((holidaysResult.data as SchoolHoliday[]) ?? [])
    }

    setLoading(false)
  }

  /*
   * L'effet est place APRES la fonction qu'il appelle, et non avant.
   *
   * Une fonction du corps du composant est recreee a chaque rendu :
   * l'appeler depuis un effet declare plus haut, c'est capturer une
   * version qui ne suivra pas les rendus suivants. Le lint le signale
   * comme un acces avant declaration ; c'est un vrai piege, pas une
   * question de style.
   */
  useEffect(() => {
    /*
     * Le chargement passe par une fonction interne : appeler le
     * chargeur directement dans le corps de l'effet y declenche des
     * mises a jour d'etat synchrones, et enchaine les rendus.
     */
    async function lancer() {
      await loadSchool()
    }

    lancer()
  }, [])

  async function reloadHolidays() {
    const { data, error } = await supabase
      .from("school_holidays")
      .select("id, name, start_date, end_date")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: true })

    if (error) {
      console.error("Erreur calendrier scolaire :", error)
      return
    }

    setHolidays((data as SchoolHoliday[]) ?? [])
  }

  async function reloadFeeDefaults() {
    const { data, error } = await supabase
      .from("fee_class_defaults")
      .select("id, class_id, academic_year_id, default_amount")
      .eq("school_id", schoolId)

    if (error) {
      console.error("Erreur montants par défaut :", error)
      return
    }

    setFeeDefaults((data as FeeClassDefault[]) ?? [])
  }

  async function ajouterRegle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (ruleLabel.trim().length < 2 || !ruleText.trim()) {
      setRuleError("Le libellé et le texte de la règle sont obligatoires.")
      return
    }

    setSavingRule(true)
    setRuleError(null)
    setRuleMessage(null)

    const { error } = await supabase.from("school_rules").insert({
      school_id: schoolId,
      label: ruleLabel.trim(),
      rule_text: ruleText.trim(),
    })

    setSavingRule(false)

    if (error) {
      console.error("Erreur règle :", error)

      setRuleError(
        error.code === "23505"
          ? `Une règle nommée « ${ruleLabel.trim()} » existe déjà.`
          : error.message
      )
      return
    }

    setRuleLabel("")
    setRuleText("")
    setRuleMessage("Règle ajoutée au règlement intérieur.")
    await rechargerRegles()
  }

  async function rechargerRegles() {
    const { data, error } = await supabase
      .from("school_rules")
      .select("id, label, rule_text, is_active")
      .eq("school_id", schoolId)
      .order("label")

    if (error) {
      console.error("Erreur règlement :", error)
      return
    }

    setRules((data as SchoolRule[]) ?? [])
  }

  /*
   * On DÉSACTIVE une règle, on ne la supprime pas : une règle abrogée
   * reste celle qui fondait les violations déjà enregistrées. La clé de
   * rule_violations est d'ailleurs en RESTRICT pour cette raison.
   */
  async function basculerRegle(regle: SchoolRule) {
    setRuleError(null)
    setRuleMessage(null)

    const { error } = await supabase
      .from("school_rules")
      .update({ is_active: !regle.is_active })
      .eq("id", regle.id)

    if (error) {
      console.error("Erreur règle :", error)
      setRuleError(error.message)
      return
    }

    setRuleMessage(
      regle.is_active
        ? `« ${regle.label} » est désactivée : elle ne sera plus proposée, les violations passées restent.`
        : `« ${regle.label} » est de nouveau active.`
    )

    await rechargerRegles()
  }

  async function saveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim()) {
      alert("Le nom de l'établissement est obligatoire.")
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)

    const { error } = await supabase
      .from("schools")
      .update({
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        logo_url: logoUrl.trim() || null,
        school_type: schoolType,
      })
      .eq("id", schoolId)

    if (error) {
      console.error(
        "Erreur lors de la mise à jour de l'établissement :",
        error
      )
      setSaveError(
        "Impossible d'enregistrer les modifications. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
      )
      setSaving(false)
      return
    }

    setSaveMessage("Informations de l'établissement enregistrées avec succès.")
    setSaving(false)
  }

  /*
   * Valeurs pédagogiques telles que saisies, converties en nombres.
   * Sert à la fois à la validation et à l'aperçu des tranches.
   */
  const pedagogyValues = {
    scale: Number(gradingScale),
    excellent: Number(appreciationExcellent),
    veryGood: Number(appreciationVeryGood),
    good: Number(appreciationGood),
    fair: Number(appreciationFair),
  }

  /*
   * Mêmes règles que les contraintes CHECK en base
   * (schools_grading_scale_check et schools_appreciation_order_check),
   * vérifiées ici pour donner un message clair avant l'appel réseau.
   */
  function validatePedagogy() {
    const { scale, excellent, veryGood, good, fair } = pedagogyValues

    const allValues = [scale, excellent, veryGood, good, fair]

    if (allValues.some((value) => !Number.isFinite(value))) {
      return "Toutes les valeurs doivent être des nombres."
    }

    if (scale <= 0 || scale > 100) {
      return "Le barème doit être compris entre 1 et 100."
    }

    if (fair < 0) {
      return "Le seuil « Passable » ne peut pas être négatif."
    }

    if (!(excellent > veryGood && veryGood > good && good > fair)) {
      return "Les seuils doivent être strictement décroissants : Excellent > Très bien > Bien > Passable."
    }

    if (excellent > scale) {
      return `Le seuil « Excellent » (${formatScore(excellent)}) ne peut pas dépasser le barème (${formatScore(scale)}).`
    }

    return null
  }

  const pedagogyValidationError = validatePedagogy()

  async function savePedagogy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setPedagogyError(null)
    setPedagogyMessage(null)

    const validationError = validatePedagogy()

    if (validationError) {
      setPedagogyError(validationError)
      return
    }

    setSavingPedagogy(true)

    const { scale, excellent, veryGood, good, fair } = pedagogyValues

    const { error } = await supabase
      .from("schools")
      .update({
        grading_scale: scale,
        appreciation_excellent: excellent,
        appreciation_very_good: veryGood,
        appreciation_good: good,
        appreciation_fair: fair,
      })
      .eq("id", schoolId)

    if (error) {
      console.error(
        "Erreur lors de la mise à jour des paramètres pédagogiques :",
        error
      )
      setPedagogyError(
        "Impossible d'enregistrer les paramètres pédagogiques. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
      )
      setSavingPedagogy(false)
      return
    }

    setPedagogyMessage(
      "Paramètres pédagogiques enregistrés. Ils s'appliquent aux bulletins et aux moyennes."
    )
    setSavingPedagogy(false)
  }

  async function saveFeeDefaults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setFeesError(null)
    setFeesMessage(null)

    if (!selectedFeeYearId) {
      setFeesError("Sélectionnez une année scolaire.")
      return
    }

    const rowsToUpsert: {
      school_id: string
      class_id: string
      academic_year_id: string
      default_amount: number
    }[] = []

    // Un champ vidé signifie « plus de montant par défaut pour cette classe ».
    const classIdsToClear: string[] = []

    for (const classItem of classes) {
      const rawValue = (feeAmounts[classItem.id] ?? "").trim()

      if (!rawValue) {
        classIdsToClear.push(classItem.id)
        continue
      }

      const amount = Number(rawValue)

      if (!Number.isFinite(amount) || amount < 0) {
        setFeesError(
          `Le montant de la classe « ${classItem.name} » doit être un nombre positif.`
        )
        return
      }

      rowsToUpsert.push({
        school_id: schoolId,
        class_id: classItem.id,
        academic_year_id: selectedFeeYearId,
        default_amount: amount,
      })
    }

    setSavingFees(true)

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from("fee_class_defaults")
        .upsert(rowsToUpsert, {
          onConflict: "class_id,academic_year_id",
        })

      if (error) {
        console.error("Erreur enregistrement des montants :", error)
        setFeesError(
          "Impossible d'enregistrer les montants. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
        )
        setSavingFees(false)
        return
      }
    }

    if (classIdsToClear.length > 0) {
      const { error } = await supabase
        .from("fee_class_defaults")
        .delete()
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedFeeYearId)
        .in("class_id", classIdsToClear)

      if (error) {
        console.error("Erreur suppression des montants :", error)
        setFeesError(
          "Les montants saisis ont été enregistrés, mais les montants effacés n'ont pas pu être supprimés."
        )
        setSavingFees(false)
        return
      }
    }

    await reloadFeeDefaults()

    setFeesMessage(
      "Montants par défaut enregistrés. Ils pré-remplissent la page Frais scolaires."
    )
    setSavingFees(false)
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setHolidayError(null)
    setHolidayMessage(null)

    if (!holidayName.trim()) {
      setHolidayError("Donnez un nom à cette période.")
      return
    }

    if (!holidayStart || !holidayEnd) {
      setHolidayError("Indiquez une date de début et une date de fin.")
      return
    }

    /*
     * Même règle que la contrainte school_holidays_dates_check :
     * l'égalité est permise pour un jour férié isolé.
     */
    if (holidayEnd < holidayStart) {
      setHolidayError(
        "La date de fin ne peut pas être antérieure à la date de début."
      )
      return
    }

    setSavingHoliday(true)

    const { error } = await supabase.from("school_holidays").insert({
      school_id: schoolId,
      name: holidayName.trim(),
      start_date: holidayStart,
      end_date: holidayEnd,
    })

    if (error) {
      console.error("Erreur ajout période :", error)
      setHolidayError(
        "Impossible d'ajouter cette période. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
      )
      setSavingHoliday(false)
      return
    }

    setHolidayName("")
    setHolidayStart("")
    setHolidayEnd("")

    await reloadHolidays()

    setHolidayMessage("Période ajoutée au calendrier scolaire.")
    setSavingHoliday(false)
  }

  async function deleteHoliday(holiday: SchoolHoliday) {
    const confirmed = window.confirm(
      `Supprimer « ${holiday.name} » du calendrier scolaire ?`
    )

    if (!confirmed) {
      return
    }

    setHolidayError(null)
    setHolidayMessage(null)
    setDeletingHolidayId(holiday.id)

    const { error } = await supabase
      .from("school_holidays")
      .delete()
      .eq("id", holiday.id)
      .eq("school_id", schoolId)

    if (error) {
      console.error("Erreur suppression période :", error)
      setHolidayError(
        "Impossible de supprimer cette période. Vérifiez que vous avez les droits nécessaires (réservé aux administrateurs)."
      )
      setDeletingHolidayId(null)
      return
    }

    await reloadHolidays()

    setHolidayMessage("Période supprimée.")
    setDeletingHolidayId(null)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement des paramètres...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>
            <p className="text-sm text-muted-foreground">Paramètres</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {isAdmin && (
              <button
                onClick={() => router.push("/users")}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Comptes utilisateurs
              </button>
            )}

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Retour au dashboard
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h2 className="text-3xl font-bold">
            Paramètres de l'établissement
          </h2>

          <p className="mt-2 text-muted-foreground">
            Modifiez les informations générales de votre établissement.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border bg-background p-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
              style={{ background: "oklch(0.585 0.16 38 / 0.08)" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={`Logo ${name || "établissement"}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-2xl font-heading font-extrabold text-primary">
                  {name.charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>

            <div>
              <p className="font-heading text-xl font-bold">
                {name || "Établissement scolaire"}
              </p>

              <p className="text-sm text-muted-foreground">
                {address || "Aucune adresse renseignée"}
              </p>
            </div>
          </div>

          <form onSubmit={saveSchool} className="mt-8 space-y-4">
            <div className="space-y-2">
              <label htmlFor="school-name">Nom de l'établissement *</label>

              <input
                id="school-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="school-address">Adresse</label>

              <input
                id="school-address"
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="school-phone">Téléphone</label>

                <input
                  id="school-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="school-email">Email de contact</label>

                <input
                  id="school-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="school-logo">URL du logo</label>

              <input
                id="school-logo"
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border bg-background px-3 py-2"
              />

              <p className="text-xs text-muted-foreground">
                Collez le lien d'une image déjà hébergée en ligne. Ce logo
                apparaît sur les bulletins scolaires.
              </p>
            </div>

            {/*
              Le type d'établissement commande l'affichage de la scolarité :
              en franco-arabe, l'axe filière apparaît sur les directions et
              sur les titulaires de premier cycle. En classique, il reste
              invisible partout.
            */}
            <fieldset className="space-y-2">
              <legend className="mb-2">Type d&apos;établissement</legend>

              <div className="space-y-2">
                {SCHOOL_TYPES.map((type) => (
                  <label
                    key={type}
                    htmlFor={`settings-school-type-${type}`}
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                      schoolType === type ? "border-primary bg-muted/50" : ""
                    }`}
                  >
                    <input
                      id={`settings-school-type-${type}`}
                      type="radio"
                      name="settingsSchoolType"
                      value={type}
                      checked={schoolType === type}
                      onChange={() => setSchoolType(type)}
                      className="mt-1"
                    />

                    <span>
                      <span className="block font-medium">
                        {SCHOOL_TYPE_LABELS[type]}
                      </span>

                      <span className="block text-sm text-muted-foreground">
                        {SCHOOL_TYPE_HINTS[type]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {saveError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {saveError}
              </div>
            )}

            {saveMessage && (
              <p className="text-sm text-muted-foreground">{saveMessage}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </form>
        </div>

        {/*
          Les deux réglages « payer les absences excusées » et « retenir
          les retards » ont été RETIRÉS avec la paie au pointage. Sous ce
          modèle il n'y a plus de déduction à paramétrer : un vacataire
          est payé sur ses heures confirmées, et une absence est
          simplement l'absence de pointage. Les laisser aurait affiché
          deux réglages qui ne commandaient plus rien.
        */}
        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Paie des enseignants
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Un vacataire est payé sur les heures <strong>confirmées par
            pointage</strong> depuis la Vie scolaire : chaque cours assuré
            est validé pour la journée, et lui seul entre dans la paie. Un
            créneau non pointé n&apos;est pas payé — il n&apos;y a donc
            aucune retenue d&apos;absence à régler ici.
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Un permanent reste mensualisé : son salaire ne dépend ni du
            pointage ni du planning. Les retards et absences relevés en Vie
            scolaire gardent leur portée disciplinaire, sans effet sur la
            paie.
          </p>
        </div>

        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Paramètres pédagogiques
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Ces valeurs pilotent le calcul et l'affichage des notes sur les
            bulletins scolaires et la page des moyennes.
          </p>

          {!isAdmin && (
            <div
              className="mt-6 rounded-lg border p-4 text-sm"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.4)",
              }}
            >
              Seuls les administrateurs peuvent modifier ces paramètres. Vous
              les consultez en lecture seule.
            </div>
          )}

          <form onSubmit={savePedagogy} className="mt-6 space-y-6">
            <div className="space-y-2">
              <label htmlFor="grading-scale">Barème général *</label>

              <input
                id="grading-scale"
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={gradingScale}
                onChange={(event) => setGradingScale(event.target.value)}
                disabled={!isAdmin}
                className="w-full max-w-40 rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                required
              />

              <p className="text-xs text-muted-foreground">
                Les notes sont ramenées sur cette échelle. Le standard le plus
                répandu dans la région est 20.
              </p>
            </div>

            <div>
              <p className="font-medium">Seuils d'appréciation *</p>

              <p className="mt-1 text-xs text-muted-foreground">
                Note minimale pour obtenir chaque appréciation. En dessous du
                seuil « Passable », l'appréciation est « Insuffisant ».
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="appreciation-excellent">Excellent</label>

                  <input
                    id="appreciation-excellent"
                    type="number"
                    min="0"
                    step="0.01"
                    value={appreciationExcellent}
                    onChange={(event) =>
                      setAppreciationExcellent(event.target.value)
                    }
                    disabled={!isAdmin}
                    className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="appreciation-very-good">Très bien</label>

                  <input
                    id="appreciation-very-good"
                    type="number"
                    min="0"
                    step="0.01"
                    value={appreciationVeryGood}
                    onChange={(event) =>
                      setAppreciationVeryGood(event.target.value)
                    }
                    disabled={!isAdmin}
                    className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="appreciation-good">Bien</label>

                  <input
                    id="appreciation-good"
                    type="number"
                    min="0"
                    step="0.01"
                    value={appreciationGood}
                    onChange={(event) =>
                      setAppreciationGood(event.target.value)
                    }
                    disabled={!isAdmin}
                    className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="appreciation-fair">Passable</label>

                  <input
                    id="appreciation-fair"
                    type="number"
                    min="0"
                    step="0.01"
                    value={appreciationFair}
                    onChange={(event) =>
                      setAppreciationFair(event.target.value)
                    }
                    disabled={!isAdmin}
                    className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                    required
                  />
                </div>
              </div>
            </div>

            {pedagogyValidationError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {pedagogyValidationError}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Aperçu des tranches</p>

                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">
                      Excellent
                    </span>{" "}
                    : à partir de {formatScore(pedagogyValues.excellent)} /{" "}
                    {formatScore(pedagogyValues.scale)}
                  </li>

                  <li>
                    <span className="font-medium text-foreground">
                      Très bien
                    </span>{" "}
                    : de {formatScore(pedagogyValues.veryGood)} à moins de{" "}
                    {formatScore(pedagogyValues.excellent)}
                  </li>

                  <li>
                    <span className="font-medium text-foreground">Bien</span> :
                    de {formatScore(pedagogyValues.good)} à moins de{" "}
                    {formatScore(pedagogyValues.veryGood)}
                  </li>

                  <li>
                    <span className="font-medium text-foreground">
                      Passable
                    </span>{" "}
                    : de {formatScore(pedagogyValues.fair)} à moins de{" "}
                    {formatScore(pedagogyValues.good)}
                  </li>

                  <li>
                    <span className="font-medium text-foreground">
                      Insuffisant
                    </span>{" "}
                    : moins de {formatScore(pedagogyValues.fair)}
                  </li>
                </ul>
              </div>
            )}

            {pedagogyError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {pedagogyError}
              </div>
            )}

            {pedagogyMessage && (
              <p className="text-sm text-muted-foreground">
                {pedagogyMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={
                savingPedagogy ||
                !isAdmin ||
                pedagogyValidationError !== null
              }
              className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPedagogy
                ? "Enregistrement..."
                : "Enregistrer les paramètres pédagogiques"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Montants de frais par défaut
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Définissez un montant standard par classe. Il pré-remplit le
            montant dû sur la page Frais scolaires et reste modifiable élève
            par élève.
          </p>

          {!isAdmin && (
            <div
              className="mt-6 rounded-lg border p-4 text-sm"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.4)",
              }}
            >
              Seuls les administrateurs peuvent modifier ces montants. Vous les
              consultez en lecture seule.
            </div>
          )}

          {academicYears.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Aucune année scolaire n'a encore été créée.{" "}
              <button
                onClick={() => router.push("/academic")}
                className="font-medium text-primary underline"
              >
                Créer une année scolaire
              </button>
            </p>
          ) : classes.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Aucune classe n'a encore été créée.{" "}
              <button
                onClick={() => router.push("/classes")}
                className="font-medium text-primary underline"
              >
                Créer une classe
              </button>
            </p>
          ) : (
            <form onSubmit={saveFeeDefaults} className="mt-6 space-y-6">
              <div className="space-y-2">
                <label htmlFor="fee-year">Année scolaire</label>

                <select
                  id="fee-year"
                  value={selectedFeeYearId}
                  onChange={(event) =>
                    setSelectedFeeYearId(event.target.value)
                  }
                  className="w-full max-w-sm rounded-md border bg-background px-3 py-2"
                >
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-muted-foreground">
                  Les montants sont propres à chaque année : changer d'année
                  n'écrase pas les montants des années précédentes.
                </p>
              </div>

              <div className="space-y-3">
                {classes.map((classItem) => (
                  <div
                    key={classItem.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-medium">{classItem.name}</p>

                      {classItem.level && (
                        <p className="text-xs text-muted-foreground">
                          {classItem.level}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`fee-amount-${classItem.id}`}
                        className="sr-only"
                      >
                        Montant par défaut pour {classItem.name}
                      </label>

                      <input
                        id={`fee-amount-${classItem.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={feeAmounts[classItem.id] ?? ""}
                        onChange={(event) =>
                          setFeeAmounts((current) => ({
                            ...current,
                            [classItem.id]: event.target.value,
                          }))
                        }
                        disabled={!isAdmin}
                        placeholder="Aucun"
                        className="w-40 rounded-md border bg-background px-3 py-2 disabled:opacity-60"
                      />

                      <span className="text-sm text-muted-foreground">
                        FCFA
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Laissez un champ vide pour retirer le montant par défaut d'une
                classe.
              </p>

              {feesError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {feesError}
                </div>
              )}

              {feesMessage && (
                <p className="text-sm text-muted-foreground">{feesMessage}</p>
              )}

              <button
                type="submit"
                disabled={savingFees || !isAdmin}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingFees
                  ? "Enregistrement..."
                  : "Enregistrer les montants par défaut"}
              </button>
            </form>
          )}
        </div>

        {/*
          Le règlement intérieur de CETTE école. Il n'y a pas de règlement
          générique qui vaudrait partout, et les violations enregistrées
          renvoient à ces règles-là — c'est pourquoi on les désactive au
          lieu de les supprimer.
        */}
        {/*
          L'import passe AVANT la saisie a la main : recopier un
          reglement article par article decourage l'adoption, et c'est le
          premier obstacle rencontre par une ecole qui ouvre son compte.
        */}
        {isAdmin && schoolId && (
          <ImportReglement schoolId={schoolId} onImporte={loadSchool} />
        )}

        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Règlement intérieur
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Les règles que l&apos;établissement fait respecter. Elles sont
            proposées en Vie scolaire au moment de constater un manquement,
            et reprises dans le message envoyé à la famille.
          </p>

          {!isAdmin ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Réservé à l&apos;administrateur.
            </p>
          ) : (
            <form onSubmit={ajouterRegle} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label htmlFor="rule-label">Libellé court *</label>

                <input
                  id="rule-label"
                  value={ruleLabel}
                  onChange={(event) => setRuleLabel(event.target.value)}
                  placeholder="Ex : Tenue scolaire"
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="rule-text">Texte de la règle *</label>

                <textarea
                  id="rule-text"
                  value={ruleText}
                  onChange={(event) => setRuleText(event.target.value)}
                  rows={3}
                  placeholder="Ex : la tenue de l'établissement est obligatoire du lundi au vendredi."
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                />
              </div>

              {ruleError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {ruleError}
                </div>
              )}

              {ruleMessage && (
                <p className="text-sm text-muted-foreground">{ruleMessage}</p>
              )}

              <button
                type="submit"
                disabled={savingRule}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingRule ? "Enregistrement..." : "Ajouter la règle"}
              </button>
            </form>
          )}

          {rules.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Aucune règle enregistrée. Tant que le règlement est vide,
              aucun manquement ne peut être constaté.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {rules.map((regle) => (
                <div
                  key={regle.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="min-w-[220px] flex-1">
                    <p className="font-medium">
                      {regle.label}
                      {!regle.is_active && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          (désactivée)
                        </span>
                      )}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {regle.rule_text}
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => basculerRegle(regle)}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {regle.is_active ? "Désactiver" : "Réactiver"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-background p-6">
          <h3 className="font-heading text-xl font-bold">
            Calendrier scolaire
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Vacances et jours fériés de l'établissement. La page Présences
            signale les dates qui tombent dans l'une de ces périodes.
          </p>

          {!isAdmin && (
            <div
              className="mt-6 rounded-lg border p-4 text-sm"
              style={{
                background: "oklch(0.80 0.14 78 / 0.12)",
                borderColor: "oklch(0.57 0.14 78 / 0.4)",
              }}
            >
              Seuls les administrateurs peuvent modifier le calendrier. Vous le
              consultez en lecture seule.
            </div>
          )}

          {isAdmin && (
            <form onSubmit={addHoliday} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label htmlFor="holiday-name">Nom de la période *</label>

                <input
                  id="holiday-name"
                  type="text"
                  value={holidayName}
                  onChange={(event) => setHolidayName(event.target.value)}
                  placeholder="Vacances de Noël, Fête de l'Indépendance..."
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="holiday-start">Date de début *</label>

                  <input
                    id="holiday-start"
                    type="date"
                    value={holidayStart}
                    onChange={(event) => setHolidayStart(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="holiday-end">Date de fin *</label>

                  <input
                    id="holiday-end"
                    type="date"
                    value={holidayEnd}
                    onChange={(event) => setHolidayEnd(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />

                  <p className="text-xs text-muted-foreground">
                    Pour un jour férié isolé, indiquez la même date qu'au
                    début.
                  </p>
                </div>
              </div>

              {holidayError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {holidayError}
                </div>
              )}

              {holidayMessage && (
                <p className="text-sm text-muted-foreground">
                  {holidayMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={savingHoliday}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingHoliday ? "Ajout..." : "Ajouter la période"}
              </button>
            </form>
          )}

          <div className="mt-8">
            <p className="font-medium">
              Périodes enregistrées
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {holidays.length}
              </span>
            </p>

            {holidays.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Aucune période enregistrée pour le moment.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {holidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-medium">{holiday.name}</p>

                      <p className="text-sm text-muted-foreground">
                        {holiday.start_date === holiday.end_date
                          ? formatDate(holiday.start_date)
                          : `Du ${formatDate(holiday.start_date)} au ${formatDate(holiday.end_date)}`}
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => deleteHoliday(holiday)}
                        disabled={deletingHolidayId === holiday.id}
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ color: "oklch(0.577 0.245 27.325)" }}
                      >
                        {deletingHolidayId === holiday.id
                          ? "Suppression..."
                          : "Supprimer"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}