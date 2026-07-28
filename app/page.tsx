import Link from "next/link"
import { Logo } from "@/components/logo"

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

const schoolTypes = [
  { name: "Medersas", note: "Calendrier et matières adaptés", color: GOLD },
  {
    name: "Écoles publiques",
    note: "Effectifs importants, gratuité",
    color: GREEN,
  },
  { name: "Lycées & techniques", note: "Séries, options, examens", color: CLAY },
  { name: "Écoles privées", note: "Facturation et relances", color: GOLD },
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

const apercuClasses = [
  { libelle: "6ᵉ A — Mathématiques", moyenne: "14,2", couleur: GREEN },
  { libelle: "5ᵉ B — Français", moyenne: "12,8", couleur: GOLD },
  { libelle: "4ᵉ A — Sciences", moyenne: "15,6", couleur: GREEN },
  { libelle: "3ᵉ C — Histoire", moyenne: "11,4", couleur: CLAY },
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
          .rd-pad { padding-left: 22px !important; padding-right: 22px !important; }
          .rd-h1 { font-size: 46px !important; }
          .rd-h2 { font-size: 32px !important; }
          .rd-nav-links { display: none !important; }
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
                malienne,
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
              familles — pour toutes les écoles du Mali, publiques comme privées,
              medersas comme lycées.
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
            La maquette montrait une photographie à cet endroit. Faute de
            l'image, un aperçu construit avec la palette : il montre ce que
            l'application affiche réellement, plutôt qu'un visuel décoratif.
          */}
          <div
            aria-hidden
            style={{
              position: "relative",
              borderRadius: 26,
              border: `1px solid ${LINE}`,
              background: NIGHT_SOFT,
              padding: 26,
              animation: "rd-rise .8s ease .35s both",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 22,
              }}
            >
              <span
                style={{ fontFamily: display, fontWeight: 700, fontSize: 17 }}
              >
                Lycée de Badalabougou
              </span>
              <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>
                640 élèves
              </span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {apercuClasses.map((ligne) => (
                <div
                  key={ligne.libelle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "13px 16px",
                    borderRadius: 13,
                    background: "oklch(95% 0.015 85 / 0.04)",
                    border: `1px solid ${LINE}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      color: "oklch(95% 0.015 85 / 0.75)",
                    }}
                  >
                    {ligne.libelle}
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: ligne.couleur,
                    }}
                  >
                    {ligne.moyenne}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 20,
                paddingTop: 18,
                borderTop: `1px solid ${LINE}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 13,
                color: "oklch(95% 0.015 85 / 0.5)",
              }}
            >
              <span>Bulletins du 1ᵉʳ trimestre</span>
              <span style={{ color: GREEN, fontWeight: 700 }}>Prêts</span>
            </div>
          </div>
        </div>
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
            Chaque élève du Mali, dans un même système.
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
                  padding: "26px 24px",
                  borderRadius: 18,
                  background: NIGHT_SOFT,
                  border: `1px solid ${LINE}`,
                }}
              >
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
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
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
            Toutes les <span style={{ color: GOLD }}>écoles du Mali</span>
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
            Bamako, Mali · Réponse sous 24 h
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
          © {new Date().getFullYear()} Ridwane — L&apos;école. Bamako, Mali.
        </p>
      </footer>
    </div>
  )
}
