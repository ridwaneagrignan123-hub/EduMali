import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"
import { assignableRoles, roleLabel } from "@/src/lib/roles"
import { isFiliere } from "@/src/lib/etablissement"
import { formaterNom, formaterPrenom } from "@/src/lib/noms"
import { lienAcces, origineDuSite } from "@/src/lib/lien-acces"

/*
 * Distingue un refus d'ACHEMINEMENT d'une vraie erreur de création. Dans
 * le premier cas le compte doit quand même exister : sans quoi une
 * limite d'envoi — quelques messages par heure sur la messagerie
 * intégrée — empêcherait de créer le troisième membre de la journée.
 *
 * Repris du flux enseignant, dont cette route emprunte la mécanique.
 */
function isMailDeliveryFailure(error: { code?: string; status?: number }) {
  const mailCodes = [
    "over_email_send_rate_limit",
    "email_address_invalid",
    "unexpected_failure",
  ]

  return (
    (error.code && mailCodes.includes(error.code)) ||
    error.status === 429 ||
    error.status === 500
  )
}

/*
 * Liste les comptes de l'école de l'admin appelant.
 *
 * Les emails et l'état d'invitation vivent dans auth.users, pas dans
 * profiles : on complète donc les profils avec les données Auth.
 */

const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 20

type AuthInfo = {
  email: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  bannedUntil: string | null
}

/*
 * listUsers() parcourt tous les comptes du projet Supabase, toutes écoles
 * confondues : on s'arrête dès que les identifiants recherchés sont résolus.
 * À surveiller si le nombre total d'écoles devient important.
 */
async function loadAuthInfoByUserId(userIds: string[]) {
  const wanted = new Set(userIds)
  const found = new Map<string, AuthInfo>()

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    })

    if (error) {
      console.error("Erreur listUsers :", error)
      return found
    }

    const users = data.users ?? []

    for (const authUser of users) {
      if (!wanted.has(authUser.id)) {
        continue
      }

      found.set(authUser.id, {
        email: authUser.email ?? null,
        lastSignInAt: authUser.last_sign_in_at ?? null,
        emailConfirmedAt: authUser.email_confirmed_at ?? null,
        bannedUntil:
          (authUser as { banned_until?: string }).banned_until ?? null,
      })
    }

    if (found.size >= wanted.size || users.length < AUTH_USERS_PAGE_SIZE) {
      break
    }
  }

  return found
}

export async function GET(request: Request) {
  try {
    const guard = await requirePermission(request, "comptes.consulter")

    if (!guard.ok) {
      return guard.response
    }

    const { context } = guard

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, last_name, role, phone, is_active, created_at, direction_id, filiere, cycle"
      )
      .eq("school_id", context.schoolId)
      .order("last_name", { ascending: true })

    if (profilesError) {
      console.error("Erreur lecture des profils :", profilesError)

      return NextResponse.json(
        { error: "Impossible de charger la liste des comptes." },
        { status: 500 }
      )
    }

    const rows = profiles ?? []

    const authInfoByUserId = await loadAuthInfoByUserId(
      rows.map((row) => row.id)
    )

    const now = Date.now()

    const users = rows.map((row) => {
      const authInfo = authInfoByUserId.get(row.id) ?? null

      const isBanned =
        authInfo?.bannedUntil != null &&
        new Date(authInfo.bannedUntil).getTime() > now

      return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        directionId: row.direction_id,
        filiere: row.filiere,
        cycle: row.cycle,
        phone: row.phone,
        isActive: row.is_active,
        createdAt: row.created_at,
        email: authInfo?.email ?? null,
        lastSignInAt: authInfo?.lastSignInAt ?? null,
        // Jamais connecté : l'invitation n'a pas encore été acceptée.
        hasSignedIn: Boolean(authInfo?.lastSignInAt),
        isBanned,
        // Un admin ne peut pas agir sur son propre compte.
        isSelf: row.id === context.userId,
      }
    })

    return NextResponse.json({ users }, { status: 200 })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

