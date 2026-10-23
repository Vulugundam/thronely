import type { Metadata } from "next";
import Link from "next/link";
import { Prose, PlaceholderNote, Section } from "@/components/ui/Prose";

export const LAST_UPDATED = "17 October 2026";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Thronely collects, why, how long it is kept, and what we deliberately do not collect — including why click tracking uses a one-way hash instead of your IP address.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <Prose
      eyebrow="The fine print"
      title="Privacy policy"
      intro={
        <>
          <p>
            This describes what Thronely collects, why it is collected, and how
            long it is kept. It is written to match what the software actually
            does.
          </p>
          <p className="mt-4 text-sm text-slate-dim">
            Last updated {LAST_UPDATED}.
          </p>
        </>
      }
    >
      <PlaceholderNote>
        this draft reflects the data the application actually handles. Have it
        reviewed against the law that applies to you, and fill in the contact
        details, before launch.
      </PlaceholderNote>

      <Section title="What we collect">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="text-ivory">Listing details</strong> — the URL,
            title, description, and category you submit. These are public: they
            appear on the board.
          </li>
          <li>
            <strong className="text-ivory">Payment records</strong> — the amount
            and time of each payment, and the identifier of the checkout session
            it came from. We do not receive or store your card number: card
            details go directly to our payment processor.
          </li>
          <li>
            <strong className="text-ivory">Click records</strong> — one row each
            time someone follows a listing link out of Thronely.
          </li>
        </ul>
      </Section>

      <Section title="What we deliberately do not collect">
        <ul className="ml-5 list-disc space-y-2">
          <li>No advertising or cross-site tracking cookies.</li>
          <li>No third-party analytics scripts following you between sites.</li>
          <li>
            No raw IP addresses in our click records — see the next section.
          </li>
          <li>No card details, ever.</li>
        </ul>
      </Section>

      <Section title="How click tracking works">
        <p>
          When you follow a listing link, we record a one-way hash of your IP
          address together with a secret key held by the server, along with the
          time, your browser&apos;s user-agent string, and the page you came
          from. The hash is not reversible into an address, and because the key
          is secret it cannot be reconstructed from the hash alone by anyone who
          obtains the database.
        </p>
        <p>
          The hash exists to answer one question — whether two clicks are the
          same visitor in a short window — so a single person refreshing a page
          does not inflate a listing&apos;s count. It is not used to build a
          profile, and it is not linked to anything you do elsewhere.
        </p>
        <p>
          We ignore requests we identify as automated crawlers, so routine
          indexing does not appear as a click.
        </p>
      </Section>

      <Section title="Why we use it">
        <ul className="ml-5 list-disc space-y-2">
          <li>To run the board and compute ranks from payments.</li>
          <li>To show listings how many people clicked through to them.</li>
          <li>To prevent fraudulent payments and abusive submissions.</li>
          <li>To keep the service working and diagnose faults.</li>
        </ul>
      </Section>

      <Section title="Payments">
        <p>
          Payments are handled by our payment processor. Their own privacy terms
          cover the card details you give them. We receive only a confirmation
          that a payment succeeded, what it was for, and the amount — enough to
          credit a listing and nothing more.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Board listings and payment records are kept while the listing exists
          and afterwards, because the historical board is the product: other
          listings&apos; positions were set against those totals. Click records
          are kept in aggregate form and are not used to identify individuals.
          If you want your listing removed, see{" "}
          <Link
            href="/refunds"
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
          >
            refunds and removals
          </Link>
          .
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can ask us to hide a listing you submitted, and you can ask what
          we hold about you. Contact us at{" "}
          <span className="text-mist">support@example.com</span> (placeholder
          address — replace with your real contact before launch) and we will
          respond within a reasonable period.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes materially we will update the date at the top
          of this page and note the change on the site.
        </p>
      </Section>
    </Prose>
  );
}
