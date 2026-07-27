import type { MetadataRoute } from "next"

/*
 * Manifeste PWA, généré par la convention native de Next 16
 * (app/manifest.ts). Les couleurs reprennent celles du design system :
 * --background et --primary de app/globals.css, converties en sRGB
 * puisque le manifeste n'accepte pas oklch().
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ridwane — Gestion scolaire",
    short_name: "Ridwane",
    description:
      "Gestion scolaire : élèves, notes, bulletins, présences et frais.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6ef",
    theme_color: "#c0571e",
    lang: "fr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
