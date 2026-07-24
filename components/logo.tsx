type LogoProps = {
  size?: "sm" | "md" | "lg"
  dark?: boolean
}

const textSizeClasses = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
}

const barHeights = {
  sm: 22,
  md: 30,
  lg: 40,
}

export function Logo({ size = "md", dark = false }: LogoProps) {
  const height = barHeights[size]

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className="relative inline-flex items-end gap-[3px]"
        style={{ height }}
      >
        <span
          className="rounded-t-[7px] rounded-b-[2px]"
          style={{
            width: height * 0.24,
            height: "66%",
            background: "oklch(0.24 0.02 60)",
          }}
        />
        <span
          className="relative rounded-t-[7px] rounded-b-[2px]"
          style={{
            width: height * 0.24,
            height: "100%",
            background: "oklch(0.58 0.15 45)",
          }}
        >
          <span
            className="absolute left-1/2 -top-1.5 -ml-1 h-2 w-2 rounded-full"
            style={{ background: "oklch(0.78 0.14 85)" }}
          />
        </span>
        <span
          className="rounded-t-[7px] rounded-b-[2px]"
          style={{
            width: height * 0.24,
            height: "80%",
            background: "oklch(0.56 0.13 150)",
          }}
        />
      </span>

      <span
        className={`font-heading font-extrabold tracking-tight ${textSizeClasses[size]} ${
          dark ? "text-white" : "text-foreground"
        }`}
      >
        EduMali
      </span>
    </span>
  )
}