import Link from "next/link";
import { LogoMark } from "./Logo";

/** Bump on the annual deploy; see the note at the usage site. */
const COPYRIGHT_YEAR = 2026;

const COLUMNS = [
  {
    title: "The board",
    links: [
      { href: "/", label: "All-time" },
      { href: "/daily", label: "Today" },
      { href: "/categories", label: "Categories" },
      { href: "/claim", label: "Claim a rank" },
    ],
  },
  {
    title: "Understand it",
    links: [
      { href: "/about", label: "About" },
      { href: "/rules", label: "Rules & pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "The fine print",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/refunds", label: "Refunds" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/8">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <LogoMark className="h-8 w-8" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-mist">
            A leaderboard you can buy your way up. Every rank is a real price,
            set by whoever is standing on it.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-dim">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-mist transition-colors hover:text-gold-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-white/8 px-4 py-6 text-xs text-slate-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {/*
          The year is a build-time constant on purpose. Reading the clock here
          would make the footer an "unstable value" and fail prerendering of the
          static shell, which the whole site depends on. A yearly redeploy is a
          far better trade than a dynamic footer.
        */}
        <p>© {COPYRIGHT_YEAR} Thronely. All rights reserved.</p>
        <p>
          Outbound listings are paid placements and are marked as sponsored.
        </p>
      </div>
    </footer>
  );
}
