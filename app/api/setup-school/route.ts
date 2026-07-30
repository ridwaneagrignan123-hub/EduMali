import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { isSchoolType } from "@/src/lib/etablissement"

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
 * ---------------------------------------------------------------------
 * C'EST ICI QUE SE PREND LA DÉCISION, PAS DANS LE NAVIGATEUR
 *
 * Le contrôle qui rejetait un compte Google inconnu vivait dans
 * app/auth/callback/page.tsx, un fichier client. Or l'URL Supabase et la
 * clé anon sont publiques : on peut lancer l'authentification Google
 * depuis son propre script, sans jamais charger cette page. Le signOut()
 * de rejet ne s'exécutait alors jamais, et le porteur du jeton arrivait
 * ici avec un profil vide — les trois conditions d'alors étaient
 * réunies, et il devenait administrateur de son propre établissement.
 *
 * L'inscription publique étant volontairement reportée, cette route
 * n'aboutit plus que sur AUTORISATION NOMINATIVE PRÉALABLE, déposée dans
 * school_creation_grants par le titulaire du projet. Cette table n'a
 * aucune policy : le RLS en interdit l'accès à tout client, seule la clé
 * service role la lit. Un jeton valide ne suffit plus.
 *
 * Une table plutôt qu'un drapeau de configuration : un drapeau activé
 * pour intégrer une école puis oublié rouvre le trou en silence, tandis
 * qu'une autorisation se consomme et laisse une trace de qui l'a
 * accordée.
 * ---------------------------------------------------------------------
 *
 * Garde-fou conservé : on ne rattache que si le compte n'a PAS encore
 * d'école. Sans cette condition, la route deviendrait un moyen détourné
 * de changer d'établissement ou de se rendre administrateur d'une école
 * existante.
 */

/** Rend une autorisation réclamée mais finalement inutilisée. */
async function libererAutorisation(grantId: string) {
  const { error } = await supabaseAdmin
    .from("school_creation_grants")
    .update({ used_at: null, used_by: null })
    .eq("id", grantId)

  if (error) {
    // Sans gravité immédiate : l'établissement n'existe pas. Mais il
    // faudra réémettre une autorisation, d'où la trace.
    console.error("Autorisation non libérée :", error)
  }
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

    /*
     * Type d'établissement. Absent, on retient `classique` : c'est le
     * défaut de la colonne et le cas de très loin le plus fréquent. On
     * refuse en revanche une valeur inconnue plutôt que de la corriger
     * en silence — se retrouver en `classique` alors qu'on a demandé
     * franco-arabe ne se remarquerait qu'à l'usage.
     */
    if (body.schoolType !== undefined && !isSchoolType(body.schoolType)) {
      return NextResponse.json(
        { error: "Type d'établissement inconnu." },
        { status: 400 }
      )
    }

    const schoolType = isSchoolType(body.schoolType)
      ? body.schoolType
      : "classique"

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

    /*
     * L'autorisation nominative. On compare en minuscules : Google peut
     * renvoyer une casse différente de celle saisie par le titulaire.
     */
    const courriel = (user.email ?? "").trim().toLowerCase()

    /*
     * On RÉCLAME l'autorisation avant de créer quoi que ce soit, en une
     * seule écriture conditionnée sur `used_at is null`. Lire puis
     * écrire laisserait deux appels simultanés consommer la même
     * autorisation et ouvrir deux établissements.
     */
    const { data: grant, error: grantError } = courriel
      ? await supabaseAdmin
          .from("school_creation_grants")
          .update({ used_at: new Date().toISOString(), used_by: user.id })
          .ilike("email", courriel)
          .is("used_at", null)
          .select("id")
          .maybeSingle()
      : { data: null, error: null }

    if (grantError) {
      console.error("Erreur lecture de l'autorisation :", grantError)

      return NextResponse.json(
        { error: "Impossible de vérifier votre autorisation." },
        { status: 500 }
      )
    }

    if (!courriel || !grant) {
      /*
       * Refus par défaut. Un jeton valide ne vaut pas autorisation : il
       * atteste seulement que Google connaît cette personne, pas que
       * nous l'attendions.
       */
      return NextResponse.json(
        {
          error:
            "La création d'un établissement n'est pas ouverte. Si vous devez ouvrir une école sur Ridwane, contactez l'équipe pour qu'elle autorise votre adresse.",
        },
        { status: 403 }
      )
    }

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert({
        name,
        school_type: schoolType,
        address: typeof body.address === "string" ? body.address.trim() || null : null,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
        email: typeof body.email === "string" ? body.email.trim() || null : null,
      })
      .select("id")
      .single()

    if (schoolError || !school) {
      console.error("Erreur création de l'établissement :", schoolError)

      // L'autorisation n'a pas servi : on la rend, sinon un échec
      // technique la consommerait et il faudrait en réémettre une.
      await libererAutorisation(grant.id)

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
      await libererAutorisation(grant.id)

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
