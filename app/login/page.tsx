import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Ridwane</h1>

          <p className="text-muted-foreground">
            Connectez-vous à votre espace scolaire
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}