"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import { Logo } from "@/components/logo"

/*
 * Retour de la connexion Google.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CETTE PAGE EXISTE, ET CE QU'ELLE EMPÊCHE
 *
 * Google authentifie n'importe quel titulaire d'un compte Gmail. Or le
 * déclencheur handle_new_user crée un profil SANS école ni rôle, et le
 * tableau de bord renvoie alors vers /setup-school — qui crée un
 * établissement.
 *
 * Sans le contrôle ci-dessous, activer Google ouvrirait donc
 * l'inscription publique par la porte de service, alors qu'elle a été
 * volontairement reportée en attendant le service d'envoi.
 *
 * Google est ici un moyen de SE CONNECTER à un compte existant, pas de
 * s'en créer un. Un inconnu est déconnecté aussitôt.
 * ---------------------------------------------------------------------
 */

type Etat =
  | { statut: "verification" }
  | { statut: "refuse"; email: string }
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

      const courriel = session.user.email ?? ""

      const { data: profil, error } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", session.user.id)
        .maybeSingle()

      if (annule) {
        return
      }

      if (error) {
        console.error("Erreur profil après Google :", error)
        setEtat({
          statut: "erreur",
          message:
            "Votre profil n'a pas pu être lu. Réessayez dans un instant.",
        })
        return
      }

      /*
       * Aucune école rattachée : ce compte Google ne correspond à aucun
       * membre d'un établissement. On le déconnecte plutôt que de le
       * laisser en créer un.
       */
      if (!profil?.school_id) {
        await supabase.auth.signOut()

        if (!annule) {
          setEtat({ statut: "refuse", email: courriel })
        }

        return
      }

      router.push("/dashboard")
      router.refresh()
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
            <p className="text-muted-foreground">Vérification de votre accès...</p>
          )}

          {etat.statut === "refuse" && (
            <>
              <h1 className="font-heading text-xl font-bold">
                Ce compte Google n&apos;est rattaché à aucun établissement
              </h1>

              <p className="mt-3 text-muted-foreground">
                Vous vous êtes bien identifié avec{" "}
                <strong>{etat.email}</strong>, mais cette adresse ne
                correspond à aucun membre d&apos;une école enregistrée sur
                Ridwane.
              </p>

              <p className="mt-2 text-muted-foreground">
                Google permet de se connecter à un compte existant, pas
                d&apos;en créer un. Demandez à la direction de votre
                établissement de vous ouvrir un accès — vous pourrez
                ensuite revenir par ce bouton.
              </p>

              <button
                onClick={() => router.push("/login")}
                className="mt-6 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
              >
                Retour à la connexion
              </button>
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
