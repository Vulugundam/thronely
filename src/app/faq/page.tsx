import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/ui/Prose";
import { QUESTIONS, STRUCTURED_DATA } from "./content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Straight answers about buying rank on Thronely: what you are actually paying for, what happens when someone outbids you, and how to get off the board.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <Prose
      eyebrow="Questions"
      title="Frequently asked"
      intro={
        <p>
          Short, direct answers. If something here contradicts{" "}
          <Link
            href="/rules"
            className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
          >
            the rules
          </Link>
          , the rules win.
        </p>
      }
    >
      <script
        type="application/ld+json"
        // Static, author-controlled data — serialised from the constants above.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      <dl className="space-y-3">
        {QUESTIONS.map((item) => (
          // <details> gives keyboard and screen-reader users a real disclosure
          // widget with no JavaScript, and stays open for text-only crawlers.
          <details
            key={item.q}
            className="glass group rounded-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-base font-bold text-ivory marker:content-none">
              {item.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-lg text-gold-400 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-mist">
              {item.a}
            </div>
          </details>
        ))}
      </dl>
    </Prose>
  );
}
