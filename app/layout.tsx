import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import {
  Manrope,
  Plus_Jakarta_Sans,
  Geist_Mono,
  Bricolage_Grotesque,
} from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { LangueProvider } from "@/src/i18n/contexte";
import { COOKIE_LANGUE, directionDe, versLangue } from "@/src/i18n/langues";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * Police de titrage de l'identité Ridwane. Ses graisses lourdes et son
 * interlettrage serré portent les grands titres de la vitrine ; elle
 * remplacera progressivement Plus Jakarta à l'intérieur de l'application.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ridwane — L'école, simplement.",
  description:
    "Ridwane, la plateforme de gestion scolaire pour les établissements au Mali : élèves, notes, bulletins et plus encore.",
  // Permet l'ajout à l'écran d'accueil sur iOS, qui ignore le manifeste.
  appleWebApp: {
    capable: true,
    title: "Ridwane",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#c0571e",
};

/*
 * LA LANGUE EST LUE DU COOKIE ICI, avant le premier octet envoyé.
 *
 * C'est ce qui permet à `lang` et surtout `dir` d'être justes dès le
 * rendu serveur. Sans cela, une page arabe s'afficherait un instant en
 * gauche-a-droite, puis basculerait sous les yeux du lecteur.
 *
 * Le cookie ne connaît pas la préférence enregistrée sur le profil —
 * seul le client peut la lire. LangueProvider corrige ensuite `dir` si
 * les deux diffèrent : c'est le prix d'un premier rendu sans requête.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const langue = versLangue((await cookies()).get(COOKIE_LANGUE)?.value);

  return (
    <html
      lang={langue}
      dir={directionDe(langue)}
      className={`${manrope.variable} ${plusJakarta.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LangueProvider langueInitiale={langue}>
          {children}
          <PwaRegister />
        </LangueProvider>
      </body>
    </html>
  );
}