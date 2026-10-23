import type { ReactNode } from "react";

type QA = { q: string; a: ReactNode };

export const QUESTIONS: QA[] = [
  {
    q: "What am I actually buying?",
    a: (
      <p>
        A position, and nothing else. Your listing appears on the board at a
        rank, and it keeps that rank for as long as its total paid is high
        enough. There is no term, no renewal date, and no contract — the board
        simply re-sorts whenever the numbers change.
      </p>
    ),
  },
  {
    q: "How is the price worked out?",
    a: (
      <p>
        Whatever the listing above you has paid, plus $1. For the top position
        it is the leader&apos;s total plus $5. Empty positions cost the $5
        minimum. You pay the difference between the price of the rank you want
        and what your listing has already paid in total.
      </p>
    ),
  },
  {
    q: "Why did the price change while I was looking at it?",
    a: (
      <p>
        Because someone else paid. Every payment raises the price of the rank it
        occupies, which shifts the prices below it. If the board moves between
        the moment you check out and the moment your payment clears, your money
        is still credited in full — you just land on whatever rank that total now
        earns, and the confirmation tells you which one.
      </p>
    ),
  },
  {
    q: "Someone paid more than me. Did I lose my money?",
    a: (
      <p>
        No. Every payment you have made stays credited to your listing, and
        totals stack. Being passed means your total is no longer the highest —
        not that anything was taken away. Pay the difference and you take the
        rank back.
      </p>
    ),
  },
  {
    q: "Can I pay to move down the board?",
    a: (
      <p>
        That is refused, deliberately. A lower rank costs less than the one you
        are on, so accepting the payment would mean charging you for a
        downgrade. If you want off the board entirely, the payment history does
        not need to be erased — see the question below.
      </p>
    ),
  },
  {
    q: "Can I remove my listing?",
    a: (
      <p>
        Yes. Ask us to hide it and it disappears from the board, from every
        category page, and from pricing. We do not refund the money already
        paid, and we do not remove the record of it from the activity feed,
        because other people&apos;s positions were set against it.
      </p>
    ),
  },
  {
    q: "Are payments recurring?",
    a: (
      <p>
        No. Each claim is a single one-time checkout for the difference. We
        never store your card, and there is no subscription to cancel.
      </p>
    ),
  },
  {
    q: "Is the ranking manipulated to keep me paying?",
    a: (
      <p>
        No. The board sorts by one number — total paid — with an earlier
        timestamp breaking ties. Nothing is weighted, boosted, decayed, or
        curated, and there is no hidden freshness bonus that quietly expires
        your position.
      </p>
    ),
  },
  {
    q: "What happens if I click a listing?",
    a: (
      <p>
        The link goes through a redirect that counts the click, then sends you to
        the listing with a marker identifying Thronely as the source. We record
        a one-way hash of the visitor&apos;s IP address rather than the address
        itself, ignore known bots, and do not follow you anywhere else.
      </p>
    ),
  },
  {
    q: "Is rank an endorsement?",
    a: (
      <p>
        No. A high position means a listing paid the most to be there. Every
        outbound link is labelled as a paid placement. We check submissions
        against a prohibited list, but beyond that we make no claim about any
        listing.
      </p>
    ),
  },
];

/**
 * Plain-text answers for the JSON-LD block.
 *
 * The rendered answers are React nodes, which cannot be serialised, so the
 * structured data carries its own strings. They are kept in the same order as
 * QUESTIONS — a test asserts the two lists stay the same length, so a question
 * cannot be added without its structured-data answer.
 */
export const PLAIN_ANSWERS = [
  "A position on the board, held for as long as your total paid keeps you there. There is no term or renewal.",
  "The listing above you plus $1, or the leader plus $5 for the top rank. Empty positions cost the $5 minimum. You pay the difference against your own total.",
  "Someone else paid, which raised the price of their rank. Your payment is still credited in full and you land on whatever rank your total now earns.",
  "No. Payments stack and nothing is taken away. Being passed just means your total is no longer the highest.",
  "It is refused, because a lower rank costs less and charging for a downgrade would be wrong.",
  "Ask us to hide it. It leaves the board and pricing, but money paid is not refunded and the activity record stays.",
  "No. Each claim is a single one-time checkout. We never store your card and there is no subscription.",
  "No. The board sorts by total paid, with an earlier timestamp breaking ties. Nothing is weighted or curated.",
  "The link counts the click, hashes the visitor IP one-way, ignores known bots, and redirects with a source marker.",
  "No. A high position means that listing paid the most. Every outbound link is labelled as a paid placement.",
];

export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: QUESTIONS.map((item, index) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: PLAIN_ANSWERS[index] },
  })),
};

