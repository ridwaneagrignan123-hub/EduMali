import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"

/*
 * Où envoyer quelqu'un qui vient de se connecter.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CÔTÉ SERVEUR
 *
 * La réponse dépend de `school_creation_grants`, table SANS AUCUNE
 * POLICY : le navigateur ne peut pas la lire, et c'est voulu. Une
 * lecture ouverte permettrait de sonder quelles adresses sont
 * autorisées, c'est-à-dire de savoir qui est attendu.
 *
 * On répond donc une DESTINATION, pas les données qui y mènent. Le
 * navigateur apprend « va à setup-school », jamais « il existe un grant
 * pour telle adresse ».
 * ---------------------------------------------------------------------
 *
 * L'ORDRE COMPTE, et il va du plus établi au plus incertain :
 *
 *   1. déjà rattaché à une école .... son espace
 *   2. exploitant sans école ........ l'écran d'exploitation
 *   3. autorisation non consommée ... création de l'établissement
 *   4. demande en attente ........... « demande reçue »
 *   5. demande refusée .............. le dire clairement
 *   6. rien ......................... déposer une demande
 *
 * Le rattachement passe avant l'autorisation : quelqu'un qui a déjà une
 * école et à qui il resterait un grant inutilisé doit aller travailler,
 * pas en rouvrir une seconde.
 */

export type Destination =
  | { ou: "exploitant" }
  | { ou: "espace" }
  | { ou: "setup-school" }
  | { ou: "demande-en-attente"; note: string | null }
  | { ou: "demande-refusee"; motif: string | null }
  | { ou: "demande-acces" }

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("Authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié." },
        { status: 401 }
      )
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
      return NextResponse.json(
        { error: "Session utilisateur invalide." },
        { status: 401 }
      )
    }

    const email = (user.email ?? "").trim().toLowerCase()

    // 1. Déjà rattaché à une école.
    const { data: profil } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profil?.school_id) {
      return NextResponse.json({ ou: "espace" } satisfies Destination)
    }

    /*
     * L'EXPLOITANT sans école va à son écran, pas au formulaire de
     * demande d'accès. Le contrôle vient APRÈS l'école : quelqu'un qui
     * tient la plateforme ET dirige un établissement travaille d'abord
     * dans le sien, et rejoint /exploitant par son adresse.
     */
    if (email) {
      const { data: exploitant } = await supabaseAdmin
        .from("platform_operators")
        .select("email")
        .eq("email", email)
        .maybeSingle()

      if (exploitant) {
        return NextResponse.json({ ou: "exploitant" } satisfies Destination)
      }
    }

    /*
     * 2. Une autorisation qui l'attend. On ne la CONSOMME pas ici :
     * /api/setup-school la réclame en une écriture atomique au moment
     * où l'école est réellement créée. La consommer en chemin
     * laisserait une autorisation brûlée pour rien si la personne
     * refermait l'onglet.
     */
    if (email) {
      const { data: autorisation } = await supabaseAdmin
        .from("school_creation_grants")
        .select("id")
        .ilike("email", email)
        .is("used_at", null)
        .maybeSingle()

      if (autorisation) {
        return NextResponse.json({ ou: "setup-school" } satisfies Destination)
      }
    }

    // 3 et 4. Une demande déjà déposée. La plus récente fait foi : après
    // un refus, on peut redéposer.
    const { data: demande } = await supabaseAdmin
      .from("school_access_requests")
      .select("status, decision_note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (demande?.status === "en_attente") {
      return NextResponse.json({
        ou: "demande-en-attente",
        note: null,
      } satisfies Destination)
    }

    /*
     * Approuvée, mais on est passé à côté de l'autorisation plus haut :
     * elle a donc déjà été consommée sans qu'une école en sorte. Le cas
     * est rare — une création interrompue en plein vol — mais il ne doit
     * pas devenir une impasse muette : l'index partiel empêche de
     * redéposer tant que la demande est approuvée, et la personne
     * tournerait en rond sans comprendre.
     */
    if (demande?.status === "approuvee") {
      console.warn(
        `Demande approuvée sans autorisation utilisable — compte ${user.id}`
      )

      return NextResponse.json({
        ou: "demande-en-attente",
        note: "Votre demande a été acceptée, mais l'autorisation a déjà été utilisée sans qu'un établissement en soit sorti. Recontactez-nous : elle doit être réémise.",
      } satisfies Destination)
    }

    if (demande?.status === "refusee") {
      return NextResponse.json({
        ou: "demande-refusee",
        motif: demande.decision_note ?? null,
      } satisfies Destination)
    }

    // 5. Rien ne l'attend : qu'il demande un accès.
    return NextResponse.json({ ou: "demande-acces" } satisfies Destination)
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
