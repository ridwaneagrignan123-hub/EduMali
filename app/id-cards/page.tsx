"use client"

import { ChangeEvent, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

/*
 * Cartes scolaires : cartes d'identité des élèves, au format carte
 * bancaire, imprimables par classe entière ou une par une.
 *
 * L'impression reprend le mécanisme éprouvé de app/report-card : on
 * imprime la page elle-même via @media print, en masquant tout ce qui ne
 * doit pas sortir. Pas de window.open ni d'innerHTML — cette page-là est
 * la référence qui fonctionne dans ce projet.
 */

type ClassItem = {
  id: string
  name: string
}

type Student = {
  id: string
  first_name: string
  last_name: string
  student_number: string | null
  photo_url: string | null
}

type School = {
  name: string | null
  logo_url: string | null
}

// Format carte bancaire ISO/IEC 7810 ID-1.
const CARD_WIDTH_MM = 85.6
const CARD_HEIGHT_MM = 54

const ACCEPTED_TYPES = ["image/jpeg", "image/png"]

// Au-delà, on refuse avant même de lire le fichier.
const MAX_FILE_BYTES = 5 * 1024 * 1024

// Côté du carré produit par le recadrage, en pixels.
const CROP_SIZE = 512

/*
 * Recadre l'image en carré centré et la ré-encode en JPEG.
 *
 * Deux raisons de le faire ici plutôt que d'envoyer le fichier brut : la
 * carte réserve un emplacement carré, et une photo prise au téléphone
 * pèse volontiers plusieurs mégaoctets pour un rendu de 2 cm de côté.
 */
function cropToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)

      const side = Math.min(image.width, image.height)
      const canvas = document.createElement("canvas")
      canvas.width = CROP_SIZE
      canvas.height = CROP_SIZE

      const context = canvas.getContext("2d")

      if (!context) {
        reject(new Error("Le navigateur n'a pas pu préparer l'image."))
        return
      }

      context.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        CROP_SIZE,
        CROP_SIZE
      )

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error("Le recadrage de l'image a échoué."))
          }
        },
        "image/jpeg",
        0.9
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Ce fichier n'est pas une image lisible."))
    }

    image.src = url
  })
}

