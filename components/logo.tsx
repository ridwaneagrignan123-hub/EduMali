type LogoProps = {
  size?: "sm" | "md" | "lg"
  dark?: boolean
  withTagline?: boolean
}

const textSizeClasses = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-4xl",
}

const medallionSizes = {
  sm: 30,
  md: 38,
  lg: 56,
}

export function Logo({ size = "md", dark = false, withTagline = false }: LogoProps) {
  const medallion = medallionSizes[size]

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className="flex shrink-0 items-center justify-center rounded-full font-heading font-extrabold"
        style={{
          width: medallion,
          height: medallion,
          fontSize: medallion * 0.5,
          background:
            "linear-gradient(135deg, oklch(0.58 0.15 45), oklch(0.56 0.13 150))",
          color: "white",
        }}
      >
        R
      </span>

      <span className="flex flex-col leading-none">
        <span
          className={`font-heading font-extrabold tracking-tight ${textSizeClasses[size]} ${
            dark ? "text-white" : "text-foreground"
          }`}
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