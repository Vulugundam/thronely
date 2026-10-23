import type { SVGProps } from "react";

/**
 * The Thronely mark: an abstract three-tier podium carrying a notched crown,
 * standing on a plinth. Drawn entirely from primitives — no third-party marks,
 * no raster assets, nothing traced.
 *
 * The three bars are deliberately ordered by height to mirror the board itself:
 * #1 occupies the tall centre block, #2 and #3 flank it.
 */
export function LogoMark({
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  // Rendered via <title> + aria-label so it announces meaningfully rather than
  // reading as an unlabelled graphic.
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title ?? "Thronely"}
      {...props}
    >
      <defs>
        <linearGradient id="thronely-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.9 0.09 88)" />
          <stop offset="100%" stopColor="oklch(0.66 0.13 75)" />
        </linearGradient>
        <linearGradient id="thronely-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.2 295)" />
          <stop offset="100%" stopColor="oklch(0.52 0.24 292)" />
        </linearGradient>
      </defs>

      {/* Crown — three peaks over the winning block. */}
      <path
        d="M12 8 L12 4.6 L14.2 6.4 L16 3 L17.8 6.4 L20 4.6 L20 8 Z"
        fill="url(#thronely-gold)"
      />

      {/* Podium: #2 (left), #1 (centre, tallest), #3 (right). */}
      <rect x="4.5" y="14" width="6" height="12" rx="1" fill="url(#thronely-violet)" />
      <rect x="13" y="9.5" width="6" height="16.5" rx="1" fill="url(#thronely-gold)" />
      <rect x="21.5" y="18.5" width="6" height="7.5" rx="1" fill="url(#thronely-violet)" />

      {/* Plinth. */}
      <rect x="2.5" y="26.5" width="27" height="2.5" rx="1.25" fill="url(#thronely-gold)" />
    </svg>
  );
}

/** Mark plus wordmark, for the header. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark className="h-7 w-7 shrink-0" />
      <span className="font-display text-lg font-bold tracking-[0.02em]">
        <span className="text-ivory">Throne</span>
        <span className="rank-numeral">ly</span>
      </span>
    </span>
  );
}
