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

  const [userEmail, setUserEmail] =
    useState("")

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [school, setSchool] =
    useState<School | null>(null)

  const [studentCount, setStudentCount] =
    useState(0)

  const [classCount, setClassCount] =
    useState(0)

  const [teacherCount, setTeacherCount] =
    useState(0)

  const [attendanceCount, setAttendanceCount] =
    useState(0)

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

    const {
      data: schoolData,
      error: schoolError,
    } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle()

    if (schoolError) {
      console.error(
        "Erreur école :",
        schoolError
      )
      dashboardErrors.push("les informations de l'établissement")
    }

    setSchool(schoolData)

    const {
      count: studentsCount,
      error: studentsError,
    } = await supabase
      .from("students")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "school_id",
        schoolId
      )

    if (studentsError) {
      console.error(
        "Erreur nombre d'élèves :",
        studentsError
      )
      dashboardErrors.push("le nombre d'élèves")
    } else {
      setStudentCount(
        studentsCount ?? 0
      )
    }

    const {
      count: classesCount,
      error: classesError,
    } = await supabase
      .from("classes")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "school_id",
        schoolId
      )

    if (classesError) {
      console.error(
        "Erreur nombre de classes :",
        classesError
      )
      dashboardErrors.push("le nombre de classes")
    } else {
      setClassCount(
        classesCount ?? 0
      )
    }

    const {
      count: teachersCount,
      error: teachersError,
    } = await supabase
      .from("teachers")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "school_id",
        schoolId
      )

    if (teachersError) {
      console.error(
        "Erreur nombre d'enseignants :",
        teachersError
      )
      dashboardErrors.push("le nombre d'enseignants")
    } else {
      setTeacherCount(
        teachersCount ?? 0
      )
    }

    /*
     * Présences du jour
     *
     * Cette requête suppose que la table
     * attendance possède les colonnes :
     *
     * school_id
     * attendance_date
     */

    const today =
      new Date()
        .toISOString()
        .split("T")[0]

    const {
      count: attendanceTodayCount,
      error: attendanceError,
    } = await supabase
      .from("attendance")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "school_id",
        schoolId
      )
      .eq(
        "attendance_date",
        today
      )

    if (attendanceError) {
      console.error(
        "Erreur présences :",
        attendanceError
      )

      setAttendanceCount(0)
    } else {
      setAttendanceCount(
        attendanceTodayCount ?? 0
      )
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

            <div className="text-right">
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

      <div className="flex min-h-[calc(100vh-81px)]">
        <aside
          className="hidden w-64 flex-col justify-between p-4 md:flex"
          style={{ background: "oklch(0.24 0.02 60)" }}
        >
          <nav className="space-y-1.5">
            {navItems
              .filter((item) =>
                item.roles.includes(
                  profile?.role || "admin"
                )
              )
              .map((item) => {
                const isActive = item.path === "/dashboard"

                return (
                  <button
                    key={item.path}
                    onClick={() =>
                      router.push(item.path)
                    }
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
              })}
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
                  {studentCount}
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
                  {teacherCount}
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
                  {classCount}
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
                  {attendanceCount}
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