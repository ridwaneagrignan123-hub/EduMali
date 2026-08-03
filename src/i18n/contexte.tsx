"use client"

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { supabase } from "@/src/lib/supabase"
import { ar } from "./ar"
import { en } from "./en"
import { CleDeTraduction, Traductions, fr } from "./fr"
import {
  COOKIE_LANGUE,
  ETIQUETTES_LOCALE,
  LANGUE_PAR_DEFAUT,
  Langue,
  directionDe,
  versLangue,
} from "./langues"

/*
 * La langue de l'interface, et la fonction qui traduit.
 *
 * ---------------------------------------------------------------------
 * TROIS SOURCES, DANS CET ORDRE
 *
 *   1. la préférence enregistrée sur le PROFIL — elle suit la personne
 *      d'un appareil à l'autre ;
 *   2. le COOKIE — pour un visiteur non connecté, et pour le tout
 *      premier rendu avant que le profil soit lu ;
 *   3. le FRANÇAIS.
 *
 * Le cookie est écrit dans tous les cas, y compris pour un compte
 * connecté : il sert alors au rendu serveur du `dir` de la page, qui a
 * lieu avant toute requête Supabase. Sans lui, une page arabe
 * s'afficherait un instant en gauche-à-droite avant de basculer.
 * ---------------------------------------------------------------------
 */

const DICTIONNAIRES: Record<Langue, Traductions> = { fr, en, ar }

type Remplacements = Record<string, string | number>

type ContexteLangue = {
  langue: Langue
  /** Traduit une clé, et remplace les marques `{nom}` s'il y en a. */
  t: (cle: CleDeTraduction, remplacements?: Remplacements) => string
  /** Change la langue, la retient, et l'enregistre sur le profil. */
  changerLangue: (langue: Langue) => Promise<void>
  /** « fr-FR », « en-GB », « ar-MA » — pour les dates et les nombres. */
  locale: string
  rtl: boolean
}

const Contexte = createContext<ContexteLangue | null>(null)

function ecrireCookie(langue: Langue) {
  if (typeof document === "undefined") {
    return
  }

  // Un an : la langue d'une école ne change pas tous les mois.
  document.cookie = `${COOKIE_LANGUE}=${langue}; path=/; max-age=31536000; SameSite=Lax`
}

/**
 * Traduit une clé dans une langue donnée.
 *
 * Le REPLI SUR LE FRANÇAIS est ce qui permet de traduire par passes :
 * un écran dont les clés ne sont pas encore traduites reste lisible, il
 * n'affiche jamais un identifiant technique ni une case vide.
 */
export function traduire(
  langue: Langue,
  cle: CleDeTraduction,
  remplacements?: Remplacements
) {
  const texte = DICTIONNAIRES[langue][cle] ?? fr[cle] ?? cle

  if (!remplacements) {
    return texte
  }

  return Object.entries(remplacements).reduce(
    (resultat, [nom, valeur]) =>
      resultat.replaceAll(`{${nom}}`, String(valeur)),
    texte
  )
}

export function LangueProvider({
  langueInitiale,
  children,
}: {
  /** Lue du cookie par le layout serveur, pour le premier rendu. */
  langueInitiale: Langue
  children: ReactNode
}) {
  const [langue, setLangue] = useState<Langue>(langueInitiale)

  /*
   * La préférence du profil prend le pas sur le cookie, une fois la
   * session connue. On ne la lit qu'une fois : changerLangue() met
   * l'état à jour de son côté, sans relire la base.
   */
  useEffect(() => {
    let annule = false

    async function lirePreference() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || annule) {
        return
      }

      const { data } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .maybeSingle()

      if (annule || !data?.language) {
        return
      }

      const preferee = versLangue(data.language)

      setLangue(preferee)
      ecrireCookie(preferee)
    }

    lirePreference()

    return () => {
      annule = true
    }
  }, [])

  /*
   * `dir` et `lang` sont posés sur <html> ici plutôt que dans le layout
   * seul : le layout ne connaît que le cookie, et la préférence du
   * profil peut le contredire. C'est le seul endroit qui voit les deux.
   */
  useEffect(() => {
    if (typeof document === "undefined") {
      return
    }

    document.documentElement.lang = langue
    document.documentElement.dir = directionDe(langue)
  }, [langue])

  const changerLangue = useCallback(async (suivante: Langue) => {
    setLangue(suivante)
    ecrireCookie(suivante)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      // Visiteur non connecté : le cookie est toute la mémoire dont on
      // dispose, et il suffit.
      return
    }

    const { error } = await supabase
      .from("profiles")
      .update({ language: suivante })
      .eq("id", user.id)

    if (error) {
      // Sans gravité : le cookie a déjà retenu le choix pour cet
      // appareil. On le dit à la console, pas à l'écran.
      console.error("Préférence de langue non enregistrée :", error)
    }
  }, [])

  const valeur = useMemo<ContexteLangue>(
    () => ({
      langue,
      t: (cle, remplacements) => traduire(langue, cle, remplacements),
      changerLangue,
      locale: ETIQUETTES_LOCALE[langue],
      rtl: directionDe(langue) === "rtl",
    }),
    [langue, changerLangue]
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

/**
 * Le contexte de langue.
 *
 * Hors provider, on rend un contexte FRANÇAIS plutôt que de lever : un
 * écran isolé — une page d'erreur, un composant monté en test — doit
 * rester lisible, pas exploser.
 */
export function useLangue(): ContexteLangue {
  const contexte = useContext(Contexte)

  if (contexte) {
    return contexte
  }

  return {
    langue: LANGUE_PAR_DEFAUT,
    t: (cle, remplacements) =>
      traduire(LANGUE_PAR_DEFAUT, cle, remplacements),
    changerLangue: async () => {},
    locale: ETIQUETTES_LOCALE[LANGUE_PAR_DEFAUT],
    rtl: false,
  }
}

/** Raccourci : la fonction de traduction seule. */
export function useT() {
  return useLangue().t
}
