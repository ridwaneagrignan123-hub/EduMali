"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { can } from "@/src/lib/roles"
import { matchesSearch, normalizeSearchText } from "@/src/lib/search"
import { parseSpreadsheetDate } from "@/src/lib/excel"
import { EditDialog } from "@/components/edit-dialog"
import { AvertissementDirection } from "@/components/avertissement-direction"
import { reprocheNumeroParent } from "@/src/lib/contact-parent"
import { formaterNom, formaterPrenom } from "@/src/lib/noms"
import {
  ImportOutcome,
  ImportRow,
  ImportWizard,
  RawRow,
} from "@/components/import/import-wizard"

type ClassItem = {
  id: string
  name: string
  level: string | null
}

type Enrollment = {
  student_id: string
  academic_year_id: string
  classes: {
    id: string
    name: string
  } | null
}

type Student = {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  student_number: string | null
  address: string | null
  parent_name: string | null
  parent_phone: string | null
}

// Libellé du groupe pour les élèves sans inscription en classe.
const UNASSIGNED_CLASS_LABEL = "Sans classe"

/*
 * Informations personnelles modifiables après l'enregistrement.
 * La classe n'en fait pas partie : elle relève de l'inscription
 * (student_class_enrollments), pas de la fiche de l'élève.
 */
type StudentEditForm = {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  studentNumber: string
  address: string
  parentName: string
  parentPhone: string
}

function toEditForm(student: Student): StudentEditForm {
  return {
    firstName: student.first_name,
    lastName: student.last_name,
    dateOfBirth: student.date_of_birth ?? "",
    gender: student.gender ?? "",
    studentNumber: student.student_number ?? "",
    address: student.address ?? "",
    parentName: student.parent_name ?? "",
    parentPhone: student.parent_phone ?? "",
  }
}

/*
 * Champs acceptés à l'import. L'ordre des colonnes du fichier n'a aucune
 * importance : c'est l'utilisateur qui fait la correspondance.
 */
const STUDENT_IMPORT_FIELDS = [
  {
    key: "last_name",
    label: "Nom",
    required: true,
    aliases: ["nom eleve", "nom de l'eleve", "nom élève"],
  },
  {
    key: "first_name",
    label: "Prénom",
    required: true,
    aliases: ["prenom", "prenom eleve"],
  },
  {
    key: "class_name",
    label: "Classe",
    required: true,
    hint: "Doit correspondre au nom exact d'une classe existante.",
    aliases: ["nom de la classe", "niveau"],
  },
  {
    key: "student_number",
    label: "Numéro d'inscription",
    aliases: ["matricule", "numero", "n°"],
  },
  {
    key: "gender",
    label: "Sexe",
    hint: "M / F, masculin / féminin, garçon / fille.",
    aliases: ["genre"],
  },
  {
    key: "date_of_birth",
    label: "Date de naissance",
    hint: "Format AAAA-MM-JJ ou JJ/MM/AAAA.",
    aliases: ["naissance", "ne le", "date naissance"],
  },
  { key: "parent_name", label: "Parent / tuteur", aliases: ["parent", "tuteur"] },
  {
    key: "parent_phone",
    label: "Téléphone du parent",
    aliases: ["telephone", "tel", "contact"],
  },
  { key: "address", label: "Adresse", aliases: ["adresse eleve"] },
]

/*
 * Normalise le sexe. Renvoie undefined si la valeur n'est pas reconnue :
 * on préfère signaler la ligne plutôt qu'enregistrer null en silence.
 */
function parseGender(value: string) {
  const normalized = normalizeSearchText(value)

  if (!normalized) {
    return null
  }

  if (["m", "masculin", "garcon", "homme", "h"].includes(normalized)) {
    return "M"
  }

  if (["f", "feminin", "fille", "femme"].includes(normalized)) {
    return "F"
  }

  return undefined
}


