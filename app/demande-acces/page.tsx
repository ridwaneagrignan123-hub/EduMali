"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"
import { SCHOOL_TYPES, SCHOOL_TYPE_LABELS } from "@/src/lib/etablissement"

/*
 * Demande d'accès d'une école candidate.
 *
 * ---------------------------------------------------------------------
 * DEUX ÉTATS, ET UNE SEULE RAISON
 *
 * Non connecté : un bouton, « Continuer avec Google ». Connecté : le
 * formulaire.
 *
 * Cet ordre n'est pas cosmétique. L'autorisation émise en cas d'accord
 * est NOMINATIVE PAR EMAIL, et cette adresse doit être PROUVÉE, pas
 * saisie. Demander l'identité avant le formulaire, c'est ce qui empêche
 * quelqu'un de déposer une demande au nom de l'école d'à côté et de
 * récupérer son autorisation.
 *
 * L'adresse s'affiche donc en lecture seule : elle vient de la session,
 * et le serveur la relit de son côté sans jamais regarder le formulaire.
 * ---------------------------------------------------------------------
 *
 * Rien n'est créé ici : ni compte d'école, ni établissement. La page
 * dépose une demande dans une file, que l'exploitant examine.
 */

type Etat =
  | { statut: "chargement" }
  | { statut: "anonyme" }
  | { statut: "connecte"; email: string }
  | { statut: "recue" }

export default function DemandeAccesPage() {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>({ statut: "chargement" })

  const [schoolName, setSchoolName] = useState("")
  const [city, setCity] = useState("")
  const [schoolType, setSchoolType] = useState("classique")
  const [phone, setPhone] = useState("")
  const [promoterName, setPromoterName] = useState("")

  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const examiner = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setEtat({ statut: "anonyme" })
      return
    }

    /*
     * Déjà une demande, une école ou une autorisation ? Le serveur le
     * sait, et il vaut mieux le renvoyer là où il doit aller que de lui
     * proposer un formulaire qui sera refusé.
     */
    const response = await fetch("/api/auth/destination", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (response.ok) {
      const destination = await response.json()

      if (destination.ou === "exploitant") {
        router.push("/exploitant")
        return
      }

      if (destination.ou === "espace") {
        router.push("/dashboard")
        return
      }

      if (destination.ou === "setup-school") {
        router.push("/setup-school")
        return
      }

      if (
        destination.ou === "demande-en-attente" ||
        destination.ou === "demande-refusee"
      ) {
        router.push("/auth/callback")
        return
      }
    }

    setEtat({ statut: "connecte", email: session.user.email ?? "" })
  }, [router])

  useEffect(() => {
    async function lancer() {
      await examiner()
    }

    lancer()
  }, [examiner])

  async function continuerAvecGoogle() {
    setErreur(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Retour ICI : la personne reprend là où elle s'est arrêtée,
        // avec son adresse désormais prouvée.
        redirectTo: `${window.location.origin}/demande-acces`,
      },
    })

    if (error) {
      console.error("Erreur connexion Google :", error)
      setErreur(
        "La connexion Google n'a pas pu démarrer. Réessayez dans un instant."
      )
    }
  }

  async function deposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setEnvoi(true)
    setErreur(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setEtat({ statut: "anonyme" })
        return
      }

      const response = await fetch("/api/school-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        /*
         * Aucune adresse ici, délibérément. Le serveur la lit sur la
         * session : ce corps ne porte que des faits sur l'établissement.
         */
        body: JSON.stringify({
          schoolName,
          city,
          schoolType,
          phone,
          promoterName,
        }),
      })

      const resultat = await response.json()

      if (!response.ok) {
        setErreur(resultat.error ?? "Votre demande n'a pas pu être envoyée.")
        return
      }

      setEtat({ statut: "recue" })
    } catch (error) {
      console.error("Erreur dépôt :", error)
      setErreur("Le serveur n'a pas répondu. Réessayez.")
    } finally {
      setEnvoi(false)
    }
  }

  if (etat.statut === "chargement") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <p className="text-muted-foreground">Chargement...</p>
      </main>
    )
  }

  if (etat.statut === "recue") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-6">
          <Logo />

          <h1 className="mt-6 text-xl font-bold">Demande reçue</h1>

          <p className="mt-3 text-muted-foreground">
            Nous vous recontacterons au numéro indiqué. Si votre demande est
            acceptée, l&apos;autorisation sera rattachée au compte avec lequel
            vous venez de vous identifier — reconnectez-vous alors avec le
            même, et vous pourrez ouvrir votre établissement.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="mt-6 rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour à la connexion
          </button>
        </div>
      </main>
    )
  }

  if (etat.statut === "anonyme") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-6">
          <Logo />

          <h1 className="mt-6 text-2xl font-bold">Demander un accès</h1>

          <p className="mt-3 text-sm text-muted-foreground">
            Ridwane ne s&apos;ouvre pas librement : chaque établissement
            entre par une autorisation nominative. Cette page transmet
            votre demande, nous vous recontactons, et l&apos;ouverture se
            fait ensuite avec cette autorisation.
          </p>

          {/*
            L'identité AVANT le formulaire. L'autorisation sera rattachée
            à l'adresse prouvée ici : la demander d'abord est ce qui
            empêche de déposer au nom d'une autre école.
          */}
          <p className="mt-4 text-sm text-muted-foreground">
            Commencez par vous identifier. L&apos;autorisation sera
            rattachée à cette adresse, et à elle seule.
          </p>

          {erreur && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </div>
          )}

          <button
            onClick={continuerAvecGoogle}
            className="mt-6 w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground"
          >
            Continuer avec Google
          </button>

          <button
            onClick={() => router.push("/login")}
            className="mt-3 w-full text-sm text-muted-foreground underline"
          >
            J&apos;ai déjà un compte
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg rounded-xl border bg-background p-6">
        <Logo />

        <h1 className="mt-6 text-2xl font-bold">Votre établissement</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Ces informations servent à examiner votre demande. Rien
          n&apos;est créé pour l&apos;instant.
        </p>

        <form onSubmit={deposer} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="email">Votre adresse</label>

            {/*
              En lecture seule, et pas seulement à l'écran : le serveur
              ne lit même pas ce champ. Il relit l'adresse sur la
              session, parce que c'est elle qui recevra l'autorisation.
            */}
            <input
              id="email"
              value={etat.email}
              readOnly
              disabled
              className="w-full rounded-md border bg-muted px-3 py-2 text-muted-foreground"
            />

            <p className="text-xs text-muted-foreground">
              Issue de votre connexion. L&apos;autorisation lui sera
              rattachée.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="ecole">Nom de l&apos;établissement *</label>

            <input
              id="ecole"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="ville">Ville *</label>

            <input
              id="ville"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              required
              placeholder="Exemple : Bamako"
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="type">Type d&apos;établissement *</label>

            <select
              id="type"
              value={schoolType}
              onChange={(event) => setSchoolType(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              {SCHOOL_TYPES.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {SCHOOL_TYPE_LABELS[valeur]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="tel">Numéro WhatsApp *</label>

            <input
              id="tel"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              placeholder="Exemple : 76 00 00 00"
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="promoteur">Nom du promoteur *</label>

            <input
              id="promoteur"
              value={promoterName}
              onChange={(event) => setPromoterName(event.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          {erreur && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={envoi}
            className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {envoi ? "Envoi..." : "Envoyer ma demande"}
          </button>
        </form>
      </div>
    </main>
  )
}
