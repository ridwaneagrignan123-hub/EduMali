/*
 * Ce module ne doit JAMAIS partir au navigateur.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` contourne tout le RLS : embarquée dans un
 * paquet servi au public, elle donnerait à n'importe qui la lecture et
 * l'écriture de toutes les écoles.
 *
 * L'import ci-dessous fait ÉCHOUER LA COMPILATION si un composant client
 * atteint ce fichier, ne serait-ce que par une chaîne d'imports
 * indirecte. Une erreur de build est bruyante ; une clé qui fuit est
 * silencieuse, et ne se découvre qu'après.
 */
import "server-only"
import { createClient } from "@supabase/supabase-js"

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)