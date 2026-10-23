import type { ReactNode } from "react";

/**
 * The shared shell for every text page (/about, /rules, /faq and the legal set).
 *
 * It is deliberately a plain server component with no data access: these pages
 * are fully static, so they prerender into the shell and cost nothing at
 * request time.
 */
export function Prose({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <article>
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-4xl">
            {title}
          </h1>
          {intro && (
            <div className="mt-5 text-base leading-relaxed text-mist">
              {intro}
            </div>
          )}
        </header>
        <div className="mt-10 space-y-8">{children}</div>
      </article>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-ivory">{title}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-mist">
        {children}
      </div>
    </section>
  );
}

/**
 * Marks copy that is a stand-in and must be replaced before launch.
 *
 * It renders visibly rather than as a code comment so the notice cannot be
 * missed in review, and it disappears the moment the real text replaces it.
 */
export function PlaceholderNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-violet-400/30 bg-violet-500/8 px-4 py-3 text-sm text-violet-300">
      <span className="font-semibold uppercase tracking-[0.1em]">
        Placeholder
      </span>{" "}
      — {children}
    </p>
  );
}