/* =====================================================================
 * CRÉATION D'UN MEMBRE DU PERSONNEL
 * =====================================================================
 *
 * Ce qui manquait, et qui bloquait toute école neuve : la page Comptes
 * ne savait qu'attribuer un rôle à un compte DÉJÀ existant. Sur un
 * établissement qui vient d'ouvrir, le promoteur est seul — il n'avait
 * donc personne à nommer, et aucun moyen d'en faire venir un.
 *
 * ---------------------------------------------------------------------
 * DEUX GARDES, QUI NE FONT PAS LE MÊME TRAVAIL
 *
 *   1. `comptes.gerer` dit qui peut ouvrir cette porte.
 *   2. `assignableRoles()` — la table NOMINE — dit ce qu'on peut créer
 *      une fois entré.
 *
 * Le second est celui qui compte. Sans lui, un directeur de direction,
 * qui détient `comptes.gerer`, se fabriquerait un directeur général.
 * Créer un compte EST une attribution de rôle : cela passe donc par
 * exactement la même table que la nomination d'un compte existant, et
 * non par une liste parallèle qui aurait fini par diverger — et l'écart
 * aurait été une élévation de privilège silencieuse.
 * ---------------------------------------------------------------------
 *
 * LE MÉCANISME DE CRÉATION EST CELUI DES ENSEIGNANTS, repris tel quel :
 * `inviteUserByEmail`, repli sur `generateLink` quand la messagerie
 * refuse, puis la ligne `profiles` écrite à la clé service — seule façon
 * de poser `school_id` et `role`, que le déclencheur anti-escalade
 * interdit à tout autre appelant.
 *
 * Le lien rendu est le lien ROBUSTE (src/lib/lien-acces.ts), celui que
 * les antivirus des messageries ne consomment pas avant son
 * destinataire.
 */

const DIRECTION_SCOPED_ROLE = "directeur_direction"
const CYCLE_SCOPED_ROLE = "surveillant"
const CYCLES_ADMIS = ["premier_cycle", "second_cycle", "lycee"]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_CHIFFRES = 8

function texte(valeur: unknown) {
  return typeof valeur === "string" ? valeur.trim() : ""
}

