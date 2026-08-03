"use client"

import Link from "next/link"
import { SelecteurLangue } from "@/components/selecteur-langue"
import { useLangue } from "@/src/i18n/contexte"
import { LoginForm } from "@/components/auth/login-form"
import { Logo } from "@/components/logo"

/*
 * Page de connexion : charnière entre la vitrine sombre et l'application
 * claire. Le fond reprend l'identité du site, la carte du formulaire reste
 * claire pour que la saisie garde le confort du reste de l'application.
 */

const NIGHT = "oklch(17% 0.018 55)"
const GOLD = "oklch(80% 0.15 78)"
const LINE = "oklch(95% 0.015 85 / 0.09)"

export default function LoginPage() {
  const { t } = useLangue()

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ background: NIGHT, position: "relative", overflow: "hidden" }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.06,
          backgroundImage: `repeating-conic-gradient(from 45deg at 50% 50%, ${GOLD} 0deg 90deg, transparent 90deg 180deg)`,
          backgroundSize: "88px 88px",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          left: "50%",
          width: 420,
          height: 420,
          marginLeft: -210,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, oklch(60% 0.17 38 / 0.35), transparent 68%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size="lg" dark />

          <p style={{ color: "oklch(95% 0.015 85 / 0.62)", fontSize: 15 }}>
            {t("connexion.sousTitre")}
          </p>
        </div>

        <div
          className="rounded-2xl border bg-background p-6"
          style={{ borderColor: LINE }}
        >
          <LoginForm />
        </div>

        {/*
          Le selecteur AVANT tout le reste : quelqu'un qui ne lit pas le
          francais doit pouvoir changer de langue sans avoir a dechiffrer
          la page pour trouver ou le faire.
        */}
        <div className="flex justify-center">
          <SelecteurLangue compact />
        </div>

        {/*
          La porte d'entrée des écoles candidates. Elle mène à une
          DEMANDE, pas à une inscription : rien ne se crée sans
          autorisation nominative.
        */}
        <p className="text-center">
          <Link
            href="/demande-acces"
            style={{ fontSize: 14, color: "oklch(95% 0.015 85 / 0.75)" }}
          >
            {t("connexion.pasDAcces")}
          </Link>
        </p>

        <p className="text-center">
          <Link
            href="/"
            style={{ fontSize: 14, color: "oklch(95% 0.015 85 / 0.5)" }}
          >
            {t("connexion.retourAccueil")}
          </Link>
        </p>
      </div>
    </main>
  )
}
