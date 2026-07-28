import type { Metadata, Viewport } from "next";
import {
  Manrope,
  Plus_Jakarta_Sans,
  Geist_Mono,
  Bricolage_Grotesque,
} from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${plusJakarta.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}