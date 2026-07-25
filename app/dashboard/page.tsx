"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"

type Profile = {
  school_id: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
}

type School = {
  name: string | null
}

type NavItem = {
  label: string
  path: string
  roles: string[]
}

const navItems: NavItem[] = [
  { label: "Tableau de bord", path: "/dashboard", roles: ["admin", "teacher"] },
  { label: "Élèves", path: "/students", roles: ["admin", "teacher"] },
  { label: "Enseignants", path: "/teachers", roles: ["admin"] },
  { label: "Classes", path: "/classes", roles: ["admin", "teacher"] },
  { label: "Matières", path: "/subjects", roles: ["admin"] },
  { label: "Classes / Matières", path: "/class_subjects", roles: ["admin"] },
  { label: "Année scolaire", path: "/academic", roles: ["admin"] },
  { label: "Emploi du temps", path: "/timetable", roles: ["admin", "teacher"] },
  { label: "Évaluations", path: "/assessments", roles: ["admin", "teacher"] },
  { label: "Notes", path: "/grades", roles: ["admin", "teacher"] },
  { label: "Moyennes", path: "/averages", roles: ["admin", "teacher"] },
  { label: "Bulletins", path: "/report-card", roles: ["admin", "teacher"] },
  { label: "Présences", path: "/attendance", roles: ["admin", "teacher"] },
  { label: "Frais scolaires", path: "/fees", roles: ["admin"] },
  { label: "Paramètres", path: "/settings", roles: ["admin"] },
]

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [userEmail, setUserEmail] =
    useState("")

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [school, setSchool] =
    useState<School | null>(null)

  const [studentCount, setStudentCount] =
    useState<number | null>(0)

  const [classCount, setClassCount] =
    useState<number | null>(0)

  const [teacherCount, setTeacherCount] =
    useState<number | null>(0)

  const [attendanceCount, setAttendanceCount] =
    useState<number | null>(0)

  useEffect(() => {
    checkUserAndLoadDashboard()
  }, [])

  async function checkUserAndLoadDashboard() {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    setUserEmail(user.email || "")

    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "school_id, first_name, last_name, role"
      )
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        "Erreur profil :",
        profileError
      )

      setLoadError(
        "Impossible de charger votre profil. Rechargez la page ou reconnectez-vous."
      )
      setLoading(false)
      return
    }

    if (!profileData) {
      router.push("/setup-school")
      return
    }

    setProfile(profileData)

    if (!profileData.school_id) {
      router.push("/setup-school")
      return
    }

    const schoolId =
      profileData.school_id

    const dashboardErrors: string[] = []

    const today =
      new Date()
        .toISOString()
        .split("T")[0]

    const [
      schoolResult,
      studentsResult,
      classesResult,
      teachersResult,
      attendanceResult,
    ] = await Promise.all([
      supabase
        .from("schools")
        .select("name")
        .eq("id", schoolId)
        .maybeSingle(),

      supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId),

      supabase
        .from("classes")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId),

      supabase
        .from("teachers")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId),

      // Présences du jour : suppose que la table attendance
      // possède les colonnes school_id et attendance_date.
      supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("attendance_date", today),
    ])

    if (schoolResult.error) {
      console.error("Erreur école :", schoolResult.error)
      dashboardErrors.push("les informations de l'établissement")
    }

    setSchool(schoolResult.data)

    if (studentsResult.error) {
      console.error("Erreur nombre d'élèves :", studentsResult.error)
      dashboardErrors.push("le nombre d'élèves")
      setStudentCount(null)
    } else {
      setStudentCount(studentsResult.count ?? 0)
    }

    if (classesResult.error) {
      console.error("Erreur nombre de classes :", classesResult.error)
      dashboardErrors.push("le nombre de classes")
      setClassCount(null)
    } else {
      setClassCount(classesResult.count ?? 0)
    }

    if (teachersResult.error) {
      console.error("Erreur nombre d'enseignants :", teachersResult.error)
      dashboardErrors.push("le nombre d'enseignants")
      setTeacherCount(null)
    } else {
      setTeacherCount(teachersResult.count ?? 0)
    }

    if (attendanceResult.error) {
      console.error("Erreur présences :", attendanceResult.error)
      dashboardErrors.push("le nombre de présences")
      setAttendanceCount(null)
    } else {
      setAttendanceCount(attendanceResult.count ?? 0)
    }

    if (dashboardErrors.length > 0) {
      setLoadError(
        `Certaines données n'ont pas pu être chargées (${dashboardErrors.join(", ")}). Rechargez la page.`
      )
    }

    setLoading(false)
  }

  function getUserName() {
    if (
      profile?.first_name ||
      profile?.last_name
    ) {
      return `${profile.first_name || ""} ${
        profile.last_name || ""
      }`.trim()
    }

    return userEmail
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  function renderNavItems(onNavigate: () => void) {
    return navItems
      .filter((item) =>
        item.roles.includes(profile?.role || "admin")
      )
      .map((item) => {
        const isActive = item.path === "/dashboard"

        return (
          <button
            key={item.path}
            onClick={() => {
              onNavigate()
              router.push(item.path)
            }}
            className={
              isActive
                ? "w-full rounded-lg px-4 py-3 text-left text-sm font-semibold text-white"
                : "w-full rounded-lg px-4 py-3 text-left text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            }
            style={
              isActive
                ? { background: "oklch(0.58 0.15 45)" }
                : undefined
            }
          >
            {item.label}
          </button>
        )
      })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">
          Chargement du tableau de bord...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-md border border-border md:hidden"
            >
              <span className="h-0.5 w-5 rounded-full bg-foreground" />
              <span className="h-0.5 w-5 rounded-full bg-foreground" />
              <span className="h-0.5 w-5 rounded-full bg-foreground" />
            </button>

            <Logo size="sm" />

            <span className="hidden text-sm text-muted-foreground sm:inline">
              {school?.name || "Gestion scolaire"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-primary-foreground"
              style={{ background: "oklch(0.58 0.15 45)" }}
            >
              {getUserName().charAt(0).toUpperCase() || "?"}
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">
                {getUserName()}
              </p>

              <p className="text-xs text-muted-foreground">
                {userEmail}
              </p>
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Fermer le menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between p-4 shadow-xl"
            style={{ background: "oklch(0.24 0.02 60)" }}
          >
            <div>
              <div className="mb-4 flex items-center justify-between px-1">
                <Logo size="sm" dark />

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fermer le menu"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              <nav className="space-y-1.5">
                {renderNavItems(() => setMobileMenuOpen(false))}
              </nav>
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false)
                handleLogout()
              }}
              className="w-full rounded-lg border border-white/15 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              Déconnexion
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-81px)]">
        <aside
          className="hidden w-64 flex-col justify-between p-4 md:flex"
          style={{ background: "oklch(0.24 0.02 60)" }}
        >
          <nav className="space-y-1.5">
            {renderNavItems(() => {})}
          </nav>

          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-white/15 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:bg-white/10"
          >
            Déconnexion
          </button>
        </aside>

        <section className="flex-1 p-6">
          <div className="mx-auto max-w-7xl space-y-8">
            {loadError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {loadError}
              </div>
            )}

            <div>
              <h2 className="text-3xl font-bold">
                Tableau de bord
              </h2>

              <p className="mt-2 text-muted-foreground">
                Bienvenue sur votre espace de gestion scolaire.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={() =>
                  router.push(
                    "/students"
                  )
                }
                className="rounded-xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.58 0.15 45 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-sm"
                    style={{ background: "oklch(0.58 0.15 45)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Élèves
                </p>

                <p className="mt-1 font-heading text-3xl font-extrabold">
                  {studentCount ?? "—"}
                </p>

                <p className="mt-2 text-sm font-medium text-primary">
                  Gérer les élèves →
                </p>
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/teachers"
                  )
                }
                className="rounded-xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.56 0.13 150 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ background: "oklch(0.56 0.13 150)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Enseignants
                </p>

                <p className="mt-1 font-heading text-3xl font-extrabold">
                  {teacherCount ?? "—"}
                </p>

                <p className="mt-2 text-sm font-medium text-primary">
                  Gérer les enseignants →
                </p>
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/classes"
                  )
                }
                className="rounded-xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.78 0.14 85 / 0.18)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[3px]"
                    style={{ background: "oklch(0.6 0.14 85)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Classes
                </p>

                <p className="mt-1 font-heading text-3xl font-extrabold">
                  {classCount ?? "—"}
                </p>

                <p className="mt-2 text-sm font-medium text-primary">
                  Gérer les classes →
                </p>
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/attendance"
                  )
                }
                className="rounded-xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.58 0.15 45 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[50%_50%_50%_0]"
                    style={{ background: "oklch(0.58 0.15 45)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Présences aujourd'hui
                </p>

                <p className="mt-1 font-heading text-3xl font-extrabold">
                  {attendanceCount ?? "—"}
                </p>

                <p className="mt-2 text-sm font-medium text-primary">
                  Gérer les présences →
                </p>
              </button>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-xl font-semibold">
                Activité récente
              </h3>

              <p className="mt-4 text-muted-foreground">
                Aucune activité récente pour le moment.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}