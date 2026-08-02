"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/logo"

/*
 * Demande d'accès d'une école candidate.
 *
 * ---------------------------------------------------------------------
 * CE N'EST PAS UNE INSCRIPTION
 *
 * Rien n'est créé ici : ni compte, ni établissement. La page dépose une
 * demande dans une file, que l'exploitant examine. La création d'une
 * école reste fermée derrière une autorisation nominative à usage
 * unique, émise à la main.
 *
 * Le dire clairement sur la page évite l'attente d'un accès immédiat,
 * puis la déception d'une connexion qui échoue.
 * ---------------------------------------------------------------------
 */

export default function DemandeAccesPage() {
  const router = useRouter()

  const [schoolName, setSchoolName] = useState("")
  const [contactName, setContactName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recue, setRecue] = useState(false)

  async function deposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setEnvoi(true)
    setErreur(null)

    try {
      const response = await fetch("/api/school-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName,
          contactName,
          phone,
          email,
          message,
        }),
      })

      const resultat = await response.json()

      if (!response.ok) {
        setErreur(resultat.error ?? "Votre demande n'a pas pu être envoyée.")
        return
      }

      setRecue(true)
    } catch (error) {
      console.error("Erreur dépôt :", error)
      setErreur("Le serveur n'a pas répondu. Réessayez.")
    } finally {
      setEnvoi(false)
    }
  }

  if (recue) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-6">
          <Logo />

          <h1 className="mt-6 text-xl font-bold">Demande reçue</h1>

          <p className="mt-3 text-muted-foreground">
            Nous vous recontacterons au numéro indiqué. Si votre demande est
            acceptée, vous recevrez une autorisation à l&apos;adresse{" "}
            <strong>{email}</strong> — c&apos;est avec cette adresse, et elle
            seule, que vous pourrez ouvrir votre établissement.
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg rounded-xl border bg-background p-6">
        <Logo />

        <h1 className="mt-6 text-2xl font-bold">Demander un accès</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Cette page ne crée pas de compte. Elle transmet votre demande ;
          nous vous recontactons, et l&apos;ouverture de votre établissement
          se fait ensuite avec une autorisation nominative.
        </p>

        <form onSubmit={deposer} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="ecole">Nom de l&apos;école *</label>

            <input
              id="ecole"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="contact">Personne à contacter *</label>

            <input
              id="contact"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="tel">Numéro de téléphone *</label>

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
            <label htmlFor="email">Adresse email *</label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2"
            />

            {/*
              L'adresse n'est pas une coordonnée de plus : l'autorisation
              émise en cas d'accord est nominative PAR EMAIL. C'est celle
              qui devra ouvrir l'établissement.
            */}
            <p className="text-xs text-muted-foreground">
              L&apos;autorisation sera délivrée à cette adresse, et
              c&apos;est avec elle que vous devrez vous connecter.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="mot">Un mot sur votre établissement</label>

            <textarea
              id="mot"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              placeholder="Facultatif — effectif, cycles, ville."
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

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full text-sm text-muted-foreground underline"
          >
            J&apos;ai déjà un compte
          </button>
        </form>
      </div>
    </main>
  )
}
