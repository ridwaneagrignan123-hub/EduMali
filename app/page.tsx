import Link from "next/link"
import Image from "next/image"
import { Logo } from "@/components/logo"
import { CarteAfriqueDeLOuest } from "@/components/carte-afrique"

/*
 * Page vitrine, reprise de la maquette « Ridwane — L'école ».
 *
 * Elle est en thème sombre, contrairement au reste de l'application qui
 * reste clair pour la saisie quotidienne et l'impression des bulletins.
 * Les couleurs correspondent aux jetons --rd-* de app/globals.css.
 */

const NIGHT = "oklch(17% 0.018 55)"
const NIGHT_DEEP = "oklch(13% 0.02 50)"
const NIGHT_SOFT = "oklch(22% 0.02 55)"
const SAND = "oklch(95% 0.015 85)"
const GOLD = "oklch(80% 0.15 78)"
const GREEN = "oklch(60% 0.13 155)"
const CLAY = "oklch(60% 0.17 38)"
const LINE = "oklch(95% 0.015 85 / 0.09)"

const display = "var(--font-bricolage), sans-serif"

const navLinks = [
  { label: "Fonctions", href: "#fonctions" },
  { label: "Nos élèves", href: "#eleves" },
  { label: "Le promoteur", href: "#promoteur" },
  { label: "Contact", href: "#contact" },
]

/*
 * Les photographies de la maquette.
 *
 * ---------------------------------------------------------------------
 * LES DIMENSIONS ET LES CADRAGES SONT DES DONNÉES, PAS DE LA DÉCORATION
 *
 * `width` et `height` sont les dimensions INTRINSÈQUES du fichier : elles
 * servent à next/image pour réserver la place et éviter que la page ne
 * saute au chargement. Les changer sans changer le fichier déforme
 * l'image.
 *
 * `position` est le réglage d'`object-position`. Chacune des trois photos
 * d'élèves paraît deux fois, dans deux cadres de proportions
 * différentes — d'où deux valeurs distinctes, réglées pour que les
 * visages ne soient pas coupés. Elles ne sont pas interchangeables.
 * ---------------------------------------------------------------------
 */
const PHOTOS = {
  heros: {
    src: "/eleve-main-levee.jpg",
    width: 599,
    height: 749,
    alt: "Élève levant la main en classe",
    position: "center 40%",
  },
  mains: {
    src: "/eleves-mains.jpg",
    width: 736,
    height: 713,
    bande: { alt: "Élèves réunis, mains jointes", position: "center 40%" },
    carte: { alt: "Élèves en uniforme, mains jointes", position: "center 45%" },
  },
  lycee: {
    src: "/eleves-lycee.jpg",
    width: 736,
    height: 736,
    bande: { alt: "Élèves en classe levant la main", position: "center 45%" },
    carte: { alt: "Élèves de lycée en cours", position: "center 45%" },
  },
  classeJaune: {
    src: "/eleves-classe-jaune.jpg",
    width: 640,
    height: 498,
    bande: { alt: "Salle de classe, élève et manuel", position: "center 55%" },
    carte: { alt: "Élève avec son manuel en classe", position: "center 50%" },
  },
  promoteur: {
    /*
     * PNG conservé : le portrait est détouré. WebP et AVIF, les formats
     * vers lesquels next/image convertit, gardent la transparence — ce
     * que le JPEG ne sait pas faire.
     */
    src: "/promoteur-cutout.png",
    width: 620,
    height: 826,
    alt: "Le promoteur de Ridwane — L'école",
  },
} as const

/* La bande « Nos élèves », dans l'ordre de la maquette. */
const bandeEleves = [
  PHOTOS.mains,
  PHOTOS.lycee,
  PHOTOS.classeJaune,
] as const

/*
 * Trois des quatre cartes portent une photographie ; « Écoles privées »
 * n'en avait pas dans la maquette. Elle reçoit un aplat de la même
 * hauteur, sinon la rangée se désaligne et l'absence passe pour un
 * chargement qui a échoué.
 */
const schoolTypes = [
  {
    name: "Medersas",
    note: "Calendrier et matières adaptés",
    color: GOLD,
    photo: PHOTOS.mains,
  },
  {
    name: "Écoles publiques",
    note: "Effectifs importants, gratuité",
    color: GREEN,
    photo: PHOTOS.lycee,
  },
  {
    name: "Lycées & techniques",
    note: "Séries, options, examens",
    color: CLAY,
    photo: PHOTOS.classeJaune,
  },
  {
    name: "Écoles privées",
    note: "Facturation et relances",
    color: GOLD,
    photo: null,
  },
]

