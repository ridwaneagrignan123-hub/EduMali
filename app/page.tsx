import Link from "next/link"
import { Logo } from "@/components/logo"

const features = [
  {
    title: "Inscriptions",
    desc: "Enregistrez et suivez les inscriptions des élèves en quelques clics, du dossier à la classe.",
    bg: "oklch(58% 0.15 45 / 0.12)",
    color: "oklch(58% 0.15 45)",
    shape: "8px",
  },
  {
    title: "Notes & bulletins",
    desc: "Saisie des notes, génération automatique des bulletins conformes au système malien.",
    bg: "oklch(56% 0.13 150 / 0.12)",
    color: "oklch(56% 0.13 150)",
    shape: "50%",
  },
  {
    title: "Classes & matières",
    desc: "Organisez vos classes, affectez les matières et les enseignants avec les bons coefficients.",
    bg: "oklch(78% 0.14 85 / 0.18)",
    color: "oklch(60% 0.14 85)",
    shape: "3px",
  },
  {
    title: "Évaluations",
    desc: "Créez des évaluations par classe et par matière, avec notes maximales et coefficients.",
    bg: "oklch(58% 0.15 45 / 0.12)",
    color: "oklch(58% 0.15 45)",
    shape: "50% 50% 50% 0",
  },
  {
    title: "Moyennes & classement",
    desc: "Calcul automatique des moyennes pondérées et du classement par classe.",
    bg: "oklch(56% 0.13 150 / 0.12)",
    color: "oklch(56% 0.13 150)",
    shape: "50%",
  },
  {
    title: "Gestion par rôle",
    desc: "Chaque utilisateur — direction ou enseignant — accède à un espace adapté à son rôle.",
    bg: "oklch(78% 0.14 85 / 0.18)",
    color: "oklch(60% 0.14 85)",
    shape: "8px",
  },
]

const roles = [
  { name: "Directeurs", color: "oklch(58% 0.15 45)" },
  { name: "Enseignants", color: "oklch(56% 0.13 150)" },
  { name: "Personnel admin.", color: "oklch(78% 0.14 85)" },
  { name: "Parents", color: "oklch(58% 0.15 45)" },
  { name: "Élèves", color: "oklch(56% 0.13 150)" },
  { name: "Comptabilité", color: "oklch(78% 0.14 85)" },
]

const bars = [40, 65, 50, 80, 60, 95, 72]

