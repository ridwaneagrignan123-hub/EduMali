"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { supabase } from "@/src/lib/supabase"

/*
 * Les devoirs à la maison d'une classe.
 *
 * ---------------------------------------------------------------------
 * CE QUE L'ENSEIGNANT FAIT RÉELLEMENT
 *
 * Il dicte « page 42-43, exercices 3, 5 et 7 ». Parfois il recopie
 * l'énoncé, parfois il photographie la page du livre. Les trois moyens
 * coexistent, et l'écran ne force aucun des trois — mais il en exige
 * au moins un : un message disant « votre enfant a un devoir » sans
 * dire lequel occuperait l'attention de la famille sans rien lui
 * apprendre. La contrainte homework_contenu_utile le tient en base.
 * ---------------------------------------------------------------------
 *
 * LA PHOTO SUIT LE MODÈLE DES CARTES SCOLAIRES, à l'identique : bucket
 * public en lecture, chemin `{school_id}/…`. Ce chemin n'est pas un
 * rangement, c'est le cloisonnement lui-même — les policies comparent
 * son premier segment au school_id de l'appelant.
 */

type Matiere = {
  id: string
  name: string
}

type Devoir = {
  id: string
  due_date: string
  page: string | null
  exercises: string | null
  instructions: string | null
  photo_url: string | null
  subjects: { name: string } | null
}

/** Ce que la route d'envoi rapporte, et qu'on redit sans l'embellir. */
type ResultatEnvoi = {
  enFile: number
  ignores: number
  envoyes: number
  echecs: number
  statut: string
  raison: string | null
}

