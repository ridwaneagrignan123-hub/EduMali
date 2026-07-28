import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { sendSms } from "@/src/lib/africastalking"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type EventType = "absence" | "report_card" | "fee_overdue"

const validEventTypes: EventType[] = ["absence", "report_card", "fee_overdue"]

function buildMessage(
  eventType: EventType,
  schoolName: string,
  studentName: string,
  params: Record<string, unknown>
) {
  if (eventType === "absence") {
    const status = params?.status

    const statusLabel =
      status === "late"
        ? "en retard"
        : status === "excused"
          ? "absent(e) (excusé(e))"
          : "absent(e)"

    const date = typeof params?.attendanceDate === "string" ? params.attendanceDate : ""

    return `Bonjour, votre enfant ${studentName} a été marqué(e) ${statusLabel} le ${date} à ${schoolName}.`
  }

  if (eventType === "report_card") {
    const periodName =
      typeof params?.periodName === "string" ? params.periodName : ""

    return `Bonjour, le bulletin de ${studentName} pour la période "${periodName}" est disponible à ${schoolName}.`
  }

  const balance = Number(params?.balance ?? 0)

  return `Bonjour, un solde de ${balance.toLocaleString("fr-FR")} FCFA reste dû pour ${studentName} à ${schoolName}. Merci de régulariser.`
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié." },
        { status: 401 }
      )
    }

    const accessToken = authorization.replace("Bearer ", "")

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Session utilisateur invalide." },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile?.school_id) {
      return NextResponse.json(
        { error: "Profil introuvable." },
        { status: 403 }
      )
    }

    const body = await request.json()

    const {
      studentId,
      eventType,
      relatedId,
      params,
    }: {
      studentId?: string
      eventType?: EventType
      relatedId?: string | null
      params?: Record<string, unknown>
    } = body

    if (!studentId || !eventType) {
      return NextResponse.json(
        { error: "Paramètres manquants." },
        { status: 400 }
      )
    }

    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json(
        { error: "Type d'événement invalide." },
        { status: 400 }
      )
    }

    if (eventType === "fee_overdue" && profile.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Seuls les administrateurs peuvent envoyer des rappels de paiement.",
        },
        { status: 403 }
      )
    }

    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_phone")
      .eq("id", studentId)
      .eq("school_id", profile.school_id)
      .maybeSingle()

    if (studentError || !student) {
      return NextResponse.json(
        { error: "Élève introuvable." },
        { status: 404 }
      )
    }

    if (!student.parent_phone) {
      return NextResponse.json(
        {
          error:
            "Aucun numéro de téléphone parent renseigné pour cet élève.",
        },
        { status: 400 }
      )
    }

    const { data: school } = await supabaseAdmin
      .from("schools")
      .select("name")
      .eq("id", profile.school_id)
      .maybeSingle()

    const studentName = `${student.first_name} ${student.last_name}`

    const message = buildMessage(
      eventType,
      school?.name || "votre établissement",
      studentName,
      params ?? {}
    )

    const result = await sendSms(student.parent_phone, message)

    const { error: logError } = await supabaseAdmin.from("sms_logs").insert({
      school_id: profile.school_id,
      student_id: studentId,
      event_type: eventType,
      related_id: relatedId || null,
      phone: student.parent_phone,
      message,
      status: result.success ? "sent" : "failed",
      provider_message_id: result.messageId || null,
      error_message: result.error || null,
    })

    if (logError) {
      console.error("Erreur journalisation SMS :", logError)
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Échec de l'envoi du SMS." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "SMS envoyé avec succès.",
    })
  } catch (error) {
    console.error("Erreur serveur SMS :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
