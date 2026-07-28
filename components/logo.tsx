type LogoProps = {
  size?: "sm" | "md" | "lg"
  dark?: boolean
  withTagline?: boolean
  /** Coupe les animations : utile à l'impression et dans les listes denses. */
  still?: boolean
}

const textSizeClasses = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-4xl",
}

// Largeur du médaillon. La façade garde son rapport 64 × 70.
const markSizes = {
  sm: 26,
  md: 34,
  lg: 52,
}

/*
 * Identité Ridwane : une façade soudano-sahélienne.
 *
 * Les barres qui dépassent de part et d'autre sont les *toron*, ces poutres
 * de bois caractéristiques de l'architecture de terre au Mali — Djenné,
 * Tombouctou. La porte s'éclaire, signe que l'école est ouverte.
 *
 * Le tracé se dessine en boucle et les toron oscillent doucement ; `still`
 * fige l'ensemble là où le mouvement nuirait.
 */
export function Logo({
  size = "md",
  dark = false,
  withTagline = false,
  still = false,
}: LogoProps) {
  const mark = markSizes[size]
  const height = Math.round((mark * 70) / 64)

  // Identifiant unique : deux logos sur une même page ne doivent pas
  // partager leur masque SVG.
  const clipId = `rd-door-${size}${dark ? "-d" : ""}`

  return (
    <span className="inline-flex select-none items-center gap-2.5">
      <style>{`
        @keyframes rd-draw { 0% { stroke-dashoffset: 300; } 45%, 100% { stroke-dashoffset: 0; } }
        @keyframes rd-toron { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
        @keyframes rd-light { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
        @keyframes rd-halo { 0%, 100% { opacity: 0.35; transform: scale(0.94); } 50% { opacity: 0.7; transform: scale(1.06); } }
        @media (prefers-reduced-motion: reduce) {
          .rd-mark * { animation: none !important; }
        }
      `}</style>

      <span
        className="relative block shrink-0"
        style={{ width: mark, height }}
      >
        <span
          aria-hidden
          className="absolute"
          style={{
            left: "50%",
            top: "52%",
            width: mark * 1.14,
            height: mark * 1.14,
            margin: `${-(mark * 0.57)}px 0 0 ${-(mark * 0.57)}px`,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, oklch(80% 0.15 78 / 0.9), transparent 68%)",
            animation: still ? undefined : "rd-halo 5.5s ease-in-out infinite",
          }}
        />

        <svg
          viewBox="0 0 64 70"
          width={mark}
          height={height}
          role="img"
          aria-label="Ridwane"
          className="rd-mark relative block"
          style={{ overflow: "visible" }}
        >
          <defs>
            <clipPath id={clipId}>
              <path d="M25 66 V44 Q32 33 39 44 V66 Z" />
            </clipPath>
          </defs>

          {/* Lumière derrière la porte */}
          <g clipPath={`url(#${clipId})`}>
            <rect
              x="24"
              y="30"
              width="16"
              height="40"
              fill="oklch(80% 0.15 78)"
              opacity="0.16"
            />
            <rect
              x="24"
              y="36"
              width="16"
              height="12"
              fill="oklch(88% 0.14 82)"
              style={{
                animation: still
                  ? undefined
                  : "rd-light 3.6s cubic-bezier(.4,0,.3,1) infinite",
              }}
            />
            <rect
              x="24"
              y="36"
              width="16"
              height="6"
              fill="oklch(70% 0.16 45)"
              style={{
                animation: still
                  ? undefined
                  : "rd-light 3.6s cubic-bezier(.4,0,.3,1) 1.2s infinite",
              }}
            />
          </g>

          {/* Silhouette de la façade */}
          <path
            d="M11 66 V26 L18 13 V6 L23.5 13 L32 2 L40.5 13 L46 6 V13 L53 26 V66"
            fill="none"
            stroke={dark ? "oklch(95% 0.015 85)" : "currentColor"}
            strokeWidth="3.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="300"
            style={{
              animation: still
                ? undefined
                : "rd-draw 7s cubic-bezier(.5,0,.2,1) infinite",
            }}
          />

          {/* Arc de la porte */}
          <path
            d="M25 66 V44 Q32 33 39 44 V66"
            fill="none"
            stroke="oklch(60% 0.17 38)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Toron : poutres saillantes, à gauche puis à droite */}
          {[
            { y: 32, fill: "oklch(80% 0.15 78)", delay: "0s" },
            { y: 44, fill: "oklch(60% 0.13 155)", delay: "0.35s" },
            { y: 56, fill: "oklch(80% 0.15 78)", delay: "0.7s" },
          ].map((bar) => (
            <rect
              key={`g-${bar.y}`}
              x="3"
              y={bar.y}
              width="12"
              height="3.4"
              rx="1.7"
              fill={bar.fill}
              style={{
                animation: still
                  ? undefined
                  : `rd-toron 2.8s ease-in-out ${bar.delay} infinite`,
              }}
            />
          ))}

          {[
            { y: 32, fill: "oklch(80% 0.15 78)", delay: "0.5s" },
            { y: 44, fill: "oklch(60% 0.13 155)", delay: "0.85s" },
            { y: 56, fill: "oklch(80% 0.15 78)", delay: "1.2s" },
          ].map((bar) => (
            <rect
              key={`d-${bar.y}`}
              x="49"
              y={bar.y}
              width="12"
              height="3.4"
              rx="1.7"
              fill={bar.fill}
              style={{
                animation: still
                  ? undefined
                  : `rd-toron 2.8s ease-in-out ${bar.delay} infinite`,
              }}
            />
          ))}
        </svg>
      </span>

      <span className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold tracking-tight ${textSizeClasses[size]} ${
            dark ? "text-white" : "text-foreground"
          }`}
          style={{ letterSpacing: "-0.03em" }}
        >
          Ridwane
        </span>

        {withTagline && (
          <span
            className={`mt-1 text-xs font-medium ${
              dark ? "text-white/70" : "text-muted-foreground"
            }`}
          >
            L&apos;école, simplement.
          </span>
        )}
      </span>
    </span>
  )
}
