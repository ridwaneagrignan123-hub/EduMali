/*
 * Service worker minimal, écrit à la main.
 *
 * Choix assumé : pas de next-pwa ni de Serwist. next-pwa n'est plus
 * maintenu (dernière version en 2022, pas de prise en charge de l'App
 * Router récent) et les deux ajoutent un greffon qui enveloppe le build
 * Next — une pièce mobile de plus à casser à chaque montée de version.
 * Le besoin ici est étroit : rendre l'application installable et servir
 * une coquille en cas de coupure. La file d'attente des notes, elle, vit
 * dans la page (localStorage) et n'a pas besoin du service worker.
 *
 * Stratégie : réseau d'abord, cache en secours.
 * Les données scolaires doivent toujours être fraîches quand le réseau
 * répond ; le cache ne sert qu'à éviter l'écran d'erreur du navigateur.
 * On ne met JAMAIS en cache les appels à Supabase ni les routes /api :
 * servir une réponse périmée y ferait croire à un enregistrement réussi.
 */

const CACHE_NAME = "ridwane-v1"

// Coquille minimale : ce qui permet d'afficher quelque chose hors ligne.
const SHELL = ["/", "/dashboard", "/grades", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Une ressource absente ne doit pas faire échouer toute l'installation.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") {
    return
  }

  const url = new URL(request.url)

  // Hors de notre origine : Supabase, polices, etc. On laisse passer.
  if (url.origin !== self.location.origin) {
    return
  }

  // Les routes serveur ne doivent jamais être servies depuis le cache.
  if (url.pathname.startsWith("/api/")) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }

        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)

        if (cached) {
          return cached
        }

        // Navigation sans rien en cache : on retombe sur la coquille.
        if (request.mode === "navigate") {
          const shell = await caches.match("/dashboard")

          if (shell) {
            return shell
          }
        }

        return new Response("Hors ligne", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      })
  )
})
