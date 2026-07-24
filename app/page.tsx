import Link from "next/link"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6 text-center">
      <h1 className="text-4xl font-bold">EduMali</h1>

      <p className="mt-3 max-w-md text-muted-foreground">
        Plateforme de gestion scolaire : élèves, enseignants, notes et
        bulletins.
      </p>

      <Link
        href="/login"
        className="mt-8 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
      >
        Se connecter
      </Link>
    </main>
  )
}