export default function Home() {
  return (
    <div
      style={{
        fontFamily: "var(--font-manrope), sans-serif",
        background: "oklch(97.5% 0.01 80)",
        color: "oklch(20% 0.02 60)",
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes ka-fadeup { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
        @keyframes ka-drift { 0%,100%{ transform:translate(0,0) rotate(0deg);} 50%{ transform:translate(10px,-14px) rotate(4deg);} }
        @keyframes ka-drift2 { 0%,100%{ transform:translate(0,0) rotate(0deg);} 50%{ transform:translate(-14px,10px) rotate(-5deg);} }
        @keyframes ka-grow { from { transform: scaleY(0);} to { transform: scaleY(1);} }
        @keyframes kalanso-rise { 0% { transform: scaleY(0); opacity: 0; } 60% { transform: scaleY(1.08); opacity: 1; } 100% { transform: scaleY(1); opacity: 1; } }
        @keyframes kalanso-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes kalanso-glow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .edumali-hero-link:hover { background: oklch(52% 0.15 45) !important; }
        .edumali-outline-link:hover { border-color: oklch(20% 0.02 60 / 0.4) !important; }
        .edumali-nav-cta:hover { background: oklch(30% 0.02 60) !important; }
        .edumali-feature-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px oklch(20% 0.02 60 / 0.08); }
      `}</style>

      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 64px",
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "oklch(97.5% 0.01 80 / 0.85)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid oklch(20% 0.02 60 / 0.06)",
        }}
      >
        <Logo size="md" />

        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <a
            href="#fonctionnalites"
            style={{ fontWeight: 600, fontSize: 15, color: "oklch(20% 0.02 60)" }}
          >
            Fonctionnalités
          </a>

          <a
            href="#public"
            style={{ fontWeight: 600, fontSize: 15, color: "oklch(20% 0.02 60)" }}
          >
            Pour qui ?
          </a>

          <Link
            href="/login"
            className="edumali-nav-cta"
            style={{
              padding: "11px 24px",
              background: "oklch(24% 0.02 60)",
              color: "oklch(98% 0.005 80)",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Se connecter
          </Link>
        </div>
      </nav>

      <section
        style={{
          position: "relative",
          padding: "100px 64px 120px",
          display: "flex",
          alignItems: "center",
          gap: 60,
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 80,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(78% 0.14 85 / 0.35), transparent 70%)",
            animation: "ka-drift 7s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 280,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(56% 0.13 150 / 0.25), transparent 70%)",
            animation: "ka-drift2 8s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              background: "oklch(58% 0.15 45 / 0.1)",
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 700,
              color: "oklch(48% 0.15 45)",
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "oklch(58% 0.15 45)",
              }}
            />
            Conçu pour les écoles du Mali
          </div>

          <h1
            style={{
              fontFamily: "var(--font-plus-jakarta), sans-serif",
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              margin: "0 0 24px",
            }}
          >
            <span style={{ color: "oklch(58% 0.15 45)" }}>Ridwane</span>
            <br />
            L&apos;école, simplement.
          </h1>

          <p
            style={{
              fontSize: 19,
              lineHeight: 1.6,
              color: "oklch(35% 0.02 60)",
              maxWidth: 520,
              margin: "0 0 36px",
            }}
          >
            Inscriptions, notes, bulletins, classes et matières dans une
            seule plateforme pensée pour les établissements maliens.
          </p>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Link
              href="/login"
              className="edumali-hero-link"
              style={{
                padding: "16px 30px",
                background: "oklch(58% 0.15 45)",
                color: "white",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 16,
                boxShadow: "0 12px 30px oklch(58% 0.15 45 / 0.35)",
              }}
            >
              Se connecter →
            </Link>

            <a
              href="#fonctionnalites"
              className="edumali-outline-link"
              style={{
                padding: "16px 28px",
                fontWeight: 700,
                fontSize: 16,
                color: "oklch(20% 0.02 60)",
                border: "1.5px solid oklch(20% 0.02 60 / 0.15)",
                borderRadius: 12,
              }}
            >
              Découvrir
            </a>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div
            style={{
              background: "oklch(24% 0.02 60)",
              borderRadius: 24,
              padding: 20,
              boxShadow: "0 40px 80px oklch(20% 0.02 60 / 0.25)",
              transform: "rotate(1.2deg)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 14,
                paddingLeft: 6,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "oklch(65% 0.15 25)",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "oklch(75% 0.13 85)",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "oklch(60% 0.13 150)",
                }}
              />
            </div>

            <div
              style={{
                background: "oklch(97.5% 0.01 80)",
                borderRadius: 14,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-plus-jakarta), sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  Aperçu des moyennes
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: 110,
                }}
              >
                {bars.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      background:
                        i === 5
                          ? "oklch(58% 0.15 45)"
                          : "oklch(56% 0.13 150 / 0.55)",
                      borderRadius: "6px 6px 2px 2px",
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: 14,
                  borderTop: "1px solid oklch(20% 0.02 60 / 0.08)",
                }}
              >
                <div style={{ fontSize: 13, color: "oklch(45% 0.02 60)" }}>
                  Par classe et par matière
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "oklch(58% 0.15 45)",
                  }}
                >
                  Calcul automatique
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="fonctionnalites"
        style={{ padding: "100px 64px", maxWidth: 1400, margin: "0 auto" }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 640,
            margin: "0 auto 64px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "oklch(58% 0.15 45)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            Fonctionnalités
          </div>

          <h2
            style={{
              fontFamily: "var(--font-plus-jakarta), sans-serif",
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Tout ce qu'il faut pour piloter votre école
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              className="edumali-feature-card"
              style={{
                background: "white",
                border: "1px solid oklch(20% 0.02 60 / 0.07)",
                borderRadius: 18,
                padding: 32,
                transition: "transform 0.2s",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: f.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: f.shape,
                    background: f.color,
                  }}
                />
              </div>

              <h3
                style={{
                  fontFamily: "var(--font-plus-jakarta), sans-serif",
                  fontSize: 19,
                  fontWeight: 700,
                  margin: "0 0 8px",
                }}
              >
                {f.title}
              </h3>

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "oklch(45% 0.02 60)",
                  margin: 0,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="public"
        style={{ padding: "80px 64px 120px", maxWidth: 1400, margin: "0 auto" }}
      >
        <div
          style={{
            background: "oklch(24% 0.02 60)",
            borderRadius: 28,
            padding: 64,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-plus-jakarta), sans-serif",
                fontSize: 34,
                fontWeight: 800,
                color: "white",
                letterSpacing: "-0.02em",
                margin: "0 0 16px",
              }}
            >
              Une plateforme, tous les acteurs de l'école
            </h2>

            <p
              style={{
                fontSize: 16,
                lineHeight: 1.7,
                color: "oklch(85% 0.01 80 / 0.8)",
                margin: 0,
              }}
            >
              Directeurs, enseignants, personnel administratif, parents et
              élèves accèdent chacun à un espace pensé pour leur rôle.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {roles.map((r) => (
              <div
                key={r.name}
                style={{
                  background: "oklch(30% 0.02 60)",
                  borderRadius: 14,
                  padding: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: r.color,
                    flexShrink: 0,
                  }}
                />

                <span
                  style={{
                    color: "white",
                    fontWeight: 600,
                    fontSize: 14.5,
                  }}
                >
                  {r.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer
        style={{
          padding: "48px 64px",
          borderTop: "1px solid oklch(20% 0.02 60 / 0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Logo size="sm" />

        <span style={{ fontSize: 13, color: "oklch(45% 0.02 60)" }}>
          © {new Date().getFullYear()} Ridwane — Fait au Mali, pour les
          écoles maliennes.
        </span>
      </footer>
    </div>
  )
}