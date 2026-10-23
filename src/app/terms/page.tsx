import type { Metadata } from "next";
import Link from "next/link";
import { Prose, PlaceholderNote, Section } from "@/components/ui/Prose";

/** Static on purpose: reading the clock here would break prerendering. */
export const LAST_UPDATED = "17 October 2026";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms covering your use of Thronely, the purchase of rank, and what we do and do not promise about listings on the board.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <Prose
      eyebrow="The fine print"
      title="Terms of service"
      intro={
        <>
          <p>
            These terms govern your use of Thronely and any rank you buy on it.
          </p>
          <p className="mt-4 text-sm text-slate-dim">
            Last updated {LAST_UPDATED}.
          </p>
        </>
      }
    >
      <PlaceholderNote>
        this document is a working draft written to be structurally complete.
        Have it reviewed by a qualified lawyer in your jurisdiction before you
        accept real payments or launch publicly.
      </PlaceholderNote>

      <Section title="1. What Thronely is">
        <p>
          Thronely is a leaderboard on which listings are ordered by the total
          amount paid for them. We are not a directory, a review site, or an
          endorsement service. A position on the board reflects money paid and
          nothing else.
        </p>
      </Section>

      <Section title="2. Your account and your listing">
        <p>
          You are responsible for the accuracy of everything you submit,
          including the destination URL, the title, and the description. You
          must have the right to promote the destination you submit — you cannot
          list a site you do not control or are not authorised to represent.
        </p>
        <p>
          You are responsible for the destination itself. It must keep working,
          and it must keep complying with these terms and with the law, for as
          long as your listing is on the board.
        </p>
      </Section>

      <Section title="3. Prohibited listings">
        <p>
          We may refuse or remove any listing at our discretion, and we will
          refuse submissions that match our prohibited list. That list covers,
          among other things: unlawful goods and services, adult content,
          malware and phishing, deceptive or impersonating sites, listings that
          infringe someone else&apos;s rights, and anything targeting a
          protected group.
        </p>
        <p>
          Where a listing is removed for breaching these terms, the money paid
          is not refunded. See{" "}
          <Link
            href="/refunds"
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
          >
            refunds
          </Link>
          .
        </p>
      </Section>

      <Section title="4. Payments and pricing">
        <p>
          Rank is purchased in one-time payments. The price of a rank is derived
          from the board at the moment of checkout, as described in{" "}
          <Link
            href="/rules"
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
          >
            the rules
          </Link>
          . Prices are in US dollars and are whole dollar amounts.
        </p>
        <p>
          We may change how prices are calculated going forward, but a change
          never reduces the amount you have already paid, and it never removes
          money from your total. Payments already credited stay credited.
        </p>
      </Section>

      <Section title="5. When a payment counts">
        <p>
          A claim takes effect only once the payment has been confirmed by our
          payment processor. Until then the board does not change. If a payment
          fails, expires, or is later reversed, the corresponding rank may be
          withdrawn and the board recomputed.
        </p>
      </Section>

      <Section title="6. No guarantee of position or traffic">
        <p>
          We do not promise any particular rank, that a rank will be held for
          any period, that the board will look a certain way, or that a listing
          will receive any clicks or traffic at all. Other people can pay to
          pass you, and the prices of the ranks below you move when they do.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          We aim to keep the board up, but we do not guarantee uninterrupted
          availability. We may suspend the service for maintenance, and we may
          change or discontinue features. If we discontinue the service
          entirely, we will give notice on this site.
        </p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Thronely is provided
          &ldquo;as is&rdquo;, and our total liability to you for any claim
          arising out of the service is limited to the amount you paid us in the
          twelve months before the claim arose. We are not liable for indirect
          or consequential losses, including lost profits or lost traffic.
        </p>
      </Section>

      <Section title="9. Changes to these terms">
        <p>
          We may update these terms. Material changes will be announced on this
          site with a new &ldquo;last updated&rdquo; date. Continuing to use
          Thronely after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about these terms:{" "}
          <span className="text-mist">support@example.com</span> (placeholder
          address — replace with your real contact before launch).
        </p>
      </Section>
    </Prose>
  );
}
