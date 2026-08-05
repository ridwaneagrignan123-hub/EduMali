import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { exigerExploitant } from "@/src/lib/exploitant"

/*
 * Le catalogue d'annales, côté EXPLOITANT.
 *
 * =====================================================================
 * TOUTE L'ÉCRITURE PASSE ICI
 * =====================================================================
 *
 * `exam_resources` n'a aucune policy d'écriture — pas une seule. Ce
 * fichier est donc le seul chemin par lequel une entrée peut naître,
 * changer ou disparaître, et il est gardé par `exigerExploitant()`.
 *
 * Ce n'est pas de la méfiance envers les écoles : un catalogue public
 * partagé par toute la région ne peut pas avoir mille auteurs. Un sujet
 * faux déposé par une école se lirait comme une annale officielle dans
 * quinze pays.
 *
 * =====================================================================
 * LES CONTRAINTES SONT VÉRIFIÉES DEUX FOIS, ET C'EST VOULU
 * =====================================================================
 *
 * La base refuse déjà une entrée sans document et une annale sans
 * année. On les revérifie ici — non par méfiance envers PostgreSQL, mais
 * parce qu'une violation de contrainte remonte en anglais et en jargon
 * (`new row violates check constraint "porte_un_document"`), ce qui
 * n'apprend rien à qui remplit le formulaire.
 *
 * La base reste la garantie ; ce qui est ici n'est que la phrase
 * lisible. Si les deux divergent un jour, c'est la base qui a raison.
 */

const EXAMENS = ["DEF", "BEPC", "BAC", "CEP"]
const GENRES = ["annale", "exercice"]

const PAYS = [
  "MLI", "SEN", "BFA", "CIV", "NER", "TGO", "BEN", "GIN",
  "GNB", "SLE", "LBR", "GHA", "NGA", "GMB", "CPV", "MRT",
]

/*
 * 20 Mo. Un sujet d'examen scanné dépasse rarement 5 Mo ; au-delà de 20
 * on tient un scan non compressé, que personne n'ouvrira sur une 3G.
 * Refuser tôt vaut mieux que déposer un fichier inutilisable.
 */
const TAILLE_MAX = 20 * 1024 * 1024

function texte(donnees: FormData, champ: string) {
  const valeur = donnees.get(champ)
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null
}

/**
 * Dépose un PDF dans le bucket public `annales` et rend son URL.
 *
 * Le nom du fichier déposé est ENGENDRÉ, jamais repris de celui que
 * l'utilisateur a choisi : un nom d'origine peut contenir des accents,
 * des espaces, des barres obliques — et deux sujets appelés
 * « sujet.pdf » s'écraseraient l'un l'autre.
 */