export default function IdCardsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")
  const [school, setSchool] = useState<School | null>(null)
  const [academicYearName, setAcademicYearName] = useState("")
  const [academicYearId, setAcademicYearId] = useState("")

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState("")
  const [students, setStudents] = useState<Student[]>([])

  // Élève dont on remplace la photo ; null quand aucune sélection.
  const [photoStudent, setPhotoStudent] = useState<Student | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [uploading, setUploading] = useState(false)

  /*
   * "all" = imprimer toute la classe, un identifiant = une seule carte,
   * null = aucune impression en cours. Même convention que les bulletins.
   */
  const [printTarget, setPrintTarget] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (printTarget === null) {
      return
    }

    const timer = setTimeout(() => {
      window.print()
    }, 100)

    return () => clearTimeout(timer)
  }, [printTarget])

  useEffect(() => {
    function handleAfterPrint() {
      setPrintTarget(null)
    }

    window.addEventListener("afterprint", handleAfterPrint)

    return () => window.removeEventListener("afterprint", handleAfterPrint)
  }, [])

  /*
   * L'aperçu est un objet URL : il faut le libérer, sinon le blob reste
   * en mémoire jusqu'au rechargement de la page.
   *
   * Le nettoyage de cet effet s'exécute avec l'ANCIENNE valeur avant
   * chaque nouvel aperçu, et au démontage. C'est le seul endroit qui
   * révoque : le faire aussi dans les gestionnaires reviendrait à glisser
   * un effet de bord dans un updater de state, que React exécute deux
   * fois en mode strict.
   */
  useEffect(() => {
    if (!preview) {
      return
    }

    return () => URL.revokeObjectURL(preview)
  }, [preview])

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

    const currentSchoolId = profile.school_id
    setSchoolId(currentSchoolId)

    const [schoolResult, yearResult, classesResult] = await Promise.all([
      supabase
        .from("schools")
        .select("name, logo_url")
        .eq("id", currentSchoolId)
        .maybeSingle(),

      supabase
        .from("academic_years")
        .select("id, name")
        .eq("school_id", currentSchoolId)
        .eq("is_active", true)
        .maybeSingle(),

      supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", currentSchoolId)
        .order("name"),
    ])

    const errors: string[] = []

    if (schoolResult.error) {
      console.error("Erreur école :", schoolResult.error)
      errors.push("les informations de l'établissement")
    } else {
      setSchool(schoolResult.data as School)
    }

    if (yearResult.error) {
      console.error("Erreur année scolaire :", yearResult.error)
      errors.push("l'année scolaire active")
    } else {
      setAcademicYearName(yearResult.data?.name ?? "")
      setAcademicYearId(yearResult.data?.id ?? "")
    }

    if (classesResult.error) {
      console.error("Erreur classes :", classesResult.error)
      errors.push("la liste des classes")
    } else {
      setClasses((classesResult.data as ClassItem[]) ?? [])
    }

    if (errors.length > 0) {
      setLoadError(
        `Certaines données n'ont pas pu être chargées (${errors.join(", ")}). Rechargez la page.`
      )
    }

    setLoading(false)
  }

  async function loadStudents(classId: string, yearId: string) {
    setSelectedClassId(classId)
    setActionError(null)
    setActionMessage(null)
    closePhotoDialog()

    if (!classId) {
      setStudents([])
      return
    }

    if (!yearId) {
      setStudents([])
      setActionError(
        "Aucune année scolaire active : impossible de lister les élèves inscrits."
      )
      return
    }

    setLoadingStudents(true)

    const { data, error } = await supabase
      .from("student_class_enrollments")
      .select(
        `
        student_id,
        students ( id, first_name, last_name, student_number, photo_url )
      `
      )
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("academic_year_id", yearId)

    if (error) {
      console.error("Erreur inscriptions :", error)
      setActionError("Impossible de charger les élèves de cette classe.")
      setStudents([])
      setLoadingStudents(false)
      return
    }

    const loaded: Student[] = (data ?? [])
      .map((row) => (row as unknown as { students: Student }).students)
      .filter(Boolean)
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(
          `${b.last_name} ${b.first_name}`,
          "fr"
        )
      )

    setStudents(loaded)
    setLoadingStudents(false)
  }

  function closePhotoDialog() {
    setPhotoStudent(null)
    setPendingBlob(null)
    setPreview(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    setActionError(null)
    setActionMessage(null)

    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setActionError(
        "Format non accepté : utilisez une image JPEG ou PNG."
      )
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setActionError(
        `Image trop lourde (${Math.round(file.size / 1024 / 1024)} Mo). Maximum 5 Mo.`
      )
      return
    }

    try {
      const blob = await cropToSquare(file)

      setPendingBlob(blob)
      setPreview(URL.createObjectURL(blob))
    } catch (error) {
      console.error("Erreur de préparation de l'image :", error)
      setActionError(
        error instanceof Error
          ? error.message
          : "Cette image n'a pas pu être préparée."
      )
    }
  }

  async function uploadPhoto() {
    if (!photoStudent || !pendingBlob) {
      return
    }

    setUploading(true)
    setActionError(null)
    setActionMessage(null)

    /*
     * Le chemin doit commencer par le school_id : les policies du bucket
     * comparent ce premier segment au school_id de l'appelant. Écrire
     * ailleurs est refusé par Postgres, pas seulement par convention.
     */
    const path = `${schoolId}/${photoStudent.id}.jpg`

    const { error: uploadError } = await supabase.storage
      .from("student-photos")
      .upload(path, pendingBlob, {
        contentType: "image/jpeg",
        upsert: true,
      })

    if (uploadError) {
      console.error("Erreur envoi de la photo :", uploadError)
      setActionError(
        `L'envoi de la photo a échoué : ${uploadError.message}`
      )
      setUploading(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("student-photos").getPublicUrl(path)

    /*
     * Le paramètre de version force le navigateur à recharger l'image :
     * le chemin ne changeant jamais pour un même élève, l'ancienne photo
     * resterait affichée depuis le cache.
     */
    const versionedUrl = `${publicUrl}?v=${Date.now()}`

    const { error: updateError } = await supabase
      .from("students")
      .update({ photo_url: versionedUrl })
      .eq("id", photoStudent.id)
      .eq("school_id", schoolId)

    if (updateError) {
      console.error("Erreur mise à jour de la fiche :", updateError)
      setActionError(
        "La photo a été envoyée, mais la fiche de l'élève n'a pas pu être mise à jour. Réessayez."
      )
      setUploading(false)
      return
    }

    setStudents((current) =>
      current.map((student) =>
        student.id === photoStudent.id
          ? { ...student, photo_url: versionedUrl }
          : student
      )
    )

    setActionMessage(
      `Photo de ${photoStudent.last_name} ${photoStudent.first_name} enregistrée.`
    )

    setUploading(false)
    closePhotoDialog()
  }

  const selectedClass = classes.find((item) => item.id === selectedClassId)

  function renderCard(student: Student) {
    const excluded =
      printTarget !== null &&
      printTarget !== "all" &&
      printTarget !== student.id

    return (
      <div
        key={student.id}
        className={`id-card ${excluded ? "print-exclude" : ""}`}
        style={{
          width: `${CARD_WIDTH_MM}mm`,
          height: `${CARD_HEIGHT_MM}mm`,
          border: "1px dashed oklch(0.45 0.02 60 / 0.6)",
          borderRadius: "3mm",
          padding: "3mm",
          display: "flex",
          flexDirection: "column",
          gap: "2mm",
          background: "white",
          color: "oklch(0.20 0.02 60)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2mm",
            borderBottom: "0.4mm solid oklch(0.585 0.16 38)",
            paddingBottom: "1.5mm",
          }}
        >
          {school?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={school.logo_url}
              alt=""
              style={{
                width: "7mm",
                height: "7mm",
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: "7mm",
                height: "7mm",
                borderRadius: "1mm",
                background: "oklch(0.585 0.16 38 / 0.12)",
                flexShrink: 0,
              }}
            />
          )}

          <div style={{ minWidth: 0 }}>
            <p
              className="font-heading"
              style={{
                fontSize: "3mm",
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.15,
                textTransform: "uppercase",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {school?.name || "Établissement scolaire"}
            </p>

            <p
              style={{
                fontSize: "2.2mm",
                margin: 0,
                color: "oklch(0.45 0.02 60)",
              }}
            >
              Carte scolaire · {academicYearName || "—"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "3mm", flex: 1, minHeight: 0 }}>
          {student.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.photo_url}
              alt=""
              style={{
                width: "20mm",
                height: "25mm",
                objectFit: "cover",
                borderRadius: "1.5mm",
                border: "0.3mm solid oklch(0.20 0.02 60 / 0.15)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: "20mm",
                height: "25mm",
                borderRadius: "1.5mm",
                border: "0.3mm dashed oklch(0.20 0.02 60 / 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2.2mm",
                color: "oklch(0.45 0.02 60)",
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              Sans photo
            </div>
          )}

          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1.4mm" }}>
            <div>
              <p
                style={{
                  fontSize: "2.1mm",
                  margin: 0,
                  color: "oklch(0.45 0.02 60)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Nom et prénom
              </p>

              <p
                className="font-heading"
                style={{
                  fontSize: "3.4mm",
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {student.last_name} {student.first_name}
              </p>
            </div>

            <div>
              <p
                style={{
                  fontSize: "2.1mm",
                  margin: 0,
                  color: "oklch(0.45 0.02 60)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Classe
              </p>

              <p style={{ fontSize: "2.9mm", fontWeight: 600, margin: 0 }}>
                {selectedClass?.name ?? "—"}
              </p>
            </div>

            <div>
              <p
                style={{
                  fontSize: "2.1mm",
                  margin: 0,
                  color: "oklch(0.45 0.02 60)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Matricule
              </p>

              <p style={{ fontSize: "2.9mm", fontWeight: 600, margin: 0 }}>
                {student.student_number || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement des cartes...</p>
      </main>
    )
  }

  return (
    <main className="id-card-main min-h-screen bg-muted/30">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-exclude { display: none !important; }

          /* Aucune carte ne doit être coupée entre deux pages. */
          .id-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Deux cartes par rangée, quel que soit l'affichage à l'écran. */
          .id-card-sheet {
            display: grid !important;
            grid-template-columns: repeat(2, auto) !important;
            justify-content: center !important;
            gap: 6mm !important;
          }

          /*
           * Le papier n'a pas besoin des marges ni du fond de l'écran :
           * sans ça, la première rangée descend d'un centimètre et une
           * rangée peut basculer sur une page de plus.
           */
          .id-card-page {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }
          .id-card-main {
            background: white !important;
            min-height: 0 !important;
          }

          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      <header className="border-b bg-background print-hidden">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Ridwane</h1>

            <p className="text-sm text-muted-foreground">Cartes scolaires</p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="id-card-page mx-auto max-w-6xl space-y-8 p-6">
        <div className="print-hidden">
          <h2 className="text-3xl font-bold">Cartes scolaires</h2>

          <p className="mt-2 text-muted-foreground">
            Ajoutez la photo de chaque élève, puis imprimez les cartes au
            format carte bancaire — une par une ou pour toute la classe.
          </p>
        </div>

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive print-hidden">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border bg-background p-6 print-hidden">
          <label htmlFor="class" className="mb-2 block font-medium">
            Classe
          </label>

          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune classe n&apos;a encore été créée.{" "}
              <button
                onClick={() => router.push("/classes")}
                className="font-medium text-primary underline"
              >
                Créer une classe
              </button>
            </p>
          ) : (
            <select
              id="class"
              value={selectedClassId}
              onChange={(event) =>
                loadStudents(event.target.value, academicYearId)
              }
              className="w-full rounded-md border bg-background px-3 py-3 md:max-w-md"
            >
              <option value="">Sélectionner une classe</option>

              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
          )}

          {!academicYearId && (
            <p
              className="mt-3 text-sm"
              style={{ color: "oklch(0.57 0.14 78)" }}
            >
              Aucune année scolaire active : les inscriptions ne peuvent pas
              être lues.
            </p>
          )}
        </div>

        {actionError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive print-hidden">
            {actionError}
          </div>
        )}

        {actionMessage && (
          <div
            className="rounded-lg border p-4 text-sm print-hidden"
            style={{
              background: "oklch(0.55 0.13 155 / 0.1)",
              borderColor: "oklch(0.55 0.13 155 / 0.4)",
            }}
          >
            {actionMessage}
          </div>
        )}

        {photoStudent && (
          <div className="rounded-xl border bg-background p-6 print-hidden">
            <h3 className="font-heading text-xl font-bold">
              Photo de {photoStudent.last_name} {photoStudent.first_name}
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              L&apos;image est recadrée en carré autour de son centre, puis
              réduite avant l&apos;envoi.
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label htmlFor="photo-file" className="font-medium">
                  Fichier JPEG ou PNG
                </label>

                <input
                  id="photo-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileChosen}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              {preview && (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Aperçu de la photo recadrée"
                    className="rounded-lg border"
                    style={{ width: 120, height: 120, objectFit: "cover" }}
                  />

                  <p className="text-sm text-muted-foreground">
                    Aperçu après recadrage. C&apos;est cette image qui sera
                    envoyée.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={uploadPhoto}
                  disabled={!pendingBlob || uploading}
                  className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? "Envoi..." : "Enregistrer la photo"}
                </button>

                <button
                  onClick={closePhotoDialog}
                  disabled={uploading}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedClassId && (
          <div className="rounded-xl border bg-background p-6 print-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {selectedClass?.name ?? "—"}
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {students.length} élève(s) inscrit(s)
                  {academicYearName ? ` en ${academicYearName}` : ""}
                </p>
              </div>

              <button
                onClick={() => setPrintTarget("all")}
                disabled={students.length === 0}
                className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                🖨️ Imprimer toute la classe
              </button>
            </div>

            <div className="mt-6 overflow-x-auto">
              {loadingStudents ? (
                <p className="text-muted-foreground">Chargement des élèves...</p>
              ) : students.length === 0 ? (
                <p className="text-muted-foreground">
                  Aucun élève inscrit dans cette classe pour l&apos;année
                  active.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3">Photo</th>
                      <th className="px-4 py-3">Nom</th>
                      <th className="px-4 py-3">Prénom</th>
                      <th className="px-4 py-3">Matricule</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          {student.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={student.photo_url}
                              alt=""
                              className="rounded-md border"
                              style={{
                                width: 44,
                                height: 44,
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
                              style={{ width: 44, height: 44 }}
                            >
                              —
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-medium">
                          {student.last_name}
                        </td>

                        <td className="px-4 py-3">{student.first_name}</td>

                        <td className="px-4 py-3">
                          {student.student_number || "—"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                closePhotoDialog()
                                setPhotoStudent(student)
                              }}
                              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                            >
                              Changer la photo
                            </button>

                            <button
                              onClick={() => setPrintTarget(student.id)}
                              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                            >
                              Imprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/*
          Les cartes restent dans le flux de la page : c'est ce qui permet
          d'imprimer sans fenêtre séparée. Hors impression elles servent
          d'aperçu ; à l'impression, print-exclude retire celles qui ne
          sont pas visées.
        */}
        {selectedClassId && students.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-heading text-xl font-bold print-hidden">
              Aperçu des cartes
            </h3>

            <div
              className="id-card-sheet"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(85.6mm, auto))",
                gap: "6mm",
                justifyContent: "start",
              }}
            >
              {students.map(renderCard)}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
