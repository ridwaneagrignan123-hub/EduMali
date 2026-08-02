import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * L'examen des demandes d'accès, réservé à l'EXPLOITANT DE LA
 * PLATEFORME.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CE CONTRÔLE N'EST PAS requirePermission()
 *
 * requirePermission() interroge le rôle d'école du profil, et exige un
 * `school_id`. L'exploitant n'est justement rattaché à aucune école :
 * il est au-dessus d'elles. Son appartenance se lit dans
 * `platform_operators`, une table sans policy — donc invisible au
 * navigateur, et lisible seulement par la clé service role.
 *
 * Un promoteur, fût-il celui de la plus grande école, n'entre pas ici.
 * ---------------------------------------------------------------------
 */

type Exploitant = { userId: string }

async function exigerExploitant(
  request: Request
): Promise<
  { ok: true; exploitant: Exploitant } | { ok: false; response: NextResponse }
> {
  const authorization = request.headers.get("Authorization")

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Utilisateur non authentifié." },
        { status: 401 }
      ),
    }
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authorization } } }
  )

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Session utilisateur invalide." },
        { status: 401 }
      ),
    }
  }

  const { data: operateur } = await supabaseAdmin
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!operateur) {
    /*
     * 404 et non 403 : à qui n'est pas exploitant, cette adresse n'a pas
     * à confirmer qu'elle existe.
     */
    return {
      ok: false,
      response: NextResponse.json({ error: "Introuvable." }, { status: 404 }),
    }
  }

  return { ok: true, exploitant: { userId: user.id } }
}

export async function GET(request: Request) {
  try {
    const garde = await exigerExploitant(request)

    if (!garde.ok) {
      return garde.response
    }

    const { data, error } = await supabaseAdmin
      .from("school_access_requests")
      .select(
        `id, created_at, school_name, city, school_type, contact_name,
         phone, email, status, reviewed_at, decision_note`
      )
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) {
      console.error("Erreur lecture des demandes :", error)

      return NextResponse.json(
        { error: "Les demandes n'ont pas pu être lues." },
        { status: 500 }
      )
    }

    return NextResponse.json({ demandes: data ?? [] })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const garde = await exigerExploitant(request)

    if (!garde.ok) {
      return garde.response
    }

    const body = await request.json()
    const decision = body.decision

    if (decision !== "approuvee" && decision !== "refusee") {
      return NextResponse.json(
        { error: "Décision inconnue." },
        { status: 400 }
      )
    }

    if (!body.requestId) {
      return NextResponse.json(
        { error: "Demande manquante." },
        { status: 400 }
      )
    }

    /*
     * On RÉCLAME la demande en une seule écriture conditionnée sur
     * `status = 'en_attente'`. Lire puis écrire laisserait deux clics
     * simultanés approuver deux fois la même demande, et donc émettre
     * deux autorisations pour une seule école.
     */
    const { data: demande, error: reclamationError } = await supabaseAdmin
      .from("school_access_requests")
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: garde.exploitant.userId,
        decision_note:
          typeof body.note === "string" && body.note.trim()
            ? body.note.trim()
            : null,
      })
      .eq("id", body.requestId)
      .eq("status", "en_attente")
      .select("id, email, school_name")
      .maybeSingle()

    if (reclamationError) {
      console.error("Erreur examen de la demande :", reclamationError)

      return NextResponse.json(
        { error: "La décision n'a pas pu être enregistrée." },
        { status: 500 }
      )
    }

    if (!demande) {
      return NextResponse.json(
        { error: "Cette demande a déjà été examinée." },
        { status: 409 }
      )
    }

    if (decision === "refusee") {
      return NextResponse.json({ statut: "refusee" })
    }

    /*
     * L'ADRESSE VIENT DE LA LIGNE RÉCLAMÉE, jamais du corps de la
     * requête. C'est le pendant exact du contrôle fait au dépôt : si
     * /exploitant pouvait fournir une adresse, une demande approuvée
     * émettrait une autorisation pour quelqu'un d'autre — et tout le
     * caractère nominatif de l'autorisation tomberait.
     *
     * `body` ne porte donc que trois choses : quelle demande, quelle
     * décision, quel motif.
     *
     * L'APPROBATION ÉMET L'AUTORISATION, elle ne crée pas l'école.
     * L'établissement naîtra quand la personne se connectera et passera
     * par /setup-school, qui consomme l'autorisation en une écriture
     * atomique et non rejouable.
     */
    const { data: autorisation, error: grantError } = await supabaseAdmin
      .from("school_creation_grants")
      .insert({
        email: demande.email,
        note: `Demande approuvée — ${demande.school_name}`,
      })
      .select("id")
      .single()

    if (grantError || !autorisation) {
      console.error("Erreur émission de l'autorisation :", grantError)

      /*
       * La demande a été marquée approuvée mais l'autorisation manque :
       * on la remet en attente plutôt que de laisser une approbation
       * sans effet, que personne ne remarquerait.
       */
      await supabaseAdmin
        .from("school_access_requests")
        .update({ status: "en_attente", reviewed_at: null, reviewed_by: null })
        .eq("id", demande.id)

      return NextResponse.json(
        { error: "L'autorisation n'a pas pu être émise. Réessayez." },
        { status: 500 }
      )
    }

    await supabaseAdmin
      .from("school_access_requests")
      .update({ grant_id: autorisation.id })
      .eq("id", demande.id)

    return NextResponse.json({
      statut: "approuvee",
      email: demande.email,
    })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
