import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Every outbound listing link goes through /go/[slug], which records the click
 * and then redirects to the real destination with `utm_source=thronely`.
 *
 * `rel="sponsored nofollow"` is set on all of them: these are paid placements,
 * and both Google's and the FTC's guidance treat a paid link as sponsored.
 * `target="_blank"` keeps the board from losing the visitor's place.
 */
export function OutboundLink({
  slug,
  children,
  className,
  showHost = false,
  url,
}: {
  slug: string;
  children: ReactNode;
  className?: string;
  /** Renders the destination host after the label, as a subtle trust cue. */
  showHost?: boolean;
  url?: string;
}) {
  let host: string | null = null;
  if (showHost && url) {
    try {
      host = new URL(url).host.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }

  return (
    <Link
      href={`/go/${slug}`}
      rel="sponsored nofollow"
      target="_blank"
      className={className}
    >
      {children}
      {host ? (
        <span className="ml-1.5 text-xs text-slate-dim">({host})</span>
      ) : null}
    </Link>
  );
}
