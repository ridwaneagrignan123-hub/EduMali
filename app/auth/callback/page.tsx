"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"

/*
 * Retour de la connexion Google — l'aiguillage.
 *
 * ---------------------------------------------------------------------
 * CE QUI A CHANGÉ, ET POURQUOI
 *
 * Cette page DÉCONNECTAIT autrefois tout compte Google rattaché à aucune
 * école : l'inscription publique n'existait pas, et laisser entrer un
 * inconnu l'aurait ouverte par la porte de service.
 *
 * Depuis que la demande d'accès existe, un inconnu n'est plus une
 * anomalie : c'est une école candidate qui n'a pas encore déposé sa
 * demande. Le déconnecter reviendrait à lui claquer la porte au moment
 * précis où il vient frapper. Il est donc aiguillé, pas éconduit.
 *
 * Ce qui n'a PAS changé : Google ne crée toujours aucune école. Il prouve
 * une adresse, rien de plus. La création reste fermée derrière une
 * autorisation nominative.
 * ---------------------------------------------------------------------
 *
 * L'ORDRE est décidé côté serveur, dans /api/auth/destination, parce
 * qu'il dépend de `school_creation_grants` — table que le navigateur ne
 * peut pas lire, et ne doit pas pouvoir sonder.
 */

type Etat =
  | { statut: "verification" }
  | { statut: "en_attente"; note: string | null }
  | { statut: "refuse"; motif: string | null }
  | { statut: "erreur"; message: string }

export default function AuthCallbackPage() {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>({ statut: "verification" })

  useEffect(() => {
    let annule = false

    async function verifier() {
      /*
       * Le client échange le code de l'URL au chargement. On laisse la
       * session s'établir avant de lire quoi que ce soit, sinon on
       * conclurait à un échec sur une simple course.
       */
      let session = null

      for (let essai = 0; essai < 12 && !session; essai++) {
        const { data } = await supabase.auth.getSession()
        session = data.session

        if (!session) {
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }

      if (annule) {
        return
      }

      if (!session) {
        setEtat({
          statut: "erreur",
          message:
            "La connexion Google n'a pas abouti. Réessayez, ou utilisez votre adresse et votre mot de passe.",
        })
        return
      }

      const response = await fetch("/api/auth/destination", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (annule) {
        return
      }

      if (!response.ok) {
        setEtat({
          statut: "erreur",
          message:
            "Votre accès n'a pas pu être vérifié. Réessayez dans un instant.",
        })
        return
      }

      const destination = await response.json()

      if (annule) {
        return
      }

      switch (destination.ou) {
        case "espace":
          router.push("/dashboard")
          router.refresh()
          return

        case "setup-school":
          router.push("/setup-school")
          return

        case "demande-en-attente":
          setEtat({ statut: "en_attente", note: destination.note ?? null })
          return

        case "demande-refusee":
          setEtat({ statut: "refuse", motif: destination.motif ?? null })
          return

        default:
          router.push("/demande-acces")
      }
    }

    verifier()

    return () => {
      annule = true
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        <div className="rounded-xl border bg-background p-6">
          {etat.statut === "verification" && (
            <p className="text-muted-foreground">
              Vérification de votre accès...
            </p>
          )}

          {etat.statut === "en_attente" && (
            <>
              <h1 className="font-heading text-xl font-bold">
                Votre demande est enregistrée
              </h1>

              <p className="mt-3 text-muted-foreground">
                {etat.note ??
                  "Nous l'examinons. Vous serez recontacté au numéro indiqué ; il n'y a rien à faire d'ici là."}
              </p>

              <button
                onClick={() => router.push("/login")}
                className="mt-6 rounded-md border px-6 py-3 font-medium hover:bg-muted"
              >
                Retour à la connexion
              </button>
            </>
          )}

          {etat.statut === "refuse" && (
            <>
              <h1 className="font-heading text-xl font-bold">
                Votre demande n&apos;a pas été retenue
              </h1>

              {/*
                Le motif, quand l'exploitant en a laissé un. Un refus sans
                explication laisse recommencer à l'identique.
              */}
              <p className="mt-3 text-muted-foreground">
                {etat.motif ??
                  "Aucun motif n'a été précisé. Vous pouvez nous recontacter pour en savoir plus."}
              </p>

              <p className="mt-2 text-muted-foreground">
                Vous pouvez déposer une nouvelle demande si votre situation
                a changé.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push("/demande-acces")}
                  className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
                >
                  Déposer une nouvelle demande
                </button>

                <button
                  onClick={() => router.push("/login")}
                  className="rounded-md border px-6 py-3 font-medium hover:bg-muted"
                >
                  Retour à la connexion
                </button>
              </div>
            </>
          )}

          {etat.statut === "erreur" && (
            <>
              <h1 className="font-heading text-xl font-bold">
                La connexion n&apos;a pas abouti
              </h1>

              <p className="mt-3 text-muted-foreground">{etat.message}</p>

              <button
                onClick={() => router.push("/login")}
                className="mt-6 rounded-md border px-6 py-3 font-medium hover:bg-muted"
              >
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
