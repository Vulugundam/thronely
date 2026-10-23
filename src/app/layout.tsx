import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { RenderModeProvider } from "@/components/three/RenderModeProvider";

// Cinzel carries the heraldic, struck-metal feel for rank numerals and
// headings; Inter keeps body copy plain and legible.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Thronely — the leaderboard you can buy your way up",
    template: "%s · Thronely",
  },
  description:
    "Thronely is a pay-to-rank leaderboard. Every position has a real price, set by whoever is standing on it. Claim a rank, hold it, or watch it get taken.",
  openGraph: {
    type: "website",
    siteName: "Thronely",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:font-semibold focus:text-abyss-950"
        >
          Skip to content
        </a>
        {/*
          The render-mode provider wraps the whole app so a single decision —
          detection, the stored preference, the frame-rate probe — drives every
          scene. It renders no DOM of its own, so it costs nothing to be here.
        */}
        <RenderModeProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </RenderModeProvider>
      </body>
    </html>
  );
}
