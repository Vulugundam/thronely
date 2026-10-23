import type { Metadata } from "next";
import Link from "next/link";
import { Prose, PlaceholderNote, Section } from "@/components/ui/Prose";

export const LAST_UPDATED = "17 October 2026";

export const metadata: Metadata = {
  title: "Refunds & removals",
  description:
    "When Thronely refunds a payment, when it will not, and how to have a listing taken off the board.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <Prose
      eyebrow="The fine print"
      title="Refunds & removals"
      intro={
        <>
          <p>
            The short version: what you are buying is a position that other
            people can outbid, so &ldquo;I was passed&rdquo; is not a refund
            reason. Faults on our side are.
          </p>
          <p className="mt-4 text-sm text-slate-dim">
            Last updated {LAST_UPDATED}.
          </p>
        </>
      }
    >
      <PlaceholderNote>
        this policy is a working draft. Confirm the statutory rights that apply
        where your customers live — some jurisdictions grant withdrawal rights
        that a policy cannot waive — before you take real payments.
      </PlaceholderNote>

      <Section title="We refund when the fault is ours">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            You were charged twice for one claim, or charged an amount different
            from the one you were shown at checkout.
          </li>
          <li>
            Your payment was taken but never credited to a listing, and we
            cannot correct it.
          </li>
          <li>
            A listing was hidden in error, or your listing was removed for a
            reason that turns out not to apply.
          </li>
          <li>
            The board was unavailable at the moment your payment cleared in a
            way that stopped your claim from being applied at all.
          </li>
        </ul>
      </Section>

      <Section title="We do not refund because you were passed">
        <p>
          Being overtaken is the product working, not a fault. Every payment you
          make stays credited to your listing and stacks with the rest, so a
          listing that has been passed keeps the total it paid for and can take
          the rank back by paying the difference. Refunding a passed listing
          would also change the price of every rank below it, at the expense of
          listings that played by the published rules.
        </p>
      </Section>

      <Section title="We do not refund for change of mind">
        <p>
          A claim is an instruction to put a listing on a public board
          immediately, at a price you were shown and agreed to before paying.
          Once the payment clears and the listing is live, the service has been
          delivered.
        </p>
      </Section>

      <Section title="Removals">
        <p>
          You can ask us to hide a listing you submitted. Hiding removes it from
          the board, from every category page, and from pricing, so the ranks
          around it close up. It does not refund money already paid, and the
          payment stays visible in the public activity feed, because other
          listings&apos; positions were set against those totals.
        </p>
        <p>
          We will also hide a listing that breaches{" "}
          <Link
            href="/terms"
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
          >
            the terms
          </Link>{" "}
          or matches our prohibited list. In that case the payment is not
          refunded.
        </p>
      </Section>

      <Section title="Failed and expired checkouts">
        <p>
          If a checkout is abandoned, expires, or fails, nothing is charged and
          the board does not change. If your bank shows a pending amount from an
          abandoned checkout, that authorisation is released by your bank on its
          normal schedule — we never captured it.
        </p>
      </Section>

      <Section title="How to ask">
        <p>
          Email <span className="text-mist">support@example.com</span>{" "}
          (placeholder address — replace with your real contact before launch)
          with the listing URL and the approximate time of the payment. We aim
          to answer within five business days. Approved refunds go back to the
          original payment method; how quickly it appears depends on your bank.
        </p>
      </Section>
    </Prose>
  );
}
