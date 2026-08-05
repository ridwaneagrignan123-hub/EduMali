import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/logo"
import { CatalogueAnnales } from "@/components/catalogue-annales"
import { lireCatalogue } from "@/src/lib/annales"
import { AssistantRevision } from "@/components/assistant-revision"
import { assistantDisponible } from "@/src/lib/assistant"

/*
 * Les annales et les exercices corrigés — la porte des ÉLÈVES.
 *
 * =====================================================================
 * AUCUN COMPTE, ET C'EST LA FONCTIONNALITÉ
 * =====================================================================
 *
 * Cette page ne demande rien : pas d'inscription, pas d'adresse, pas de
 * mot de passe. Trois raisons, dans cet ordre d'importance :
 *
 *   des annales sont des documents publics. Demander un compte pour les
 *   lire est une friction pure, et la friction sur un téléphone partagé
 *   entre trois frères se paie en abandons ;
 *
 *   un compte élève voudrait dire stocker des données de mineurs. On ne
 *   collecte pas ce dont on n'a pas besoin ;
 *
 *   la table `exam_resources` n'a aucune clé étrangère. Il n'y a
 *   littéralement rien à quoi rattacher un compte.
 *
 * L'école, elle, entre par `/login` comme avant. Deux portes distinctes,
 * pas un portail qui interroge tout le monde : le directeur vient tous
 * les matins, et lui imposer un écran de choix quotidien pour le confort
 * d'un visiteur occasionnel serait taxer le mauvais usager.
 *
 * =====================================================================
 * RENDU SUR LE SERVEUR
 * =====================================================================
 *
 * La page arrive remplie. Le filtrage se fait ensuite dans le
 * navigateur, sans aller-retour. Voir `src/lib/annales.ts` pour le
 * seuil où ce choix devra s'inverser.
 */

const NUIT = "oklch(17% 0.018 55)"
const SABLE = "oklch(95% 0.015 85)"
const OR = "oklch(80% 0.15 78)"
const TRAIT = "oklch(95% 0.015 85 / 0.09)"
const ESTOMPE = "oklch(95% 0.015 85 / 0.62)"

const display = "var(--font-bricolage), sans-serif"

export const metadata: Metadata = {
  title: "Annales et exercices corrigés — DEF, BEPC, BAC",
  description:
    "Sujets d'examen et exercices corrigés pour les élèves d'Afrique de l'Ouest. Libre d'accès, sans inscription.",
}

export default async function AnnalesPage() {
  const ressources = await lireCatalogue()

  /*
   * La décision est prise ICI, sur le serveur, et jamais dans le
   * navigateur : c'est le seul endroit qui voit la clé d'API. Sans elle,
   * le composant n'est pas monté du tout — plutôt qu'un champ de saisie
   * qui refuserait à chaque envoi.
   */
  const assistant = assistantDisponible()

  return (
    <div
      style={{
        fontFamily: "var(--font-manrope), sans-serif",
        background: NUIT,
        color: SABLE,
        minHeight: "100vh",
      }}
    >
      {/*
        Les mêmes retraits que la vitrine, redéclarés ici : la règle
        `.rd-pad` vit dans le <style> de la page d'accueil et ne suit pas
        jusqu'à cette page. La dupliquer est moins coûteux que de créer
        une feuille partagée pour deux règles.
      */}
      <style>{`
        @media (max-width: 900px) {
          .rd-pad { padding-left: 22px !important; padding-right: 22px !important; }
          .rd-titre { font-size: 34px !important; }
        }
      `}</style>

      <nav
        className="rd-pad"
        style={{
          padding: "20px 56px",
          borderBottom: `1px solid ${TRAIT}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "inline-flex" }}>
          <Logo dark />
        </Link>

        {/*
          Le lien de l'école est présent mais discret : ce n'est pas la
          page des écoles, et un élève n'a rien à faire sur /login.
        */}
        <Link
          href="/login"
          style={{ fontSize: 14.5, color: ESTOMPE, fontWeight: 600 }}
        >
          Vous êtes une école ? →
        </Link>
      </nav>

      <main
        className="rd-pad"
        style={{ padding: "64px 56px 96px", maxWidth: 1100, margin: "0 auto" }}
      >
        <p
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: OR,
            margin: "0 0 16px",
          }}
        >
          Libre d&apos;accès · sans inscription
        </p>

        <h1
          className="rd-titre"
          style={{
            fontFamily: display,
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: "0 0 18px",
          }}
        >
          Annales et exercices corrigés.
        </h1>

        <p
          style={{
            fontSize: 17.5,
            lineHeight: 1.65,
            color: ESTOMPE,
            maxWidth: 620,
            margin: "0 0 46px",
          }}
        >
          Les sujets tombés au DEF, au BEPC et au BAC, et des exercices pour
          s&apos;entraîner. Rien à créer, rien à payer — ouvrez, révisez,
          partagez le lien à votre classe.
        </p>

        {assistant && <AssistantRevision />}

        <CatalogueAnnales ressources={ressources} />
      </main>

      <footer
        className="rd-pad"
        style={{
          padding: "32px 56px 56px",
          borderTop: `1px solid ${TRAIT}`,
          fontSize: 14,
          color: "oklch(95% 0.015 85 / 0.42)",
        }}
      >
        <p style={{ margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
          Chaque document indique sa source. Ceux qui renvoient vers un autre
          site s&apos;y ouvrent : ils restent la propriété de qui les a
          publiés.
        </p>
      </footer>
    </div>
  )
}
