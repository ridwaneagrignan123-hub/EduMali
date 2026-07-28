import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Création de l'établissement et rattachement du compte qui l'ouvre.
 *
 * Pourquoi une route serveur plutôt qu'un simple update depuis la page :
 * le déclencheur profiles_prevent_privilege_escalation interdit à un
 * utilisateur de modifier son propre role ou school_id — c'est ce qui
 * empêche un enseignant de se promouvoir administrateur. Or l'inscription
 * doit faire exactement cela, une fois, légitimement. Le déclencheur
 * laisse passer le service role : c'est donc ici que l'opération a sa
 * place, et nulle part ailleurs.
 *
 * Garde-fou : on ne rattache que si le compte n'a PAS encore d'école.
 * Sans cette condition, la route deviendrait un moyen détourné de changer
 * d'établissement ou de se rendre administrateur d'une école existante.
 */

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
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
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

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""

    if (!name) {
      return NextResponse.json(
        { error: "Le nom de l'établissement est obligatoire." },
        { status: 400 }
      )
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Erreur lecture du profil :", profileError)

      return NextResponse.json(
        { error: "Impossible de lire votre profil." },
        { status: 500 }
      )
    }

    if (profile?.school_id) {
      return NextResponse.json(
        {
          error:
            "Votre compte est déjà rattaché à un établissement.",
        },
        { status: 409 }
      )
    }

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert({
        name,
        address: typeof body.address === "string" ? body.address.trim() || null : null,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
        email: typeof body.email === "string" ? body.email.trim() || null : null,
      })
      .select("id")
      .single()

    if (schoolError || !school) {
      console.error("Erreur création de l'établissement :", schoolError)

      return NextResponse.json(
        { error: "L'établissement n'a pas pu être créé." },
        { status: 500 }
      )
    }

    /*
     * Le profil peut ne pas exister encore selon la façon dont le compte
     * a été créé : on insère ou on met à jour, sans supposer.
     */
    const { error: linkError } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      school_id: school.id,
      first_name: (user.user_metadata?.first_name as string) ?? "",
      last_name: (user.user_metadata?.last_name as string) ?? "",
      role: "admin",
      is_active: true,
    })

    if (linkError) {
      console.error("Erreur rattachement du profil :", linkError)

      /*
       * L'établissement existe mais personne ne peut y accéder : on le
       * retire plutôt que de laisser une école orpheline en base.
       */
      await supabaseAdmin.from("schools").delete().eq("id", school.id)

      return NextResponse.json(
        {
          error:
            "Votre compte n'a pas pu être rattaché à l'établissement. Réessayez.",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ schoolId: school.id }, { status: 200 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
