"use client"

import { useRouter } from "next/navigation"

export default function FeesPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">EduMali</h1>
            <p className="text-sm text-muted-foreground">
              Frais scolaires
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Retour au dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-xl border border-dashed bg-background p-10 text-center">
          <h2 className="text-2xl font-bold">
            Gestion des frais scolaires
          </h2>

          <p className="mt-3 text-muted-foreground">
            Cette fonctionnalité est en cours de préparation. Elle
            permettra bientôt de suivre les paiements et les frais
            dus par élève.
          </p>
        </div>
      </section>
    </main>
  )
}