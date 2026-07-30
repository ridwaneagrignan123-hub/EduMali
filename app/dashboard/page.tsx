"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"
import { NAV_ITEMS } from "@/src/lib/roles"
import { AvertissementDirection } from "@/components/avertissement-direction"

type Profile = {
  school_id: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  direction_id: string | null
}

type School = {
  name: string | null
}

/*
 * Le menu vit désormais dans src/lib/roles.ts, aux côtés des
 * permissions, pour qu'une règle et son affichage ne puissent plus
 * diverger. C'est ainsi que « Frais scolaires » restait proposé au
 * directeur général, qui n'y a pas accès.
 */
const navItems = NAV_ITEMS

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

  // Renseigné uniquement pour un directeur de direction.
  const [directionName, setDirectionName] =
    useState<string | null>(null)

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
        "school_id, first_name, last_name, role, direction_id"
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

    /*
     * Un directeur de direction ne voit que son périmètre.
     *
     * Le RLS filtre déjà classes, inscriptions, notes, évaluations et
     * affectations. Mais students, teachers et attendance restent au
     * périmètre de l'école : leurs compteurs sont donc restreints ici,
     * en repassant par les classes de la direction.
     */
    if (
      profileData.role === "directeur_direction"
    ) {
      await loadDirectionCounts(
        schoolId,
        profileData.direction_id,
        today,
        dashboardErrors
      )

      if (dashboardErrors.length > 0) {
        setLoadError(
          `Certaines données n'ont pas pu être chargées (${dashboardErrors.join(", ")}). Rechargez la page.`
        )
      }

      setLoading(false)
      return
    }

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

      /*
       * Compté sur « id » et non sur « * » : les colonnes de
       * rémunération de teachers sont révoquées au rôle authenticated,
       * et une étoile réclamerait un droit qu'il n'a plus.
       */
      supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
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

  /*
   * Compteurs restreints au périmètre d'un directeur de direction.
   *
   * On part des classes visibles : le RLS ne renvoie déjà que celles de
   * sa direction. Élèves et enseignants en sont déduits via les
   * inscriptions et les affectations de matières.
   */
  async function loadDirectionCounts(
    currentSchoolId: string,
    directionId: string | null,
    today: string,
    dashboardErrors: string[]
  ) {
    const { data: schoolData, error: schoolError } = await supabase
      .from("schools")
      .select("name")
      .eq("id", currentSchoolId)
      .maybeSingle()

    if (schoolError) {
      console.error("Erreur école :", schoolError)
      dashboardErrors.push("les informations de l'établissement")
    }

    setSchool(schoolData)

    if (directionId) {
      const { data: directionData } = await supabase
        .from("directions")
        .select("name")
        .eq("id", directionId)
        .maybeSingle()

      setDirectionName(directionData?.name ?? null)
    }

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", currentSchoolId)

    if (classesError) {
      console.error("Erreur classes :", classesError)
      dashboardErrors.push("le nombre de classes")

      setClassCount(null)
      setStudentCount(null)
      setTeacherCount(null)
      setAttendanceCount(null)
      return
    }

    const classIds = (classesData ?? []).map((item) => item.id)

    setClassCount(classIds.length)

    if (classIds.length === 0) {
      setStudentCount(0)
      setTeacherCount(0)
      setAttendanceCount(0)
      return
    }

    const [
      enrollmentsResult,
      classSubjectsResult,
      headTeachersResult,
      attendanceResult,
    ] = await Promise.all([
        supabase
          .from("student_class_enrollments")
          .select("student_id")
          .eq("school_id", currentSchoolId)
          .in("class_id", classIds),

        supabase
          .from("class_subjects")
          .select("teacher_id")
          .eq("school_id", currentSchoolId)
          .in("class_id", classIds),

        /*
         * Les titulaires comptent aussi. Au premier cycle, l'enseignant
         * est rattaché à la CLASSE, pas aux matières : ne lire que
         * class_subjects afficherait « 0 enseignant » pour une classe
         * pourtant tenue.
         */
        supabase
          .from("class_head_teachers")
          .select("teacher_id")
          .eq("school_id", currentSchoolId)
          .in("class_id", classIds),

        supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .eq("school_id", currentSchoolId)
          .eq("attendance_date", today)
          .in("class_id", classIds),
      ])

    if (enrollmentsResult.error) {
      console.error("Erreur élèves :", enrollmentsResult.error)
      dashboardErrors.push("le nombre d'élèves")
      setStudentCount(null)
    } else {
      // Un élève inscrit dans plusieurs classes ne doit être compté qu'une fois.
      const uniqueStudents = new Set(
        (enrollmentsResult.data ?? []).map((item) => item.student_id)
      )

      setStudentCount(uniqueStudents.size)
    }

    if (classSubjectsResult.error || headTeachersResult.error) {
      console.error(
        "Erreur enseignants :",
        classSubjectsResult.error ?? headTeachersResult.error
      )
      dashboardErrors.push("le nombre d'enseignants")
      setTeacherCount(null)
    } else {
      // Un titulaire également affecté à ses matières ne compte qu'une fois.
      const uniqueTeachers = new Set(
        [
          ...(classSubjectsResult.data ?? []),
          ...(headTeachersResult.data ?? []),
        ]
          .map((item) => item.teacher_id)
          .filter(Boolean)
      )

      setTeacherCount(uniqueTeachers.size)
    }

    if (attendanceResult.error) {
      console.error("Erreur présences :", attendanceResult.error)
      dashboardErrors.push("le nombre de présences")
      setAttendanceCount(null)
    } else {
      setAttendanceCount(attendanceResult.count ?? 0)
    }
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
        // Pas de repli implicite : un rôle inconnu ou absent n'ouvre rien.
        item.roles.includes(profile?.role ?? "")
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
                ? { background: "oklch(0.585 0.16 38)" }
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
              style={{ background: "oklch(0.585 0.16 38)" }}
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

          {/*
            Le tiroir est figé à la hauteur de l'écran, alors qu'un
            administrateur y a dix-huit entrées — plus haut que bien des
            téléphones. Le menu doit donc défiler par lui-même, sinon la
            déconnexion passe sous le bord sans aucun moyen d'y accéder.
          */}
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col p-4 shadow-xl"
            style={{ background: "oklch(0.24 0.02 60)" }}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between px-1">
              <Logo size="sm" dark />

              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fermer le menu"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/*
              min-h-0 est indispensable : sans lui un enfant flexible refuse
              de descendre sous la hauteur de son contenu, et le défilement
              n'a jamais lieu.
            */}
            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {renderNavItems(() => setMobileMenuOpen(false))}
            </nav>

            {/* shrink-0 : la déconnexion reste posée au bas du tiroir. */}
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                handleLogout()
              }}
              className="mt-4 w-full shrink-0 rounded-lg border border-white/15 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              Déconnexion
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-81px)]">
        {/*
          Même écueil sur ordinateur : la barre s'étirait sur toute la
          hauteur de la page, si bien qu'il fallait dérouler tout le contenu
          pour atteindre la déconnexion — et sur un écran d'ordinateur
          portable, les dix-huit entrées débordaient déjà.

          Le bloc intérieur reste collé et ne dépasse jamais la hauteur de
          l'écran : le menu défile en lui-même, la déconnexion reste posée
          en dessous.

          Les 7rem retranchées couvrent l'en-tête plus le décalage du bloc
          collé. Sans cette marge, la déconnexion reste sous le bord tant
          qu'on n'a pas fait défiler la page — récupérable, mais on ne la
          voit pas en arrivant, ce qui est précisément le défaut corrigé.
        */}
        <aside
          className="hidden w-64 shrink-0 p-4 md:block"
          style={{ background: "oklch(0.24 0.02 60)" }}
        >
          <div className="sticky top-4 flex max-h-[calc(100vh-7rem)] flex-col">
            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {renderNavItems(() => {})}
            </nav>

            <button
              onClick={handleLogout}
              className="mt-4 w-full shrink-0 rounded-lg border border-white/15 px-4 py-3 text-left text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              Déconnexion
            </button>
          </div>
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

              {/*
                La pastille ne sert plus qu'à annoncer un périmètre
                existant. Le cas « aucune direction » passe par un vrai
                avertissement, plus bas : une pastille de trois mots
                n'expliquait ni pourquoi tout est vide, ni à qui
                s'adresser.
              */}
              {profile?.role === "directeur_direction" && directionName && (
                <p
                  className="mt-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    color: "oklch(0.585 0.16 38)",
                    borderColor: "oklch(0.585 0.16 38)",
                  }}
                >
                  Périmètre : {directionName}
                </p>
              )}
            </div>

            <AvertissementDirection />

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
                  style={{ background: "oklch(0.585 0.16 38 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-sm"
                    style={{ background: "oklch(0.585 0.16 38)" }}
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
                  style={{ background: "oklch(0.55 0.13 155 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ background: "oklch(0.55 0.13 155)" }}
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
                  style={{ background: "oklch(0.80 0.14 78 / 0.18)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[3px]"
                    style={{ background: "oklch(0.57 0.14 78)" }}
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
                  style={{ background: "oklch(0.585 0.16 38 / 0.12)" }}
                >
                  <div
                    className="h-4 w-4 rounded-[50%_50%_50%_0]"
                    style={{ background: "oklch(0.585 0.16 38)" }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Présences aujourd&apos;hui
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