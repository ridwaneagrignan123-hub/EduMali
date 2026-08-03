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
  date_of_birth: string | null
  gender: string | null
  address: string | null
  parent_name: string | null
  parent_phone: string | null
}

type School = {
  name: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
}

type CardFormat = {
  id: string
  label: string
  /** Millimètres. */
  width: number
  height: number
  portrait: boolean
  photoWidth: number
  photoHeight: number
  /*
   * Multiplicateur de taille de texte. Les tailles de base sont réglées
   * pour la carte bancaire ; les autres formats les suivent.
   */
  scale: number
  /** Nombre de cartes par rangée à l'impression sur A4. */
  columns: number
}

/*
 * Trois formats, choisis pour tenir sur une A4 en marges de 10 mm, soit
 * 190 mm utiles :
 *   85,6 × 2 = 171 mm   |   54 × 3 = 162 mm   |   90 × 2 = 180 mm
 */
const FORMATS: CardFormat[] = [
  {
    id: "cb",
    label: "Carte bancaire — 85,6 × 54 mm",
    width: 85.6,
    height: 54,
    portrait: false,
    photoWidth: 19,
    photoHeight: 24,
    scale: 1,
    columns: 2,
  },
  {
    id: "badge",
    label: "Badge portrait — 54 × 85,6 mm",
    width: 54,
    height: 85.6,
    portrait: true,
    photoWidth: 26,
    photoHeight: 32,
    scale: 1,
    columns: 3,
  },
  {
    id: "grand",
    label: "Grand format — 90 × 62 mm",
    width: 90,
    height: 62,
    portrait: false,
    photoWidth: 22,
    photoHeight: 28,
    scale: 1.18,
    columns: 2,
  },
]

// Format retenu par défaut : celui qui tient dans un portefeuille.
const DEFAULT_FORMAT_ID = "cb"

