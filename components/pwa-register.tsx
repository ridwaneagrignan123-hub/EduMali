"use client"

import { useEffect } from "react"

/*
 * Enregistre le service worker. Rendu par le layout, sans aucune sortie
 * visuelle.
 *
 * En développement on ne l'enregistre pas : un service worker actif
 * masquerait le rechargement à chaud de Next et rendrait le débogage
 * trompeur.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return
    }

    if (!("serviceWorker" in navigator)) {
      return
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Enregistrement du service worker impossible :", error)
    })
  }, [])

  return null
}
