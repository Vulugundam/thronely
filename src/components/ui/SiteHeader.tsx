import Link from "next/link";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Board" },
  { href: "/daily", label: "Today" },
  { href: "/categories", label: "Categories" },
  { href: "/rules", label: "Rules" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-abyss-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Thronely home">
          <Logo />
        </Link>

        {/* Horizontal scroll rather than a hamburger: five short links always
            fit, and it keeps the whole nav reachable without JavaScript. */}
        <nav aria-label="Main" className="-mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-mist transition-colors hover:bg-white/6 hover:text-ivory"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/claim"
          className="btn-claim hidden shrink-0 px-4 py-2 text-sm sm:inline-block"
        >
          Claim a rank
        </Link>
      </div>
    </header>
  );
}
