import type { Metadata } from "next";
import Link from "next/link";
import { Prose, Section } from "@/components/ui/Prose";

export const metadata: Metadata = {
  title: "Rules & pricing",
  description:
    "How Thronely prices every rank, what happens when you claim one, and the exact rules that decide the order of the board.",
  alternates: { canonical: "/rules" },
};

export default function RulesPage() {
  return (
    <Prose
      eyebrow="The mechanics"
      title="Rules & pricing"
      intro={
        <p>
          Thronely is a leaderboard where position is bought, not voted on.
          There is no algorithm and no editorial judgement: the board is sorted
          by one number, and anyone can raise theirs.
        </p>
      }
    >
      <Section title="The board is sorted by one number">
        <p>
          Every listing has a <strong className="text-ivory">total paid</strong>.
          The board sorts by that number, highest first. Nothing else is
          consulted, so you can always compute your own position from public
          data.
        </p>
        <p>
          If two listings have paid exactly the same amount, the one that
          reached that amount <em>earlier</em> sits above the other. That
          tiebreak exists so the order is never ambiguous.
        </p>
      </Section>

      <Section title="What a rank costs">
        <p>
          Each rank has a price, and the price is set by whoever currently holds
          it. You pay the difference between that price and what you have
          already paid — never the whole amount again.
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-ivory">Rank 1</strong> costs the current
            leader&apos;s total paid, plus a $5 surcharge on the position.
          </li>
          <li>
            <strong className="text-ivory">Any other occupied rank</strong>{" "}
            costs the listing standing there, plus $1.
          </li>
          <li>
            <strong className="text-ivory">An empty rank</strong> costs the $5
            minimum to list.
          </li>
          <li>
            A first listing is <strong className="text-ivory">$5 minimum</strong>
            , in any position.
          </li>
        </ul>
        <p>
          All prices are whole dollars. A single checkout is capped at $10,000.
        </p>
      </Section>

      <Section title="Money stacks">
        <p>
          Payments accumulate against a listing. If you pay $20 today and $15
          next week, your listing holds rank with $35. You are never buying a
          rank for a fixed term — you are holding a total, and someone else can
          pass it.
        </p>
        <p>
          Because of that, a purchase can never take you <em>down</em> the
          board. If the board moved while you were checking out and your payment
          no longer reaches the rank you aimed at, the money is still credited
          in full and your listing simply lands wherever that total now places
          it.
        </p>
      </Section>

      <Section title="Rank changes only when money clears">
        <p>
          Nothing moves on a click or a redirect. A claim is applied only after
          the payment is confirmed by our payment processor. An abandoned or
          failed checkout leaves the board untouched, and a repeated
          confirmation of the same payment can never be credited twice.
        </p>
      </Section>

      <Section title="Two views of the same board">
        <p>
          <strong className="text-ivory">All-time</strong> is cumulative: every
          dollar a listing has ever paid.
        </p>
        <p>
          <strong className="text-ivory">Today</strong> counts only money paid
          since 00:00 UTC. It is a read-only lens for seeing what is moving right
          now — it does not change any price. Claims are always priced against
          the all-time board, because a total is a permanent thing.
        </p>
      </Section>

      <Section title="What we will not list">
        <p>
          Listings are reviewed and a submission is refused if it matches our
          prohibited list. That list covers unlawful goods and services, adult
          content, malware, deceptive or impersonating sites, and anything
          targeting a protected group. We check at submission, and we can hide a
          listing later if it turns out to break these rules.
        </p>
        <p>
          Hiding a listing removes it from both the board and its pricing, so
          ranks stay contiguous and a visitor never sees a gap in the numbering.
        </p>
      </Section>

      <Section title="Everything you see is labelled">
        <p>
          Every outbound listing link on Thronely is a paid placement, is marked{" "}
          <code className="rounded bg-white/8 px-1.5 py-0.5 text-sm text-ivory">
            sponsored
          </code>{" "}
          for search engines, and opens in a new tab.
        </p>
      </Section>

      <p className="text-sm text-slate-dim">
        See also{" "}
        <Link
          href="/faq"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          the FAQ
        </Link>
        ,{" "}
        <Link
          href="/refunds"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          refunds
        </Link>
        , and{" "}
        <Link
          href="/terms"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          the terms
        </Link>
        .
      </p>
    </Prose>
  );
}