async function deposer(fichier: File, prefixe: string) {
  if (fichier.size > TAILLE_MAX) {
    return {
      erreur: `« ${fichier.name} » dépasse 20 Mo. Compressez le PDF avant de le déposer.`,
    }
  }

  const chemin = `${prefixe}/${crypto.randomUUID()}.pdf`

  const { error } = await supabaseAdmin.storage
    .from("annales")
    .upload(chemin, fichier, {
      contentType: fichier.type || "application/pdf",
      upsert: false,
    })

  if (error) {
    console.error("Dépôt d'un fichier d'annale :", error)
    return { erreur: "Le fichier n'a pas pu être déposé." }
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("annales").getPublicUrl(chemin)

  return { url: publicUrl }
}

/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  try {
    const garde = await exigerExploitant(request)

    if (!garde.ok) {
      return garde.response
    }

    /*
     * L'exploitant voit AUSSI les entrées désactivées — ce sont
     * précisément celles sur lesquelles il a quelque chose à faire
     * (un lien mort à remplacer, un sujet à remettre en ligne).
     */
    const { data, error } = await supabaseAdmin
      .from("exam_resources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("Lecture du catalogue :", error)

      return NextResponse.json(
        { error: "Le catalogue n'a pas pu être lu." },
        { status: 500 }
      )
    }

    return NextResponse.json({ ressources: data ?? [] })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const garde = await exigerExploitant(request)

    if (!garde.ok) {
      return garde.response
    }

    const donnees = await request.formData()

    const kind = texte(donnees, "kind")
    const exam = texte(donnees, "exam")
    const subject = texte(donnees, "subject")
    const title = texte(donnees, "title")
    const anneeBrute = texte(donnees, "year")
    const country = texte(donnees, "country")
    const lien = texte(donnees, "link_url")

    if (!kind || !GENRES.includes(kind)) {
      return NextResponse.json({ error: "Type inconnu." }, { status: 400 })
    }

    if (!exam || !EXAMENS.includes(exam)) {
      return NextResponse.json({ error: "Examen inconnu." }, { status: 400 })
    }

    if (country && !PAYS.includes(country)) {
      return NextResponse.json({ error: "Pays inconnu." }, { status: 400 })
    }

    if (!subject || !title) {
      return NextResponse.json(
        { error: "La matière et le titre sont obligatoires." },
        { status: 400 }
      )
    }

    const year = anneeBrute ? Number(anneeBrute) : null

    if (year !== null && (!Number.isInteger(year) || year < 1960 || year > 2100)) {
      return NextResponse.json({ error: "Année invalide." }, { status: 400 })
    }

    if (kind === "annale" && year === null) {
      return NextResponse.json(
        { error: "Une annale porte l'année de sa session." },
        { status: 400 }
      )
    }

    /*
     * On refuse un lien qui n'est pas http(s) AVANT de l'enregistrer :
     * un « javascript: » posé dans le catalogue serait servi tel quel
     * dans le href d'une page publique.
     */
    if (lien) {
      let protocole: string

      try {
        protocole = new URL(lien).protocol
      } catch {
        return NextResponse.json(
          { error: "Le lien n'est pas une adresse valide." },
          { status: 400 }
        )
      }

      if (protocole !== "http:" && protocole !== "https:") {
        return NextResponse.json(
          { error: "Le lien doit commencer par http:// ou https://." },
          { status: 400 }
        )
      }
    }

    const sujet = donnees.get("sujet")
    const corrige = donnees.get("corrige")

    let fileUrl: string | null = null
    let correctionUrl: string | null = null

    if (sujet instanceof File && sujet.size > 0) {
      const depot = await deposer(sujet, "sujets")

      if (depot.erreur) {
        return NextResponse.json({ error: depot.erreur }, { status: 400 })
      }

      fileUrl = depot.url ?? null
    }

    if (corrige instanceof File && corrige.size > 0) {
      const depot = await deposer(corrige, "corriges")

      if (depot.erreur) {
        return NextResponse.json({ error: depot.erreur }, { status: 400 })
      }

      correctionUrl = depot.url ?? null
    }

    if (!fileUrl && !lien) {
      return NextResponse.json(
        { error: "Déposez un fichier ou donnez un lien : une entrée doit mener quelque part." },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from("exam_resources")
      .insert({
        kind,
        exam,
        country,
        serie: texte(donnees, "serie"),
        subject,
        year,
        title,
        file_url: fileUrl,
        correction_file_url: correctionUrl,
        link_url: lien,
        source_name: texte(donnees, "source_name"),
      })
      .select("id")
      .single()

    if (error) {
      console.error("Ajout au catalogue :", error)

      return NextResponse.json(
        { error: "L'entrée n'a pas pu être enregistrée." },
        { status: 500 }
      )
    }

    return NextResponse.json({ id: data.id })
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

    if (!body.id || typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Requête incomplète." }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("exam_resources")
      .update({ is_active: body.is_active })
      .eq("id", body.id)

    if (error) {
      console.error("Mise à jour du catalogue :", error)

      return NextResponse.json(
        { error: "Le changement n'a pas pu être enregistré." },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}

/*
 * La suppression est VRAIE ici, contrairement aux paiements ou aux
 * retenues. Une entrée de catalogue n'engage personne : la retirer ne
 * prive aucun élève d'un droit et ne se conteste pas. Ce qu'on veut
 * garder — un lien mort le temps de le remplacer — se garde en
 * désactivant, ce que fait PATCH.
 */
export async function DELETE(request: Request) {
  try {
    const garde = await exigerExploitant(request)

    if (!garde.ok) {
      return garde.response
    }

    const id = new URL(request.url).searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Entrée manquante." }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("exam_resources")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Suppression dans le catalogue :", error)

      return NextResponse.json(
        { error: "L'entrée n'a pas pu être supprimée." },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
