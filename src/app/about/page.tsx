import type { Metadata } from "next";
import Link from "next/link";
import { Prose, Section } from "@/components/ui/Prose";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Thronely exists: a leaderboard where the order is set by money, in the open, with the price of every position visible to everyone.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <Prose
      eyebrow="Why this exists"
      title="A leaderboard with the price on the door"
      intro={
        <p>
          Most rankings are decided somewhere you cannot see. A committee, a
          ranking signal, a sponsored slot quietly blended into the results. The
          rule is never stated, so it can never be checked.
        </p>
      }
    >
      <Section title="The honest version of the same thing">
        <p>
          Thronely does the thing everybody suspects is already happening, and
          does it openly. Position on this board is bought. The price of every
          rank is public, the total behind every listing is public, and the
          sorting rule is two sentences long.
        </p>
        <p>
          Nothing about that is subtle, which is the point. You can look at the
          board and know exactly why each listing is where it is.
        </p>
      </Section>

      <Section title="A market, not a fee schedule">
        <p>
          We do not set the prices. The board does. Each rank costs whatever the
          listing standing on it has paid, plus a small step — $1 to pass a
          listing, $5 on top to take the throne. When someone raises their
          total, the price of passing them rises with it, and the whole column
          of prices adjusts.
        </p>
        <p>
          That means the board is a live picture of what a position is worth to
          the people competing for it, rather than a rate card somebody guessed
          at.
        </p>
      </Section>

      <Section title="What we are not claiming">
        <p>
          Rank on Thronely is not an endorsement, a quality signal, or a
          recommendation. A high position means one thing: that listing paid the
          most to be there. We say so on every link that leaves this site.
        </p>
        <p>
          Listings are checked against a prohibited list before they go up, and
          we will remove one that slips through. Beyond that, we have no opinion
          about who is on the board.
        </p>
      </Section>

      <Section title="Built to be looked at">
        <p>
          The board is rendered as a throne room: a podium with the top three
          standings, blocks whose height is the money behind them, and a crown
          that moves when the top spot changes hands. It is decorative, and it
          is optional — the same information is here as plain text, and the
          board works with the 3D layer switched off entirely.
        </p>
      </Section>

      <p className="text-sm text-slate-dim">
        Start with{" "}
        <Link
          href="/rules"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          the rules
        </Link>
        , or go straight to{" "}
        <Link
          href="/"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          the board
        </Link>
        .
      </p>
    </Prose>
  );
}
