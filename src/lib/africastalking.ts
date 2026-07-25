type SendSmsResult = {
  success: boolean
  messageId?: string
  error?: string
}

function normalizeMaliPhone(phone: string) {
  const trimmed = phone.trim().replace(/[\s-]/g, "")

  if (trimmed.startsWith("+")) {
    return trimmed
  }

  if (trimmed.startsWith("00")) {
    return `+${trimmed.slice(2)}`
  }

  return `+223${trimmed.replace(/^0+/, "")}`
}

export async function sendSms(
  phone: string,
  message: string
): Promise<SendSmsResult> {
  const username = process.env.AFRICASTALKING_USERNAME
  const apiKey = process.env.AFRICASTALKING_API_KEY

  if (!username || !apiKey) {
    return {
      success: false,
      error:
        "Le service SMS n'est pas configuré (identifiants Africa's Talking manquants).",
    }
  }

  const endpoint =
    username === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging"

  const to = normalizeMaliPhone(phone)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey,
      },
      body: new URLSearchParams({
        username,
        to,
        message,
      }),
    })

    const data = await response.json()
    const recipient = data?.SMSMessageData?.Recipients?.[0]

    if (!response.ok || !recipient || recipient.status !== "Success") {
      return {
        success: false,
        error:
          recipient?.status ||
          data?.SMSMessageData?.Message ||
          "Échec de l'envoi du SMS.",
      }
    }

    return {
      success: true,
      messageId: recipient.messageId,
    }
  } catch (error) {
    console.error("Erreur envoi SMS Africa's Talking :", error)

    return {
      success: false,
      error: "Impossible de contacter le service SMS.",
    }
  }
}