export function DevoirsMaison({
  schoolId,
  classId,
  className,
}: {
  schoolId: string
  classId: string
  className: string
}) {
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [devoirs, setDevoirs] = useState<Devoir[]>([])

  const [subjectId, setSubjectId] = useState("")
  const [dueDate, setDueDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [page, setPage] = useState("")
  const [exercises, setExercises] = useState("")
  const [instructions, setInstructions] = useState("")

  /* La photo choisie, pas encore envoyée — d'où l'aperçu local. */
  const [fichier, setFichier] = useState<File | null>(null)
  const [apercu, setApercu] = useState<string | null>(null)

  const [chargement, setChargement] = useState(true)
  const [enregistrement, setEnregistrement] = useState(false)
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null)

  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)

    const [matieresResultat, devoirsResultat] = await Promise.all([
      supabase
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .order("name"),

      supabase
        .from("homework")
        .select(
          "id, due_date, page, exercises, instructions, photo_url, subjects ( name )"
        )
        .eq("class_id", classId)
        .order("due_date", { ascending: false })
        .limit(20),
    ])

    if (matieresResultat.error || devoirsResultat.error) {
      console.error(
        "Erreur devoirs :",
        matieresResultat.error ?? devoirsResultat.error
      )
      setErreur("Les devoirs n'ont pas pu être chargés.")
    } else {
      setErreur(null)
      setMatieres((matieresResultat.data as Matiere[]) ?? [])
      setDevoirs((devoirsResultat.data as unknown as Devoir[]) ?? [])
    }

    setChargement(false)
  }, [schoolId, classId])

  useEffect(() => {
    async function lancer() {
      await charger()
    }

    lancer()
  }, [charger])

  /*
   * L'aperçu tient dans un objet URL local : il montre la photo AVANT
   * qu'elle parte, pour qu'on voie qu'on a photographié la bonne page.
   * On le révoque au changement, sinon chaque essai laisse un blob en
   * mémoire jusqu'au rechargement.
   */
  function choisirPhoto(file: File | null) {
    setApercu((ancien) => {
      if (ancien) {
        URL.revokeObjectURL(ancien)
      }

      return file ? URL.createObjectURL(file) : null
    })

    setFichier(file)
  }

  async function enregistrerDevoir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const rienDeSaisi =
      !page.trim() && !exercises.trim() && !instructions.trim() && !fichier

    if (rienDeSaisi) {
      setErreur(
        "Indiquez au moins une page, des exercices, l'énoncé ou une photo — sinon le message aux parents ne dirait rien."
      )
      return
    }

    setEnregistrement(true)
    setErreur(null)
    setMessage(null)

    let photoUrl: string | null = null

    if (fichier) {
      /*
       * Le chemin commence par le school_id : c'est ce que les policies
       * du bucket comparent. Un identifiant aléatoire ensuite, pour que
       * deux photos du même jour ne s'écrasent pas.
       */
      const extension = fichier.name.split(".").pop()?.toLowerCase() || "jpg"
      const chemin = `${schoolId}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from("homework-photos")
        .upload(chemin, fichier, {
          contentType: fichier.type || "image/jpeg",
          upsert: false,
        })

      if (uploadError) {
        console.error("Erreur envoi de la photo :", uploadError)
        setErreur(`L'envoi de la photo a échoué : ${uploadError.message}`)
        setEnregistrement(false)
        return
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("homework-photos").getPublicUrl(chemin)

      photoUrl = publicUrl
    }

    const { error } = await supabase.from("homework").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId || null,
      due_date: dueDate,
      page: page.trim() || null,
      exercises: exercises.trim() || null,
      instructions: instructions.trim() || null,
      photo_url: photoUrl,
    })

    setEnregistrement(false)

    if (error) {
      console.error("Erreur devoir :", error)
      setErreur(error.message)
      return
    }

    setPage("")
    setExercises("")
    setInstructions("")
    choisirPhoto(null)
    setMessage("Devoir enregistré.")

    await charger()
  }

  /*
   * L'envoi passe par la route serveur, qui met UN message par élève
   * dans la file. Le bouton se désactive le temps de l'aller-retour :
   * un double-clic sur une classe de cinquante enverrait cent messages.
   */
  async function envoyerAuxParents(devoir: Devoir) {
    setEnvoiEnCours(devoir.id)
    setErreur(null)
    setMessage(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setErreur("Votre session a expiré. Reconnectez-vous.")
        return
      }

      const response = await fetch("/api/homework/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ homeworkId: devoir.id }),
      })

      const resultat = (await response.json()) as ResultatEnvoi & {
        error?: string
      }

      if (!response.ok) {
        setErreur(resultat.error ?? "L'envoi a échoué.")
        return
      }

      /*
       * On dit ce qui s'est réellement passé. Tant qu'aucun fournisseur
       * n'est branché, « enregistré, en attente » — jamais « envoyé ».
       */
      const compte = `${resultat.enFile} message(s) enregistré(s)${
        resultat.ignores > 0
          ? `, ${resultat.ignores} élève(s) ignoré(s) faute de numéro parent`
          : ""
      }${resultat.echecs > 0 ? `, ${resultat.echecs} en échec` : ""}.`

      setMessage(
        resultat.statut === "sent"
          ? `${compte} Messages envoyés.`
          : `${compte} En attente : ${
              resultat.raison ?? "aucun fournisseur WhatsApp n'est branché."
            }`
      )
    } catch (error) {
      console.error("Erreur envoi devoir :", error)
      setErreur("Le serveur n'a pas répondu.")
    } finally {
      setEnvoiEnCours(null)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">
          Donner un devoir — {className}
        </h3>

        <form onSubmit={enregistrerDevoir} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="devoir-matiere">Matière</label>

            <select
              id="devoir-matiere"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              <option value="">Sans matière précise</option>

              {matieres.map((matiere) => (
                <option key={matiere.id} value={matiere.id}>
                  {matiere.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="devoir-date">Pour le</label>

            <input
              id="devoir-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="devoir-page">Page</label>

              <input
                id="devoir-page"
                value={page}
                onChange={(event) => setPage(event.target.value)}
                placeholder="42 ou 42-43"
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="devoir-exercices">Exercices</label>

              <input
                id="devoir-exercices"
                value={exercises}
                onChange={(event) => setExercises(event.target.value)}
                placeholder="3, 5 et 7"
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="devoir-enonce">Énoncé recopié</label>

            <textarea
              id="devoir-enonce"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              placeholder="Facultatif — utile quand l'élève n'a pas le livre."
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="devoir-photo">Photo de l&apos;exercice</label>

            <input
              id="devoir-photo"
              type="file"
              accept="image/*"
              onChange={(event) =>
                choisirPhoto(event.target.files?.[0] ?? null)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />

            {apercu && (
              <div className="space-y-2">
                {/*
                  Aperçu AVANT envoi : on vérifie qu'on a photographié la
                  bonne page. Balise <img> et non next/image, comme pour
                  les cartes scolaires : la source est un blob local, que
                  l'optimiseur ne sait pas traiter.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={apercu}
                  alt="Aperçu de la photo du devoir avant envoi"
                  className="max-h-48 w-auto rounded-md border object-contain"
                />

                <button
                  type="button"
                  onClick={() => choisirPhoto(null)}
                  className="text-xs text-muted-foreground underline"
                >
                  Retirer la photo
                </button>
              </div>
            )}
          </div>

          {erreur && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </div>
          )}

          {message && (
            <p className="rounded-lg border p-3 text-sm">{message}</p>
          )}

          <button
            type="submit"
            disabled={enregistrement}
            className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {enregistrement ? "Enregistrement..." : "Enregistrer le devoir"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border bg-background p-6">
        <h3 className="text-lg font-semibold">Devoirs récents</h3>

        <p className="mt-1 text-sm text-muted-foreground">
          L&apos;envoi produit <strong>un message par parent</strong> : sur
          une classe de cinquante, cinquante messages partent en file.
        </p>

        {chargement ? (
          <p className="mt-6 text-sm text-muted-foreground">Chargement...</p>
        ) : devoirs.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Aucun devoir enregistré pour cette classe.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {devoirs.map((devoir) => (
              <div key={devoir.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-medium">
                      {devoir.subjects?.name ?? "Sans matière"} — pour le{" "}
                      {new Date(
                        `${devoir.due_date}T00:00:00`
                      ).toLocaleDateString("fr-FR")}
                    </p>

                    {(devoir.page || devoir.exercises) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {devoir.page ? `Page ${devoir.page}` : ""}
                        {devoir.page && devoir.exercises ? " — " : ""}
                        {devoir.exercises
                          ? `Exercices ${devoir.exercises}`
                          : ""}
                      </p>
                    )}

                    {devoir.instructions && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {devoir.instructions}
                      </p>
                    )}

                    {devoir.photo_url && (
                      <a
                        href={devoir.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-primary underline"
                      >
                        Voir la photo
                      </a>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => envoyerAuxParents(devoir)}
                    disabled={envoiEnCours === devoir.id}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {envoiEnCours === devoir.id
                      ? "Envoi..."
                      : "Envoyer aux parents par WhatsApp"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