export async function POST(request: Request) {
  try {
    const guard = await requirePermission(request, "comptes.gerer")

    if (!guard.ok) {
      return guard.response
    }

    const { schoolId, role: monRole } = guard.context

    const body = await request.json()

    const firstName = texte(body.firstName)
    const lastName = texte(body.lastName)
    const email = texte(body.email).toLowerCase()
    const role = texte(body.role)
    const phone = texte(body.phone)

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Le prénom et le nom sont obligatoires." },
        { status: 400 }
      )
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        {
          error:
            "Une adresse email valide est obligatoire : c'est l'identifiant de connexion.",
        },
        { status: 400 }
      )
    }

    // LE GARDE QUI COMPTE — voir la note ci-dessus.
    const nominables = assignableRoles(monRole)

    if (!nominables.includes(role)) {
      return NextResponse.json(
        {
          error: `Votre rôle ne permet pas de créer un compte « ${roleLabel(role)} ».`,
        },
        { status: 403 }
      )
    }

    /*
     * Le PÉRIMÈTRE, pour les rôles qui en ont un — mêmes règles que la
     * modification d'un compte. Un directeur sans direction ou un
     * surveillant sans cycle ne verrait aucune donnée, et le manque ne
     * se découvrirait qu'à sa première connexion.
     */
    let directionId: string | null = null
    let filiere: string | null = null
    let cycle: string | null = null

    if (role === DIRECTION_SCOPED_ROLE) {
      directionId = texte(body.directionId) || null

      if (!directionId) {
        return NextResponse.json(
          {
            error:
              "Choisissez la direction de ce directeur : sans elle, il n'aurait accès à aucune donnée.",
          },
          { status: 400 }
        )
      }

      /*
       * La direction doit appartenir à l'école de l'appelant. La clé
       * service contourne le RLS : ce filtre est la seule frontière.
       */
      const { data: direction } = await supabaseAdmin
        .from("directions")
        .select("id")
        .eq("id", directionId)
        .eq("school_id", schoolId)
        .maybeSingle()

      if (!direction) {
        return NextResponse.json(
          { error: "Cette direction n'appartient pas à votre établissement." },
          { status: 400 }
        )
      }

      if (body.filiere !== undefined && body.filiere !== null && body.filiere !== "") {
        if (!isFiliere(body.filiere)) {
          return NextResponse.json(
            { error: "Filière inconnue." },
            { status: 400 }
          )
        }

        filiere = body.filiere
      }
    }

    if (role === CYCLE_SCOPED_ROLE) {
      cycle = texte(body.cycle) || null

      if (!cycle || !CYCLES_ADMIS.includes(cycle)) {
        return NextResponse.json(
          {
            error:
              "Choisissez le cycle de ce surveillant : sans lui, il ne verrait aucune classe.",
          },
          { status: 400 }
        )
      }
    }

    /*
     * L'ENSEIGNANT A BESOIN D'UNE FICHE, pas seulement d'un compte.
     *
     * Sans elle, le compte existerait sans pouvoir être affecté à une
     * classe, ni pointé, ni payé : un accès qui ne mène nulle part. On
     * crée donc la fiche dans le même geste — et le numéro WhatsApp
     * devient obligatoire, comme partout où une fiche enseignant naît.
     */
    if (role === "teacher" && phone.replace(/\D/g, "").length < MIN_CHIFFRES) {
      return NextResponse.json(
        {
          error:
            "Le numéro WhatsApp est obligatoire pour un enseignant, et doit comporter au moins 8 chiffres.",
        },
        { status: 400 }
      )
    }

    const origine = origineDuSite(request)
    const redirectTo = `${origine}/update-password`

    const metadata = {
      first_name: formaterPrenom(firstName),
      last_name: formaterNom(lastName),
      role,
    }

    let userId: string
    let accessLink: string | null = null
    let emailAttempted = true
    let deliveryNote: string | null = null

    const { data: invited, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: metadata,
        redirectTo,
      })

    if (inviteError) {
      if (!isMailDeliveryFailure(inviteError)) {
        console.error("Erreur invitation :", inviteError)

        return NextResponse.json(
          { error: inviteError.message },
          { status: 400 }
        )
      }

      const { data: generated, error: generateError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { data: metadata, redirectTo },
        })

      if (generateError || !generated?.user) {
        console.error("Erreur création du compte :", generateError)

        return NextResponse.json(
          {
            error:
              "Le compte n'a pas pu être créé : " +
              (generateError?.message ?? "raison inconnue"),
          },
          { status: 400 }
        )
      }

      userId = generated.user.id
      accessLink = lienAcces(
        origine,
        generated.properties?.hashed_token,
        "invite"
      )
      emailAttempted = false
      deliveryNote = inviteError.message
    } else {
      if (!invited.user) {
        return NextResponse.json(
          { error: "Le compte n'a pas pu être créé." },
          { status: 500 }
        )
      }

      userId = invited.user.id

      /*
       * Lien de secours, à transmettre si le courriel n'arrive pas. Le
       * jeton de récupération est distinct de celui de l'invitation : en
       * produire un ici n'invalide pas le lien contenu dans le message.
       */
      const { data: generated } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      })

      accessLink = lienAcces(
        origine,
        generated?.properties?.hashed_token,
        "recovery"
      )
    }

    /*
     * `school_id` et `role` sont posés ICI, à la clé service. Le
     * déclencheur prevent_profile_privilege_escalation interdit à tout
     * autre appelant de les écrire — c'est précisément ce qui empêche
     * quelqu'un de se rattacher lui-même à une école ou de se donner un
     * rôle.
     */
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        school_id: schoolId,
        first_name: metadata.first_name,
        last_name: metadata.last_name,
        role,
        direction_id: directionId,
        filiere,
        cycle,
        phone: phone || null,
        is_active: true,
      })

    if (profileError) {
      console.error("Erreur création du profil :", profileError)

      return NextResponse.json(
        {
          error:
            "Le compte a été créé, mais son profil n'a pas pu être enregistré.",
          details: profileError.message,
        },
        { status: 500 }
      )
    }

    if (role === "teacher") {
      const { error: ficheError } = await supabaseAdmin
        .from("teachers")
        .insert({
          school_id: schoolId,
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          email,
          phone,
          status: "active",
          profile_id: userId,
        })

      if (ficheError) {
        console.error("Erreur création de la fiche enseignant :", ficheError)

        /*
         * Le déclencheur teachers_whatsapp_unique rend une phrase
         * lisible, nommant qui détient déjà le numéro. On la transmet
         * telle quelle plutôt que de la remplacer par un message
         * générique moins utile.
         */
        return NextResponse.json(
          {
            error:
              ficheError.code === "P0001"
                ? ficheError.message
                : "Le compte a été créé, mais la fiche enseignant n'a pas pu l'être. Complétez-la depuis la page Enseignants.",
          },
          { status: ficheError.code === "P0001" ? 409 : 500 }
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        email,
        emailAttempted,
        deliveryNote,
        accessLink,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
