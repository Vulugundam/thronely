import { prisma } from "./db";
import { PROHIBITED_KEYWORDS_KEY, parseKeywords } from "./moderation";

/**
 * The mutations behind /admin, extracted from the Server Actions so the tests
 * can drive them without a request context. The action file
 * (src/app/admin/actions.ts) is a thin `'use server'` wrapper that authorises
 * through ./admin-auth and then calls one of these; everything that touches
 * the database lives here.
 *
 * No cache invalidation happens in this module, deliberately: no route in this
 * app uses `use cache` or `cacheTag` — the board queries run per request under
 * Partial Prerender — so a hidden product disappears from the board on the
 * next request without any revalidation call. The one cross-process state the
 * admin CAN affect is the keyword cache in ./moderation, and the keyword
 * mutation here clears it through `resetKeywordCache()` rather than assuming
 * some invalidation will.
 */

/** How many bids the admin bids table shows. Recent ones; it is a glance, not a ledger. */
export const ADMIN_BID_LIMIT = 50;

/** How many products the admin products table shows. */
export const ADMIN_PRODUCT_LIMIT = 200;

/**
 * Every product, hidden ones included — the one place in the app that sees
 * them, since every board query filters `hidden` (see ./board.ts).
 *
 * Ordered by money rather than recency: the question the admin is usually
 * answering is "which listing is this complaint about?", and the loud ones are
 * near the top of the money order.
 */
export async function listAllProductsAdmin() {
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ totalPaidCents: "desc" }, { lastBidAt: "asc" }],
      take: ADMIN_PRODUCT_LIMIT,
      select: {
        id: true,
        slug: true,
        title: true,
        url: true,
        totalPaidCents: true,
        hidden: true,
        lastBidAt: true,
        createdAt: true,
        category: { select: { slug: true, name: true } },
      },
    }),
    prisma.product.count(),
  ]);

  return { products, total };
}

/** Recent bids with their product, plus a count per status for the table header. */
export async function listRecentBidsAdmin() {
  const [bids, statuses] = await Promise.all([
    prisma.bid.findMany({
      orderBy: { createdAt: "desc" },
      take: ADMIN_BID_LIMIT,
      select: {
        id: true,
        amountCents: true,
        status: true,
        stripeSessionId: true,
        createdAt: true,
        paidAt: true,
        product: { select: { slug: true, title: true } },
      },
    }),
    prisma.bid.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const group of statuses) {
    counts[group.status] = group._count._all;
  }

  return { bids, counts };
}

/**
 * Flip a product's hidden flag.
 *
 * Hiding is display-and-pricing removal, not deletion (the decision is
 * recorded in ./board.ts): the row, its money and its bid history all stay,
 * which is the point — the money was really paid, and a moderation action must
 * not be able to erase that record.
 *
 * The hidden flag arrives explicitly rather than being flipped server-side, so
 * the action cannot race itself into a stale flip: the button's own label is
 * the intent.
 */
export async function setProductHidden(productId: string, hidden: boolean) {
  const product = await prisma.product.update({
    where: { id: productId },
    data: { hidden },
    select: { id: true, slug: true, title: true, hidden: true },
  });

  return product;
}

/** The raw keyword Setting as the textarea shows it, or null when unseeded. */
export async function getKeywordSetting(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: PROHIBITED_KEYWORDS_KEY },
    select: { value: true },
  });
  return setting?.value ?? null;
}

/**
 * Replace the prohibited-keyword list.
 *
 * The textarea's newline-separated text is stored exactly as typed (trimmed at
 * the edges, not per line — `parseKeywords` trims when reading, so blank lines
 * in the stored value are harmless and the round-trip through the editor is
 * lossless for the meaningful content).
 *
 * `resetKeywordCache()` is called by the action that calls this, not here: the
 * cache lives in ./moderation's module scope and clearing it is a side effect
 * of the *action completing*, not of the row being written — a test writing a
 * Setting row directly must not mysteriously fix a stale cache mid-test.
 */
export async function saveKeywordSetting(value: string): Promise<string[]> {
  const trimmed = value.trim();
  await prisma.setting.upsert({
    where: { key: PROHIBITED_KEYWORDS_KEY },
    create: { key: PROHIBITED_KEYWORDS_KEY, value: trimmed },
    update: { value: trimmed },
  });

  return parseKeywords(trimmed);
}
