import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )

          response = NextResponse.next({
            request,
          })

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Les routes /api gèrent leur propre authentification (ex: Authorization header)
  if (pathname.startsWith("/api")) {
    return response
  }

  /*
   * Ces pages doivent pouvoir se charger SANS cookie de session, parce que
   * c'est précisément elles qui l'établissent :
   *
   *   /update-password reçoit les liens d'accès, dont le jeton arrive dans
   *   l'URL et n'est consommé qu'une fois la page chargée ;
   *
   *   /auth/callback reçoit le retour de Google avec un code à échanger.
   *   L'oublier ici renvoyait vers /login avant tout échange — la connexion
   *   Google semblait alors « retomber sur l'erreur de mot de passe ».
   *
   * /annales est publique pour une tout autre raison : elle n'établit
   * aucune session et n'en attend aucune. C'est la porte des élèves, qui
   * n'ont pas de compte et ne doivent pas en avoir — la renvoyer vers
   * /login demanderait un mot de passe pour lire un sujet du BAC.
   */
  const publicPaths = [
    "/",
    "/annales",
    "/login",
    "/update-password",
    "/auth/callback",
  ]
  const isPublicPath = publicPaths.includes(pathname)

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === "/login") {
    const dashboardUrl = new URL("/dashboard", request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  /*
   * manifest.webmanifest et sw.js sont exclus : le navigateur les
   * réclame sans cookie de session, avant toute connexion. Les rediriger
   * vers /login empêche purement et simplement l'installation de la PWA.
   * Ces deux ressources sont statiques et ne contiennent aucune donnée
   * d'établissement.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}