export default function StudentsPage() {
  const router = useRouter()

  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showImport, setShowImport] = useState(false)

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState("")

  /* Role de la personne connectee, pour ne pas proposer ce que le RLS refuse. */
  const [role, setRole] = useState("")
  const peutGererLesEleves = can(role, "eleves.gerer")
  const [activeAcademicYearId, setActiveAcademicYearId] = useState("")
  const [selectedClassId, setSelectedClassId] = useState("")

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [gender, setGender] = useState("")
  const [studentNumber, setStudentNumber] = useState("")
  const [address, setAddress] = useState("")
  const [parentName, setParentName] = useState("")
  const [parentPhone, setParentPhone] = useState("")

  // Élève en cours de modification, null quand la boîte est fermée.
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState<StudentEditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile?.school_id) {
      router.push("/setup-school")
      return
    }

    setSchoolId(profile.school_id)
    setRole(profile.role ?? "")

    const { data: academicYearData, error: academicYearError } =
      await supabase
        .from("academic_years")
        .select("id")
        .eq("school_id", profile.school_id)
        .eq("is_active", true)
        .maybeSingle()

    if (academicYearError) {
      console.error(
        "Erreur lors du chargement de l'année scolaire active :",
        academicYearError
      )
      setLoadError(
        "Impossible de vérifier l'année scolaire active."
      )
    }

    setActiveAcademicYearId(academicYearData?.id ?? "")

    const { data: classesData, error: classesError } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("school_id", profile.school_id)
      .order("name", { ascending: true })

    if (classesError) {
      console.error("Erreur lors du chargement des classes :", classesError)
      setLoadError("Impossible de charger la liste des classes.")
    }

    setClasses(classesData ?? [])

    /*
     * ON CHARGE TOUS LES ÉLÈVES, PAR TRANCHES.
     *
     * La recherche filtre les données déjà en mémoire — c'est ce qui la
     * rend instantanée, et c'est aussi ce dont la page a besoin par
     * ailleurs : elle regroupe l'effectif par classe et en compte les
     * têtes. Mais PostgREST plafonne une réponse à mille lignes par
     * défaut : sur une école bien fournie, l'élève numéro 1001 ne serait
     * jamais chargé, donc introuvable même avec une recherche correcte —
     * et l'écran n'en dirait rien.
     *
     * On demande donc les tranches jusqu'à ce que le serveur en rende
     * une incomplète, signe qu'on a tout. Plutôt qu'une recherche côté
     * serveur : celle-ci imposerait un aller-retour par frappe, et
     * laisserait de toute façon le regroupement par classe incomplet.
     */
    const TAILLE_TRANCHE = 1000
    const tousLesEleves: Student[] = []
    let studentsError = null

    for (let debut = 0; ; debut += TAILLE_TRANCHE) {
      const { data: tranche, error } = await supabase
        .from("students")
        .select(
          "id, first_name, last_name, date_of_birth, gender, student_number, address, parent_name, parent_phone"
        )
        .eq("school_id", profile.school_id)
        .order("last_name", { ascending: true })
        .range(debut, debut + TAILLE_TRANCHE - 1)

      if (error) {
        studentsError = error
        break
      }

      tousLesEleves.push(...((tranche as Student[]) ?? []))

      if (!tranche || tranche.length < TAILLE_TRANCHE) {
        break
      }
    }

    if (studentsError) {
      console.error(
        "Erreur lors du chargement des élèves :",
        studentsError
      )
      setLoadError("Impossible de charger la liste des élèves.")
    }

    setStudents(tousLesEleves)

    /*
     * Même plafond, même remède : les inscriptions comptent une ligne
     * par élève ET par année, elles franchissent donc le millier avant
     * les élèves eux-mêmes. Tronquées, elles ne rendraient personne
     * introuvable — mais rangeraient des élèves inscrits sous « sans
     * classe », ce qui est faux et se remarque tard.
     */
    const toutesLesInscriptions: Enrollment[] = []
    let enrollmentsError = null

    for (let debut = 0; ; debut += TAILLE_TRANCHE) {
      const { data: tranche, error } = await supabase
        .from("student_class_enrollments")
        .select(`
          student_id,
          academic_year_id,
          classes ( id, name )
        `)
        .eq("school_id", profile.school_id)
        .range(debut, debut + TAILLE_TRANCHE - 1)

      if (error) {
        enrollmentsError = error
        break
      }

      toutesLesInscriptions.push(
        ...((tranche as unknown as Enrollment[]) ?? [])
      )

      if (!tranche || tranche.length < TAILLE_TRANCHE) {
        break
      }
    }

    if (enrollmentsError) {
      console.error(
        "Erreur lors du chargement des inscriptions :",
        enrollmentsError
      )
      setLoadError("Impossible de charger les classes des élèves.")
    }

    setEnrollments(toutesLesInscriptions)

    setLoading(false)
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!firstName.trim() || !lastName.trim()) {
      alert("Le prénom et le nom sont obligatoires.")
      return
    }

    if (!selectedClassId) {
      alert("Veuillez sélectionner une classe.")
      return
    }

    /*
     * Le numéro du parent est le seul moyen de joindre la famille : un
     * numéro tronqué ne se découvre qu'au moment d'écrire, trop tard.
     * Vide reste accepté — tous les parents n'en ont pas.
     */
    const reprocheTelephone = reprocheNumeroParent(parentPhone)

    if (reprocheTelephone) {
      alert(reprocheTelephone)
      return
    }

    if (!activeAcademicYearId) {
      alert(
        "Aucune année scolaire active n'est configurée pour votre établissement. Configurez-la avant d'ajouter un élève."
      )
      return
    }

    setCreating(true)

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        school_id: schoolId,
        /*
         * Mise en forme A L'ENREGISTREMENT : ce qui est en base est ce
         * qui s'imprime sur un bulletin. Mettre en forme a l'affichage
         * laisserait la base disparate et deux ecrans pourraient
         * diverger.
         */
        first_name: formaterPrenom(firstName),
        last_name: formaterNom(lastName),
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        student_number: studentNumber.trim() || null,
        address: address.trim() || null,
        parent_name: parentName.trim() || null,
        parent_phone: parentPhone.trim() || null,
      })
      .select()
      .single()

    if (studentError || !student) {
      console.error(
        "Erreur lors de la création de l'élève :",
        studentError
      )

      alert(
        studentError?.message ||
          "Impossible de créer l'élève."
      )

      setCreating(false)
      return
    }

    const { error: enrollmentError } = await supabase
      .from("student_class_enrollments")
      .insert({
        student_id: student.id,
        class_id: selectedClassId,
        school_id: schoolId,
        academic_year_id: activeAcademicYearId,
      })

    if (enrollmentError) {
      console.error(
        "Erreur lors de l'inscription de l'élève :",
        enrollmentError
      )

      alert(
        "L'élève a été créé, mais son inscription dans la classe a échoué : " +
          enrollmentError.message
      )

      setCreating(false)
      return
    }

    setFirstName("")
    setLastName("")
    setDateOfBirth("")
    setGender("")
    setStudentNumber("")
    setAddress("")
    setParentName("")
    setParentPhone("")
    setSelectedClassId("")

    await loadData()

    setCreating(false)
  }

  function startEditStudent(student: Student) {
    setEditError(null)
    setEditingStudent(student)
    setEditForm(toEditForm(student))
  }

  function closeEditStudent() {
    setEditingStudent(null)
    setEditForm(null)
    setEditError(null)
  }

  /*
   * Enregistre les informations personnelles modifiées.
   *
   * La ligne renvoyée par la base remplace celle du tableau : on affiche
   * ainsi ce qui a réellement été enregistré, pas ce qui a été saisi.
   */
  async function saveStudentEdit() {
    if (!editingStudent || !editForm) {
      return
    }

    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError("Le prénom et le nom sont obligatoires.")
      return
    }

    const reprocheTelephone = reprocheNumeroParent(editForm.parentPhone)

    if (reprocheTelephone) {
      setEditError(reprocheTelephone)
      return
    }

    setSavingEdit(true)
    setEditError(null)

    const { data: updated, error } = await supabase
      .from("students")
      .update({
        first_name: formaterPrenom(editForm.firstName),
        last_name: formaterNom(editForm.lastName),
        date_of_birth: editForm.dateOfBirth || null,
        gender: editForm.gender || null,
        student_number: editForm.studentNumber.trim() || null,
        address: editForm.address.trim() || null,
        parent_name: editForm.parentName.trim() || null,
        parent_phone: editForm.parentPhone.trim() || null,
      })
      .eq("id", editingStudent.id)
      // Filtre de sûreté : la modification ne peut pas sortir de l'école.
      .eq("school_id", schoolId)
      .select(
        "id, first_name, last_name, date_of_birth, gender, student_number, address, parent_name, parent_phone"
      )
      .single()

    if (error || !updated) {
      console.error("Erreur lors de la modification de l'élève :", error)

      setEditError(
        error?.message ||
          "Impossible d'enregistrer les modifications. Vérifiez vos droits."
      )

      setSavingEdit(false)
      return
    }

    setStudents((current) =>
      current.map((student) =>
        student.id === updated.id ? (updated as Student) : student
      )
    )

    setSavingEdit(false)
    closeEditStudent()
  }

  /*
   * Validation d'un fichier d'élèves.
   *
   * Deux niveaux : une erreur bloque la ligne (champ obligatoire manquant,
   * classe introuvable, format invalide) ; un avertissement l'exclut mais
   * l'utilisateur peut la réintégrer explicitement (doublon probable).
   */
  function validateStudentRows(rawRows: RawRow[]): ImportRow[] {
    // Signature normalisée -> première ligne où elle apparaît dans le fichier.
    const seenInFile = new Map<string, number>()

    return rawRows.map((raw) => {
      const errors: string[] = []
      const warnings: string[] = []

      const lastName = raw.values.last_name?.trim() ?? ""
      const firstName = raw.values.first_name?.trim() ?? ""
      const className = raw.values.class_name?.trim() ?? ""

      if (!lastName) {
        errors.push("Le nom est obligatoire.")
      }

      if (!firstName) {
        errors.push("Le prénom est obligatoire.")
      }

      // La classe est cherchée par nom exact (accents et casse ignorés).
      let classId: string | null = null

      if (!className) {
        errors.push("La classe est obligatoire.")
      } else {
        const matches = classes.filter(
          (item) =>
            normalizeSearchText(item.name) === normalizeSearchText(className)
        )

        if (matches.length === 0) {
          errors.push(
            `Classe « ${className} » introuvable dans votre établissement.`
          )
        } else if (matches.length > 1) {
          errors.push(
            `Plusieurs classes portent le nom « ${className} » : impossible de choisir.`
          )
        } else {
          classId = matches[0].id
        }
      }

      const gender = parseGender(raw.values.gender ?? "")

      if (gender === undefined) {
        errors.push(
          `Sexe « ${raw.values.gender} » non reconnu. Utilisez M ou F.`
        )
      }

      const dateOfBirth = parseSpreadsheetDate(raw.values.date_of_birth ?? "")

      if (dateOfBirth === undefined) {
        errors.push(
          `Date de naissance « ${raw.values.date_of_birth} » non reconnue (AAAA-MM-JJ ou JJ/MM/AAAA).`
        )
      }

      // Même règle qu'à la saisie manuelle : un numéro tronqué se
      // découvrirait au moment d'écrire au parent, trop tard.
      const reprocheTelephone = reprocheNumeroParent(
        raw.values.parent_phone ?? ""
      )

      if (reprocheTelephone) {
        errors.push(reprocheTelephone)
      }

      const signature = normalizeSearchText(
        `${lastName} ${firstName} ${className}`
      )

      if (lastName && firstName) {
        const firstSeen = seenInFile.get(signature)

        if (firstSeen !== undefined) {
          warnings.push(
            `Ligne identique à la ligne ${firstSeen} du fichier.`
          )
        } else {
          seenInFile.set(signature, raw.lineNumber)
        }

        const alreadyInSchool = students.some(
          (student) =>
            normalizeSearchText(`${student.last_name} ${student.first_name}`) ===
            normalizeSearchText(`${lastName} ${firstName}`)
        )

        if (alreadyInSchool) {
          warnings.push(
            "Un élève de même nom et prénom est déjà enregistré dans l'établissement."
          )
        }
      }

      if (!activeAcademicYearId) {
        errors.push(
          "Aucune année scolaire active : impossible d'inscrire l'élève."
        )
      }

      return {
        lineNumber: raw.lineNumber,
        values: raw.values,
        errors,
        warnings,
        ignored: false,
        confirmed: false,
        payload: {
          classId,
          student: {
            school_id: schoolId,
            // Même règle qu'à la saisie manuelle : un fichier importé
            // ne doit pas introduire une casse que le formulaire refuse.
            first_name: formaterPrenom(firstName),
            last_name: formaterNom(lastName),
            date_of_birth: dateOfBirth || null,
            gender: gender || null,
            student_number: raw.values.student_number?.trim() || null,
            address: raw.values.address?.trim() || null,
            parent_name: raw.values.parent_name?.trim() || null,
            parent_phone: raw.values.parent_phone?.trim() || null,
          },
        },
      }
    })
  }

  /*
   * Import séquentiel : une ligne à la fois, pour pouvoir désigner
   * précisément celle qui échoue.
   *
   * L'élève et son inscription sont deux insertions distinctes. Si la
   * seconde échoue, l'élève existe sans classe : on le signale au lieu de
   * le supprimer, pour ne pas détruire une donnée déjà enregistrée.
   */
  async function importStudentRows(
    rows: ImportRow[],
    onProgress: (done: number) => void
  ): Promise<ImportOutcome> {
    let imported = 0
    const failures: ImportOutcome["failures"] = []

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]

      const payload = row.payload as {
        classId: string | null
        student: Record<string, unknown>
      }

      const { data: student, error: studentError } = await supabase
        .from("students")
        .insert(payload.student)
        .select("id")
        .single()

      if (studentError || !student) {
        failures.push({
          lineNumber: row.lineNumber,
          message:
            studentError?.message ?? "L'élève n'a pas pu être enregistré.",
        })

        onProgress(index + 1)
        continue
      }

      const { error: enrollmentError } = await supabase
        .from("student_class_enrollments")
        .insert({
          student_id: student.id,
          class_id: payload.classId,
          school_id: schoolId,
          academic_year_id: activeAcademicYearId,
        })

      if (enrollmentError) {
        failures.push({
          lineNumber: row.lineNumber,
          message: `Élève créé, mais son inscription en classe a échoué (${enrollmentError.message}). Rattachez-le manuellement.`,
        })

        onProgress(index + 1)
        continue
      }

      imported++
      onProgress(index + 1)
    }

    return { imported, failures }
  }

  /*
   * Classe de chaque élève pour l'année scolaire active.
   * Si aucune année active n'est configurée, on retombe sur
   * l'ensemble des inscriptions pour ne pas masquer les classes.
   */
  const classNameByStudentId = useMemo(() => {
    const map = new Map<string, string>()

    enrollments
      .filter(
        (enrollment) =>
          !activeAcademicYearId ||
          enrollment.academic_year_id === activeAcademicYearId
      )
      .forEach((enrollment) => {
        if (enrollment.classes?.name) {
          map.set(enrollment.student_id, enrollment.classes.name)
        }
      })

    return map
  }, [enrollments, activeAcademicYearId])

  /*
   * Élèves regroupés par classe et filtrés par la recherche.
   * Le filtrage est fait côté client sur les données déjà chargées.
   */
  const studentGroups = useMemo(() => {
    const groups = new Map<string, Student[]>()

    students
      .filter((student) =>
        matchesSearch(
          searchTerm,
          student.first_name,
          student.last_name,
          student.student_number
        )
      )
      .forEach((student) => {
        const className =
          classNameByStudentId.get(student.id) ?? UNASSIGNED_CLASS_LABEL

        const group = groups.get(className)

        if (group) {
          group.push(student)
        } else {
          groups.set(className, [student])
        }
      })

    return Array.from(groups.entries())
      .map(([className, groupStudents]) => ({
        className,
        students: [...groupStudents].sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`,
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
  }, [students, classNameByStudentId, searchTerm])

  const matchedStudentCount = studentGroups.reduce(
    (total, group) => total + group.students.length,
    0
  )

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold">
              Ridwane
            </h1>

            <p className="text-sm text-muted-foreground">
              Gestion des élèves
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
        <AvertissementDirection compact />
        <div>
          <h2 className="text-3xl font-bold">
            Élèves
          </h2>

          <p className="mt-2 text-muted-foreground">
            Ajoutez et gérez les élèves de votre établissement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowImport((current) => !current)}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            {showImport ? "Masquer l'import Excel" : "Importer depuis Excel"}
          </button>

          {!loading && !activeAcademicYearId && (
            <p className="text-sm" style={{ color: "oklch(0.57 0.14 78)" }}>
              Aucune année scolaire active : l'import est indisponible.
            </p>
          )}
        </div>

        {showImport && (
          <ImportWizard
            title="Importer des élèves"
            description="Chaque ligne crée un élève et l'inscrit dans sa classe pour l'année scolaire active."
            fields={STUDENT_IMPORT_FIELDS}
            validateRows={validateStudentRows}
            importRows={importStudentRows}
            onClose={() => setShowImport(false)}
            onImported={loadData}
          />
        )}

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
          {/*
            Le comptable LIT la liste des eleves — il en a besoin pour
            rattacher un frais ou un paiement — mais ne l'ecrit pas :
            inscrire un eleve appartient a son directeur.
          */}
          {peutGererLesEleves && (
          <div className="rounded-xl border bg-background p-6">
            <h3 className="text-xl font-semibold">
              Ajouter un élève
            </h3>

            <form
              onSubmit={createStudent}
              className="mt-6 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <label htmlFor="firstName">
                    Prénom *
                  </label>

                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(event) =>
                      setFirstName(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName">
                    Nom *
                  </label>

                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) =>
                      setLastName(event.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="class">
                  Classe *
                </label>

                <select
                  id="class"
                  value={selectedClassId}
                  onChange={(event) =>
                    setSelectedClassId(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  required
                >
                  <option value="">
                    Sélectionner une classe
                  </option>

                  {classes.map((classItem) => (
                    <option
                      key={classItem.id}
                      value={classItem.id}
                    >
                      {classItem.name}
                      {classItem.level
                        ? ` — ${classItem.level}`
                        : ""}
                    </option>
                  ))}
                </select>

                {classes.length === 0 && (
                  <p className="text-sm text-destructive">
                    Vous devez d'abord créer une classe.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="dateOfBirth">
                  Date de naissance
                </label>

                <input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) =>
                    setDateOfBirth(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="gender">
                  Sexe
                </label>

                <select
                  id="gender"
                  value={gender}
                  onChange={(event) =>
                    setGender(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">
                    Sélectionner
                  </option>

                  <option value="M">
                    Masculin
                  </option>

                  <option value="F">
                    Féminin
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="studentNumber">
                  Numéro d'inscription
                </label>

                <input
                  id="studentNumber"
                  type="text"
                  value={studentNumber}
                  onChange={(event) =>
                    setStudentNumber(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="address">
                  Adresse
                </label>

                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(event) =>
                    setAddress(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="parentName">
                  Nom du parent/tuteur
                </label>

                <input
                  id="parentName"
                  type="text"
                  value={parentName}
                  onChange={(event) =>
                    setParentName(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="parentPhone">
                  Numéro WhatsApp du parent/tuteur
                </label>

                <input
                  id="parentPhone"
                  type="tel"
                  value={parentPhone}
                  onChange={(event) =>
                    setParentPhone(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />

                <p className="text-xs text-muted-foreground">
                  C&apos;est par ce numéro que l&apos;école préviendra la
                  famille d&apos;une absence, d&apos;une retenue ou d&apos;un
                  manquement au règlement. Sans lui, ces actions ne pourront
                  pas aboutir.
                </p>
              </div>

              <button
                type="submit"
                disabled={creating || classes.length === 0}
                className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
              >
                {creating
                  ? "Enregistrement..."
                  : "Ajouter l'élève"}
              </button>
            </form>
          </div>
          )}

          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  Liste des élèves
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? `${matchedStudentCount} élève(s) sur ${students.length}`
                    : `${students.length} élève(s)`}
                </p>
              </div>

              <div className="w-full sm:w-72">
                <label htmlFor="student-search" className="sr-only">
                  Rechercher un élève
                </label>

                <input
                  id="student-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                  placeholder="Rechercher un élève..."
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-muted-foreground">
                Chargement des élèves...
              </p>
            ) : students.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun élève enregistré pour le moment.
              </p>
            ) : studentGroups.length === 0 ? (
              <p className="mt-6 text-muted-foreground">
                Aucun élève ne correspond à « {searchTerm.trim()} ».
              </p>
            ) : (
              <div className="mt-6 space-y-8">
                {studentGroups.map((group) => (
                  <div key={group.className}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                      <h4 className="font-heading text-lg font-bold">
                        {group.className}
                      </h4>

                      <p className="text-sm text-muted-foreground">
                        {group.students.length} élève(s)
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-start text-sm">
                        <thead className="border-b">
                          <tr>
                            <th className="px-4 py-3">
                              Élève
                            </th>

                            <th className="px-4 py-3">
                              Sexe
                            </th>

                            <th className="px-4 py-3">
                              Date de naissance
                            </th>

                            <th className="px-4 py-3">
                              Parent/Tuteur
                            </th>

                            <th className="px-4 py-3">
                              Téléphone
                            </th>

                            <th className="px-4 py-3 text-end">
                              Actions
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.students.map((student) => (
                            <tr
                              key={student.id}
                              className="border-b last:border-0"
                            >
                              <td className="px-4 py-4">
                                {/*
                                  Le nom ouvre l'historique : c'est le
                                  geste naturel quand on cherche « que
                                  s'est-il passé avec cet élève ».
                                */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(`/students/${student.id}`)
                                  }
                                  className="text-start font-medium text-primary hover:underline"
                                >
                                  {student.first_name}{" "}
                                  {student.last_name}
                                </button>

                                {student.student_number && (
                                  <p className="text-xs text-muted-foreground">
                                    N°{" "}
                                    {student.student_number}
                                  </p>
                                )}
                              </td>

                              <td className="px-4 py-4">
                                {student.gender === "M"
                                  ? "Masculin"
                                  : student.gender === "F"
                                    ? "Féminin"
                                    : "—"}
                              </td>

                              <td className="px-4 py-4">
                                {student.date_of_birth || "—"}
                              </td>

                              <td className="px-4 py-4">
                                {student.parent_name || "—"}
                              </td>

                              <td className="px-4 py-4">
                                {student.parent_phone || "—"}
                              </td>

                              <td className="px-4 py-4 text-end">
                                <button
                                  onClick={() => startEditStudent(student)}
                                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                                >
                                  Modifier
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {editingStudent && editForm && (
        <EditDialog
          title="Modifier l'élève"
          description={`${editingStudent.first_name} ${editingStudent.last_name}`}
          error={editError}
          saving={savingEdit}
          onSubmit={saveStudentEdit}
          onClose={closeEditStudent}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="edit-firstName">Prénom *</label>

              <input
                id="edit-firstName"
                type="text"
                value={editForm.firstName}
                onChange={(event) =>
                  setEditForm({ ...editForm, firstName: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-lastName">Nom *</label>

              <input
                id="edit-lastName"
                type="text"
                value={editForm.lastName}
                onChange={(event) =>
                  setEditForm({ ...editForm, lastName: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-dateOfBirth">Date de naissance</label>

              <input
                id="edit-dateOfBirth"
                type="date"
                value={editForm.dateOfBirth}
                onChange={(event) =>
                  setEditForm({ ...editForm, dateOfBirth: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-gender">Sexe</label>

              <select
                id="edit-gender"
                value={editForm.gender}
                onChange={(event) =>
                  setEditForm({ ...editForm, gender: event.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                <option value="">Non renseigné</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-studentNumber">Numéro d'inscription</label>

            <input
              id="edit-studentNumber"
              type="text"
              value={editForm.studentNumber}
              onChange={(event) =>
                setEditForm({ ...editForm, studentNumber: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-address">Adresse</label>

            <input
              id="edit-address"
              type="text"
              value={editForm.address}
              onChange={(event) =>
                setEditForm({ ...editForm, address: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-parentName">Nom du parent/tuteur</label>

            <input
              id="edit-parentName"
              type="text"
              value={editForm.parentName}
              onChange={(event) =>
                setEditForm({ ...editForm, parentName: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-parentPhone">
              Téléphone du parent/tuteur
            </label>

            <input
              id="edit-parentPhone"
              type="tel"
              value={editForm.parentPhone}
              onChange={(event) =>
                setEditForm({ ...editForm, parentPhone: event.target.value })
              }
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            La classe de l'élève se change depuis son inscription, pas depuis
            cette fiche.
          </p>
        </EditDialog>
      )}
    </main>
  )
}