import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

console.log("URL présente :", !!process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log(
  "SERVICE ROLE présente :",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
)
console.log(
  "Début de la clé :",
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10)
)
export async function POST(request: Request) {
  try {
    const authorization =
      request.headers.get("Authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Utilisateur non authentifié.",
        },
        { status: 401 }
      )
    }

    const accessToken =
      authorization.replace(
        "Bearer ",
        ""
      )

    const supabaseAuth =
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
        }
      )

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await supabaseAuth.auth.getUser()

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Session utilisateur invalide.",
        },
        { status: 401 }
      )
    }

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "school_id, role"
        )
        .eq(
          "id",
          user.id
        )
        .maybeSingle()

    if (
      profileError ||
      !profile
    ) {
      return NextResponse.json(
        {
          error:
            "Profil administrateur introuvable.",
        },
        { status: 403 }
      )
    }

    if (
      profile.role !==
      "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Seuls les administrateurs peuvent inviter des enseignants.",
        },
        { status: 403 }
      )
    }

    if (
      !profile.school_id
    ) {
      return NextResponse.json(
        {
          error:
            "Votre compte n'est associé à aucun établissement.",
        },
        { status: 400 }
      )
    }

    const body =
      await request.json()

    const {
      email,
      firstName,
      lastName,
      phone,
      specialty,
      hireDate,
    } = body

    if (
      !email ||
      !firstName ||
      !lastName
    ) {
      return NextResponse.json(
        {
          error:
            "Le prénom, le nom et l'email sont obligatoires.",
        },
        { status: 400 }
      )
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase()

    const {
      data: invitedUser,
      error: inviteError,
    } =
      await supabaseAdmin.auth.admin
        .inviteUserByEmail(
          normalizedEmail,
          {
            data: {
              first_name:
                firstName.trim(),
              last_name:
                lastName.trim(),
              role: "teacher",
            },
          }
        )

    if (
      inviteError
    ) {
      console.error(
        "Erreur invitation :",
        inviteError
      )

      return NextResponse.json(
        {
          error:
            inviteError.message,
        },
        { status: 400 }
      )
    }

    if (
      !invitedUser.user
    ) {
      return NextResponse.json(
        {
          error:
            "Le compte enseignant n'a pas pu être créé.",
        },
        { status: 500 }
      )
    }

    const teacherUserId =
      invitedUser.user.id

    const {
      error: profileInsertError,
    } =
      await supabaseAdmin
 .from("profiles")
.upsert({     
          id: teacherUserId,
          school_id:
            profile.school_id,
          first_name:
            firstName.trim(),
          last_name:
            lastName.trim(),
          role: "teacher",
          phone:
            phone?.trim() ||
            null,
        })

    if (
      profileInsertError
    ) {
      console.error(
        "Erreur création profil :",
        profileInsertError
      )

  return NextResponse.json(
  {
    error:
      "Le compte a été créé, mais le profil enseignant n'a pas pu être créé.",
    details: profileInsertError.message,
    code: profileInsertError.code,
    hint: profileInsertError.hint,
  },
  { status: 500 }
) 
    }

    const {
      error: teacherInsertError,
    } =
      await supabaseAdmin
        .from("teachers")
        .insert({
          school_id:
            profile.school_id,
          profile_id:
            teacherUserId,
          first_name:
            firstName.trim(),
          last_name:
            lastName.trim(),
          email:
            normalizedEmail,
          phone:
            phone?.trim() ||
            null,
          specialty:
            specialty?.trim() ||
            null,
          hire_date:
            hireDate ||
            null,
          status:
            "active",
        })

    if (
      teacherInsertError
    ) {
      console.error(
        "Erreur création enseignant :",
        teacherInsertError
      )

      return NextResponse.json(
        {
          error:
            "Le compte a été créé, mais la fiche enseignant n'a pas pu être créée.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "Invitation envoyée avec succès.",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(
      "Erreur serveur :",
      error
    )

    return NextResponse.json(
      {
        error:
          "Une erreur interne est survenue.",
      },
      { status: 500 }
    )
  }
}