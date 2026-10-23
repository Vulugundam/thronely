import {
  getBoardForPricing,
  getCategoriesWithCounts,
  getTopRows,
} from "@/lib/board";
import { rankPriceCents } from "@/lib/pricing";
import { ClaimBoxClient } from "./ClaimBoxClient";

/** How many ranks the stepper can step through. */
const STEPPER_RANKS = 10;

/**
 * Server wrapper for the claim box: prices the ranks, then hands plain numbers
 * to the client stepper. Pricing stays on the server so a visitor can never see
 * a price the checkout route disagrees with.
 */
export async function ClaimBox({ categorySlug }: { categorySlug?: string }) {
  const [board, categories, leaderRows] = await Promise.all([
    getBoardForPricing(categorySlug),
    getCategoriesWithCounts(),
    // Only for naming the current #1 in the copy; not used for pricing.
    getTopRows(1),
  ]);

  // Priced against the ALL-TIME board regardless of which tab is being viewed:
  // money already paid is cumulative and never expires, so a claim is inherently
  // an all-time action.
  const prices = Array.from({ length: STEPPER_RANKS }, (_, i) =>
    rankPriceCents(i + 1, board),
  );

  const categoryName =
    categories.find((c) => c.slug === categorySlug)?.name ?? "";

  // Within a category the "#1" is that category's leader, so only name the
  // overall leader when the box is showing the unfiltered board.
  const leaderTitle = categorySlug ? null : (leaderRows[0]?.title ?? null);

  return (
    <ClaimBoxClient
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      currentCategory={categorySlug ?? ""}
      currentCategoryName={categoryName}
      prices={prices}
      leaderTitle={leaderTitle}
    />
  );
}