const features = [
  {
    title: "Inscriptions",
    desc: "Dossier élève complet, affectation en classe, réinscription en un clic d'une année à l'autre.",
    color: GOLD,
  },
  {
    title: "Notes & bulletins",
    desc: "Saisie par matière, moyennes automatiques, bulletins trimestriels prêts à imprimer.",
    color: GREEN,
  },
  {
    title: "Scolarité",
    desc: "Échéanciers, paiements partiels, reçus numériques et suivi des impayés par classe.",
    color: CLAY,
  },
  {
    title: "Emploi du temps",
    desc: "Grilles par classe et par enseignant, détection des conflits de salle et d'horaire.",
    color: GOLD,
  },
  {
    title: "Communication",
    desc: "SMS et notifications aux parents : absences, bulletins disponibles, rappels de paiement.",
    color: GREEN,
  },
  {
    title: "Présences",
    desc: "Appel quotidien en moins d'une minute, alertes automatiques aux parents dès l'absence.",
    color: CLAY,
  },
]

export default function Home() {
  return (
    <div
      style={{
        fontFamily: "var(--font-manrope), sans-serif",
        background: NIGHT,
        color: SAND,
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes rd-rise { from { opacity:0; transform:translateY(26px);} to { opacity:1; transform:translateY(0);} }
        @keyframes rd-draw-rule { from { transform:scaleX(0);} to { transform:scaleX(1);} }
        @keyframes rd-blink { 0%,49%{opacity:1;} 50%,100%{opacity:0.25;} }
        @keyframes rd-glow { 0%,100%{ transform:scale(1); opacity:0.5;} 50%{ transform:scale(1.15); opacity:0.85;} }
        @keyframes rd-pattern { to { background-position:88px 88px; } }
        .rd-link { color: oklch(95% 0.015 85 / 0.62); transition: color .2s ease; }
        .rd-link:hover { color: ${GOLD}; }
        .rd-cta:hover { background: oklch(66% 0.17 38) !important; }
        .rd-ghost:hover { border-color: ${GOLD} !important; color: ${GOLD} !important; }
        .rd-card { transition: transform .3s cubic-bezier(.2,.8,.25,1), border-color .3s ease; }
        .rd-card:hover { transform: translateY(-5px); border-color: oklch(95% 0.015 85 / 0.22) !important; }
        @media (max-width: 900px) {
          .rd-hero { grid-template-columns: 1fr !important; }
          .rd-promoteur { grid-template-columns: 1fr !important; }
          /*
            Le héros passe sur une colonne : à ses proportions d'origine,
            une image de 599×749 occuperait 925 px de haut sur une
            tablette et repousserait tout le texte hors de l'écran. On
            plafonne la hauteur ; le recadrage reste commandé par
            object-position, donc le visage tient toujours.
          */
          .rd-heros-photo { aspect-ratio: auto !important; height: 420px !important; }
          .rd-promoteur img { max-width: 400px !important; }
          .rd-pad { padding-left: 22px !important; padding-right: 22px !important; }
          .rd-h1 { font-size: 46px !important; }
          .rd-h2 { font-size: 32px !important; }
          .rd-devise { font-size: 34px !important; }
          .rd-nav-links { display: none !important; }
        }
        /*
          La bande passe à deux colonnes puis à une. Trois photos côte à
          côte sur un téléphone donneraient des bandeaux de 100 px de
          large, où l'on ne distingue plus personne.
        */
        @media (max-width: 1000px) {
          .rd-bande { grid-template-columns: repeat(2, 1fr) !important; }
        }
        /* La carte passe sous son texte plutôt qu'à côté. */
        @media (max-width: 900px) {
          .rd-region { grid-template-columns: 1fr !important; }
        }
        /*
          SUR TÉLÉPHONE, LA CARTE EST RECADRÉE SUR SA RÉGION.

          Le continent entier dans 330 px ramène les noms de pays à 6 px :
          une carte qu'on ne peut pas lire ne vaut pas les octets qu'elle
          coûte. On agrandit donc le tracé et on le cadre sur l'Afrique de
          l'Ouest — le fond estompé reste visible aux quatre bords, et les
          noms repassent à 13 px.

          Le recadrage est fait au CSS, sur la même image : dupliquer le
          SVG pour un second cadrage doublerait les 24 Ko. La fenêtre
          découpée est x 0→540, y 145→625 du viewBox — assez haut pour ne
          pas trancher le nord du Mali et de la Mauritanie, assez à l'est
          pour garder le Nigeria entier. D'où la largeur à 1000/540, la
          marge de -145/540 et le rapport 540/480.
        */
        @media (max-width: 620px) {
          .rd-carte {
            overflow: hidden;
            aspect-ratio: 540 / 480;
          }
          .rd-carte svg {
            width: 185.2% !important;
            margin-top: -26.9%;
          }
        }
        @media (max-width: 620px) {
          .rd-bande { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rd-anim, .rd-anim * { animation: none !important; }
        }
      `}</style>

      {/* ------------------------------------------------------------ nav */}
      <nav
        className="rd-pad"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          padding: "16px 56px",
          background: "oklch(17% 0.018 55 / 0.82)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <Logo size="md" dark />

        <div
          className="rd-nav-links"
          style={{ display: "flex", gap: 30, fontSize: 14.5, fontWeight: 500 }}
        >
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="rd-link">
              {link.label}
            </a>
          ))}
        </div>

        <Link
          href="/login"
          style={{
            padding: "11px 22px",
            borderRadius: 100,
            background: SAND,
            color: NIGHT,
            fontWeight: 700,
            fontSize: 14.5,
            whiteSpace: "nowrap",
          }}
        >
          Se connecter
        </Link>
      </nav>

      {/* ---------------------------------------------------------- héros */}
      <section
        className="rd-pad rd-anim"
        style={{
          position: "relative",
          padding: "86px 56px 70px",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.07,
            backgroundImage: `repeating-conic-gradient(from 45deg at 50% 50%, ${GOLD} 0deg 90deg, transparent 90deg 180deg)`,
            backgroundSize: "88px 88px",
            animation: "rd-pattern 24s linear infinite",
            pointerEvents: "none",
          }}
        />

        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            left: -40,
            width: 340,
            height: 340,
            borderRadius: "50%",
            background: `radial-gradient(circle, oklch(60% 0.17 38 / 0.55), transparent 68%)`,
            filter: "blur(20px)",
            animation: "rd-glow 9s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        <div
          className="rd-hero"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: 56,
            alignItems: "center",
            maxWidth: 1360,
            margin: "0 auto",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 16px",
                border: `1px solid oklch(80% 0.15 78 / 0.4)`,
                borderRadius: 100,
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: GOLD,
                marginBottom: 26,
                animation: "rd-rise .6s ease both",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: GREEN,
                  animation: "rd-blink 1.8s steps(1,end) infinite",
                }}
              />
              Bamako · Sikasso · Mopti
            </div>

            <h1
              className="rd-h1"
              style={{
                fontFamily: display,
                fontSize: 76,
                fontWeight: 800,
                lineHeight: 0.94,
                letterSpacing: "-0.035em",
                margin: "0 0 26px",
              }}
            >
              <span
                style={{
                  display: "block",
                  animation: "rd-rise .7s cubic-bezier(.2,.8,.25,1) .05s both",
                }}
              >
                L&apos;école
              </span>

              <span
                style={{
                  display: "block",
                  color: GOLD,
                  animation: "rd-rise .7s cubic-bezier(.2,.8,.25,1) .16s both",
                }}
              >
                africaine,
              </span>

              <span
                style={{
                  display: "block",
                  position: "relative",
                  animation: "rd-rise .7s cubic-bezier(.2,.8,.25,1) .27s both",
                }}
              >
                enfin connectée.
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: -6,
                    width: "100%",
                    height: 5,
                    background: CLAY,
                    transformOrigin: "left",
                    animation:
                      "rd-draw-rule 1.6s cubic-bezier(.2,.8,.25,1) .8s both",
                  }}
                />
              </span>
            </h1>

            <p
              style={{
                fontSize: 18.5,
                lineHeight: 1.62,
                color: "oklch(95% 0.015 85 / 0.68)",
                maxWidth: 500,
                margin: "0 0 34px",
                animation: "rd-rise .7s ease .4s both",
              }}
            >
              Inscriptions, notes, scolarité, présences et communication avec les
              familles — pour toutes les écoles d&apos;Afrique de l&apos;Ouest, publiques comme
              privées, medersas comme lycées.
            </p>

            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                flexWrap: "wrap",
                animation: "rd-rise .7s ease .5s both",
              }}
            >
              <Link
                href="/login"
                className="rd-cta"
                style={{
                  padding: "17px 32px",
                  background: CLAY,
                  color: "oklch(97% 0.01 85)",
                  borderRadius: 100,
                  fontWeight: 700,
                  fontSize: 16,
                  boxShadow: `0 16px 40px oklch(60% 0.17 38 / 0.35)`,
                }}
              >
                Ouvrir mon espace →
              </Link>

              <a
                href="#fonctions"
                className="rd-ghost"
                style={{
                  padding: "16px 28px",
                  borderRadius: 100,
                  border: `1px solid oklch(95% 0.015 85 / 0.22)`,
                  color: "oklch(95% 0.015 85 / 0.8)",
                  fontWeight: 600,
                  fontSize: 15.5,
                }}
              >
                Découvrir
              </a>
            </div>
          </div>

          {/*
            La photographie de la maquette. Elle remplace l'aperçu qui la
            remplaçait : le commentaire précédent disait explicitement
            qu'il n'était là qu'à défaut de l'image.

            `fill` plutôt que width/height : le cadre a ses propres
            proportions, et c'est lui qui commande. Les dimensions
            intrinsèques restent déclarées dans PHOTOS, pour mémoire.

            `priority` parce que l'image est au-dessus de la ligne de
            flottaison : la charger paresseusement retarderait le premier
            affichage utile, ce qui compte sur une connexion lente.
          */}
          <div
            className="rd-heros-photo"
            style={{
              position: "relative",
              aspectRatio: `${PHOTOS.heros.width} / ${PHOTOS.heros.height}`,
              borderRadius: 26,
              overflow: "hidden",
              border: `1px solid ${LINE}`,
              background: NIGHT_SOFT,
              animation: "rd-rise .8s ease .35s both",
            }}
          >
            <Image
              src={PHOTOS.heros.src}
              alt={PHOTOS.heros.alt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 44vw"
              style={{
                objectFit: "cover",
                objectPosition: PHOTOS.heros.position,
              }}
            />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- région */}
      <section
        className="rd-pad"
        style={{
          padding: "56px 56px 24px",
          borderTop: `1px solid ${LINE}`,
        }}
      >
        <div
          className="rd-region"
          style={{
            maxWidth: 1360,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "0.8fr 1.2fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: GOLD,
                margin: "0 0 16px",
              }}
            >
              Seize pays
            </p>

            <h2
              className="rd-h2"
              style={{
                fontFamily: display,
                fontSize: 42,
                fontWeight: 800,
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                margin: "0 0 18px",
              }}
            >
              Une région, un même besoin.
            </h2>

            <p
              style={{
                fontSize: 17,
                lineHeight: 1.65,
                color: "oklch(95% 0.015 85 / 0.62)",
                maxWidth: 460,
                margin: 0,
              }}
            >
              Du Cap-Vert au Nigeria, les écoles partagent les mêmes cycles,
              les mêmes examens de fin de cycle et les mêmes carnets tenus à
              la main. Ridwane est écrit pour cette réalité-là — pas adapté
              d&apos;ailleurs.
            </p>
          </div>

          <div
            className="rd-carte"
            style={{ maxWidth: 700, width: "100%", justifySelf: "center" }}
          >
            <CarteAfriqueDeLOuest />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- devise */}
      {/*
        La devise a sa propre bande, sans rien autour. Glissée dans une
        section existante elle passerait pour un sous-titre ; seule, entre
        deux fonds, elle se lit comme ce qu'elle est.

        Elle reprend la coupure du héros — l'accent doré tombe sur ce que
        le produit apporte, le reste de la phrase nomme à qui.
      */}
      <section
        className="rd-pad"
        style={{
          padding: "104px 56px",
          background: NIGHT_DEEP,
          borderTop: `1px solid ${LINE}`,
          borderBottom: `1px solid ${LINE}`,
          textAlign: "center",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "block",
            width: 54,
            height: 3,
            background: GOLD,
            borderRadius: 2,
            margin: "0 auto 34px",
          }}
        />

        <p
          className="rd-devise"
          style={{
            fontFamily: display,
            fontSize: 54,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.035em",
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          L&apos;école africaine,{" "}
          {/*
            La coupure est posée, pas laissée au hasard : au fil du texte,
            la ligne se casserait selon la largeur de l'écran et séparerait
            « structurée et » de « connectée ».
          */}
          <span style={{ color: GOLD, display: "block" }}>
            structurée et connectée.
          </span>
        </p>
      </section>

      {/* --------------------------------------------------------- élèves */}
      <section
        id="eleves"
        className="rd-pad"
        style={{ padding: "96px 56px", position: "relative" }}
      >
        <div style={{ maxWidth: 1360, margin: "0 auto" }}>
          <h2
            className="rd-h2"
            style={{
              fontFamily: display,
              fontSize: 46,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              margin: "0 0 18px",
              maxWidth: 620,
            }}
          >
            Chaque élève d&apos;Afrique de l&apos;Ouest, dans un même système.
          </h2>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              color: "oklch(95% 0.015 85 / 0.62)",
              maxWidth: 620,
              margin: "0 0 46px",
            }}
          >
            Écoles publiques, écoles privées, medersas, lycées techniques.
            Ridwane s&apos;adapte aux calendriers, aux matières et aux réalités
            de chaque établissement — sans jamais imposer un modèle unique.
          </p>

          {/*
            La bande de la maquette. Trois photographies, cadrées chacune
            selon son propre réglage : ces valeurs diffèrent de celles
            employées plus bas dans les cartes, parce que le cadre n'a pas
            les mêmes proportions.
          */}
          <div
            className="rd-bande"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginBottom: 46,
            }}
          >
            {bandeEleves.map((photo) => (
              <div
                key={photo.src}
                style={{
                  position: "relative",
                  height: 260,
                  borderRadius: 18,
                  overflow: "hidden",
                  border: `1px solid ${LINE}`,
                  background: NIGHT_SOFT,
                }}
              >
                <Image
                  src={photo.src}
                  alt={photo.bande.alt}
                  fill
                  sizes="(max-width: 760px) 100vw, 30vw"
                  style={{
                    objectFit: "cover",
                    objectPosition: photo.bande.position,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}
          >
            {schoolTypes.map((type) => (
              <div
                key={type.name}
                className="rd-card"
                style={{
                  borderRadius: 18,
                  background: NIGHT_SOFT,
                  border: `1px solid ${LINE}`,
                  overflow: "hidden",
                }}
              >
                {/*
                  Même photographie que dans la bande, mais cadrée
                  autrement : le cadre est ici plus large que haut.
                */}
                {type.photo ? (
                  <div style={{ position: "relative", height: 132 }}>
                    <Image
                      src={type.photo.src}
                      alt={type.photo.carte.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, 24vw"
                      style={{
                        objectFit: "cover",
                        objectPosition: type.photo.carte.position,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    aria-hidden
                    style={{
                      height: 132,
                      background: `linear-gradient(140deg, color-mix(in oklch, ${type.color} 26%, transparent), transparent 70%)`,
                    }}
                  />
                )}

                <div style={{ padding: "22px 24px 26px" }}>
                <span
                  style={{
                    display: "block",
                    width: 30,
                    height: 4,
                    borderRadius: 2,
                    background: type.color,
                    marginBottom: 18,
                  }}
                />

                <p
                  style={{
                    fontFamily: display,
                    fontSize: 19,
                    fontWeight: 700,
                    margin: "0 0 7px",
                  }}
                >
                  {type.name}
                </p>

                <p
                  style={{
                    fontSize: 14,
                    color: "oklch(95% 0.015 85 / 0.55)",
                    margin: 0,
                  }}
                >
                  {type.note}
                </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- fonctions */}
      <section
        id="fonctions"
        className="rd-pad"
        style={{ padding: "24px 56px 104px" }}
      >
        <div style={{ maxWidth: 1360, margin: "0 auto" }}>
          <h2
            className="rd-h2"
            style={{
              fontFamily: display,
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              margin: "0 0 44px",
              maxWidth: 620,
              lineHeight: 1.04,
            }}
          >
            Six outils, une seule connexion.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18,
            }}
          >
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rd-card"
                style={{
                  padding: "30px 28px",
                  borderRadius: 20,
                  background: NIGHT_SOFT,
                  border: `1px solid ${LINE}`,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: `color-mix(in oklch, ${feature.color} 16%, transparent)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: feature.color,
                    }}
                  />
                </div>

                <h3
                  style={{
                    fontFamily: display,
                    fontSize: 20,
                    fontWeight: 700,
                    margin: "0 0 9px",
                  }}
                >
                  {feature.title}
                </h3>

                <p
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: "oklch(95% 0.015 85 / 0.58)",
                    margin: 0,
                  }}
                >
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- promoteur */}
      <section
        id="promoteur"
        className="rd-pad"
        style={{ padding: "104px 56px", background: NIGHT_DEEP }}
      >
        <div
          className="rd-promoteur"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 0.85fr",
            gap: 56,
            alignItems: "center",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <div>
          <h2
            className="rd-h2"
            style={{
              fontFamily: display,
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 0.98,
              letterSpacing: "-0.035em",
              margin: "0 0 26px",
            }}
          >
            Toutes les <span style={{ color: GOLD }}>écoles d&apos;Afrique</span>
            <br />
            dans une main.
          </h2>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.65,
              color: "oklch(95% 0.015 85 / 0.66)",
              maxWidth: 620,
              margin: "0 0 26px",
            }}
          >
            Un directeur ne devrait pas choisir entre enseigner et compter.
            Ridwane porte l&apos;administration — l&apos;école garde les élèves.
          </p>

          <p style={{ fontSize: 14, color: GOLD, fontWeight: 700, margin: 0 }}>
            Fondateur — Ridwane, L&apos;école · Bamako
          </p>
          </div>

          {/*
            Portrait détouré, donc pas de cadre ni de recadrage : on garde
            ses proportions et on le laisse poser sur le fond. L'ombre
            portée de la maquette lui donne son assise — sans elle il
            flotte, découpé aux ciseaux.

            width/height sont ici les dimensions du fichier ; le style
            ramène la largeur au conteneur et laisse la hauteur suivre.
          */}
          <Image
            src={PHOTOS.promoteur.src}
            alt={PHOTOS.promoteur.alt}
            width={PHOTOS.promoteur.width}
            height={PHOTOS.promoteur.height}
            sizes="(max-width: 900px) 90vw, 45vw"
            style={{
              width: "100%",
              maxWidth: 560,
              height: "auto",
              margin: "0 auto",
              filter: "drop-shadow(0 30px 60px oklch(8% 0.02 55 / 0.7))",
            }}
          />
        </div>
      </section>

      {/* --------------------------------------------------------- contact */}
      <section id="contact" className="rd-pad" style={{ padding: "104px 56px" }}>
        <div style={{ maxWidth: 1360, margin: "0 auto" }}>
          <h2
            className="rd-h2"
            style={{
              fontFamily: display,
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              margin: "0 0 18px",
              lineHeight: 1.04,
            }}
          >
            Parlons de votre école.
          </h2>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              color: "oklch(95% 0.015 85 / 0.62)",
              maxWidth: 560,
              margin: "0 0 40px",
            }}
          >
            Appelez ou écrivez directement — nous étudions ensemble vos
            effectifs, vos classes et votre calendrier avant toute mise en route.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
              maxWidth: 760,
            }}
          >
            <a
              href="tel:+22391949768"
              className="rd-card"
              style={{
                padding: "26px 24px",
                borderRadius: 18,
                background: NIGHT_SOFT,
                border: `1px solid ${LINE}`,
                display: "block",
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "oklch(95% 0.015 85 / 0.5)",
                  margin: "0 0 8px",
                }}
              >
                Téléphone
              </p>

              <p
                style={{
                  fontFamily: display,
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                +223 91 94 97 68
              </p>
            </a>

            <a
              href="mailto:ridwaneagrignan123@gmail.com"
              className="rd-card"
              style={{
                padding: "26px 24px",
                borderRadius: 18,
                background: NIGHT_SOFT,
                border: `1px solid ${LINE}`,
                display: "block",
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "oklch(95% 0.015 85 / 0.5)",
                  margin: "0 0 8px",
                }}
              >
                Email
              </p>

              <p
                style={{
                  fontFamily: display,
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                  wordBreak: "break-all",
                }}
              >
                ridwaneagrignan123@gmail.com
              </p>
            </a>
          </div>

          <p
            style={{
              marginTop: 22,
              fontSize: 14,
              color: "oklch(95% 0.015 85 / 0.45)",
            }}
          >
            Bamako · Afrique de l&apos;Ouest · Réponse sous 24 h
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ pied */}
      <footer
        className="rd-pad"
        style={{
          padding: "40px 56px",
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <Logo size="sm" dark />

        <p
          style={{
            fontSize: 13.5,
            color: "oklch(95% 0.015 85 / 0.45)",
            margin: 0,
          }}
        >
          © {new Date().getFullYear()} Ridwane — L&apos;école. Bamako · Afrique de l&apos;Ouest.
        </p>
      </footer>
    </div>
  )
}