function formatBirthDate(value: string | null) {
  if (!value) {
    return "—"
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function formatGender(value: string | null) {
  if (value === "M") {
    return "Masculin"
  }

  if (value === "F") {
    return "Féminin"
  }

  return "—"
}

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

  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID)
  const [withBack, setWithBack] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const format =
    FORMATS.find((item) => item.id === formatId) ?? FORMATS[0]

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
        .select("name, logo_url, address, phone")
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
        students (
          id, first_name, last_name, student_number, photo_url,
          date_of_birth, gender, address, parent_name, parent_phone
        )
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

  /*
   * Une carte, recto ou verso.
   *
   * Toutes les tailles sont en millimètres et proportionnelles au format
   * choisi : c'est ce qui permet aux trois formats de partager une seule
   * mise en page au lieu d'en maintenir trois.
   */
  function renderCard(student: Student, side: "front" | "back") {
    const excluded =
      printTarget !== null &&
      printTarget !== "all" &&
      printTarget !== student.id

    const mm = (value: number) => `${(value * format.scale).toFixed(2)}mm`

    const cardStyle: React.CSSProperties = {
      width: `${format.width}mm`,
      height: `${format.height}mm`,
      border: "1px dashed oklch(0.45 0.02 60 / 0.6)",
      borderRadius: "3mm",
      padding: mm(2.6),
      display: "flex",
      flexDirection: "column",
      gap: mm(1.6),
      background: "white",
      color: "oklch(0.20 0.02 60)",
      overflow: "hidden",
    }

    const labelStyle: React.CSSProperties = {
      fontSize: mm(1.9),
      margin: 0,
      color: "oklch(0.45 0.02 60)",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1.25,
    }

    const valueStyle: React.CSSProperties = {
      fontSize: mm(2.5),
      fontWeight: 600,
      margin: 0,
      lineHeight: 1.25,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }

    function field(label: string, value: string) {
      return (
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>{label}</p>
          <p style={valueStyle}>{value}</p>
        </div>
      )
    }

    const header = (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: mm(1.8),
          borderBottom: `0.4mm solid oklch(0.585 0.16 38)`,
          paddingBottom: mm(1.3),
          flexShrink: 0,
        }}
      >
        {school?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={school.logo_url}
            alt=""
            style={{
              width: mm(6.5),
              height: mm(6.5),
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: mm(6.5),
              height: mm(6.5),
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
              fontSize: mm(2.7),
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

          <p style={{ ...labelStyle, textTransform: "none" }}>
            {side === "front" ? "Carte scolaire" : "Informations"} ·{" "}
            {academicYearName || "—"}
          </p>
        </div>
      </div>
    )

    if (side === "back") {
      return (
        <div
          key={`${student.id}-back`}
          className={`id-card ${excluded ? "print-exclude" : ""}`}
          style={cardStyle}
        >
          {header}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: mm(1.5),
            }}
          >
            {field("Adresse", student.address || "—")}
            {field("Parent / tuteur", student.parent_name || "—")}
            {field("Téléphone du parent", student.parent_phone || "—")}

            <div
              style={{
                marginTop: "auto",
                borderTop: "0.3mm solid oklch(0.20 0.02 60 / 0.15)",
                paddingTop: mm(1.3),
              }}
            >
              <p style={{ ...labelStyle, textTransform: "none" }}>
                En cas de perte, contacter l&apos;établissement
                {school?.phone ? ` au ${school.phone}` : ""}.
              </p>

              {school?.address && (
                <p style={{ ...labelStyle, textTransform: "none" }}>
                  {school.address}
                </p>
              )}
            </div>
          </div>
        </div>
      )
    }

    const photo = student.photo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={student.photo_url}
        alt=""
        style={{
          width: mm(format.photoWidth),
          height: mm(format.photoHeight),
          objectFit: "cover",
          borderRadius: "1.5mm",
          border: "0.3mm solid oklch(0.20 0.02 60 / 0.15)",
          flexShrink: 0,
        }}
      />
    ) : (
      <div
        style={{
          width: mm(format.photoWidth),
          height: mm(format.photoHeight),
          borderRadius: "1.5mm",
          border: "0.3mm dashed oklch(0.20 0.02 60 / 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: mm(1.9),
          color: "oklch(0.45 0.02 60)",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        Sans photo
      </div>
    )

    const identity = (
      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: mm(1.2),
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Nom et prénom</p>

          <p
            className="font-heading"
            style={{
              fontSize: mm(3.1),
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {student.last_name} {student.first_name}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: format.portrait ? "1fr" : "1fr 1fr",
            gap: mm(1.2),
          }}
        >
          {field("Classe", selectedClass?.name ?? "—")}
          {field("Matricule", student.student_number || "—")}
          {field("Né(e) le", formatBirthDate(student.date_of_birth))}
          {field("Sexe", formatGender(student.gender))}
        </div>
      </div>
    )

    return (
      <div
        key={student.id}
        className={`id-card ${excluded ? "print-exclude" : ""}`}
        style={cardStyle}
      >
        {header}

        <div
          style={{
            display: "flex",
            flexDirection: format.portrait ? "column" : "row",
            alignItems: format.portrait ? "center" : "flex-start",
            gap: mm(2.4),
            flex: 1,
            minHeight: 0,
          }}
        >
          {photo}
          {identity}
        </div>

        {/*
          Le contact du parent tient sur le recto : c'est l'information
          qui sert vraiment si l'on retrouve un enfant avec sa carte.
        */}
        {!format.portrait && student.parent_phone && (
          <div
            style={{
              borderTop: "0.3mm solid oklch(0.20 0.02 60 / 0.15)",
              paddingTop: mm(1),
              flexShrink: 0,
            }}
          >
            <p
              style={{
                ...labelStyle,
                textTransform: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Parent : {student.parent_name || "—"} · {student.parent_phone}
            </p>
          </div>
        )}
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

          /*
           * Nombre de cartes par rangée propre au format choisi, calculé
           * pour tenir dans les 190 mm utiles d'une A4 en marges de 10 mm.
           */
          .id-card-sheet {
            display: grid !important;
            grid-template-columns: repeat(${format.columns}, auto) !important;
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

          /* Les versos commencent toujours sur une page neuve. */
          .id-card-back-sheet {
            break-before: page;
            page-break-before: always;
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

          <div className="mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
            <div>
              <label htmlFor="format" className="mb-2 block font-medium">
                Format de carte
              </label>

              <select
                id="format"
                value={formatId}
                onChange={(event) => setFormatId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-3"
              >
                {FORMATS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>

              <p className="mt-2 text-xs text-muted-foreground">
                {format.columns} carte(s) par rangée sur une page A4.
              </p>
            </div>

            <div>
              <span className="mb-2 block font-medium">Verso</span>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withBack}
                  onChange={(event) => setWithBack(event.target.checked)}
                  className="mt-1"
                />

                <span>
                  Imprimer aussi le verso (adresse, parent, contact de
                  l&apos;école)
                </span>
              </label>

              {withBack && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Les versos sortent sur une page distincte, après les rectos.
                  Réintroduisez les feuilles dans l&apos;imprimante pour les
                  imprimer au dos.
                </p>
              )}
            </div>
          </div>
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
                <table className="w-full text-start text-sm">
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
              Aperçu des cartes — recto
            </h3>

            <div
              className="id-card-sheet"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${format.width}mm, auto))`,
                gap: "6mm",
                justifyContent: "start",
              }}
            >
              {students.map((student) => renderCard(student, "front"))}
            </div>

            {/*
              Les versos partent sur une nouvelle page : imprimés à la
              suite des rectos, ils ne correspondraient à aucune carte.
            */}
            {withBack && (
              <div className="id-card-back-sheet space-y-4">
                <h3 className="font-heading text-xl font-bold print-hidden">
                  Aperçu des cartes — verso
                </h3>

                <div
                  className="id-card-sheet"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fill, minmax(${format.width}mm, auto))`,
                    gap: "6mm",
                    justifyContent: "start",
                  }}
                >
                  {students.map((student) => renderCard(student, "back"))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
