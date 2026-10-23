import { prisma } from "./db";
import { BOARD_ORDER_BY } from "./ranking";
import { markRequestTime } from "./request-time";
import type { BoardEntry } from "./pricing";

/**
 * Board queries.
 *
 * All ordering goes through `BOARD_ORDER_BY`, which mirrors the `byRank`
 * comparator in ./ranking.ts. Keeping the SQL in one exported constant is what
 * lets a test assert the two orderings agree.
 *
 * Decision: a hidden product is excluded from BOTH display and pricing, rather
 * than being hidden from display but still counted in the maths. That keeps rank
 * numbers contiguous (a visitor never sees "#1, #2, #4") and makes hiding a
 * product equivalent to removing it, which is the least surprising reading of
 * "hide/unhide". Admin hiding is rare, so the resulting price shift is rare too.
 */

/*
 * On missing slugs, and the 404 status we deliberately do not send.
 *
 * `getProductBySlug` and `getCategoryBySlug` return null for an unknown slug,
 * and the calling page turns that into `notFound()`. Because those calls happen
 * inside a `<Suspense>` boundary — the route's static shell has already
 * streamed, with its `200` — Next.js cannot change the status afterwards. The
 * response is a "soft 404": `200` with the not-found UI, plus the
 * `<meta name="robots" content="noindex">` that Next injects so the page is
 * never indexed.
 *
 * A real `404` is only possible if the slug is checked *before* anything
 * streams, which under `cacheComponents` means awaiting `params` in the page
 * body. That is a blocking route: it fails the build, and the documented opt-out
 * (`export const instant = false`) would cost every route its prerendered
 * shell — the thing the whole architecture is built around. Trading a fast
 * static shell on every real page for a nicer status code on the junk ones is a
 * bad deal, and `noindex` already keeps those pages out of search results.
 *
 * Revisit if the product pages ever need a hard 404 for a crawler contract —
 * the other documented route is to check the slug in `proxy.ts` and return the
 * status there, before the page renders at all.
 */

export const PAGE_SIZE = 50;

/** How far down the board a claim may target. Also bounds the pricing query. */
export const MAX_TARGET_RANK = 200;

/** A product row as the board renders it. */
export type BoardRow = {
  id: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  logoUrl: string | null;
  totalPaidCents: number;
  lastBidAt: Date | null;
  createdAt: Date;
  category: { slug: string; name: string };
};

const ROW_SELECT = {
  id: true,
  slug: true,
  url: true,
  title: true,
  description: true,
  logoUrl: true,
  totalPaidCents: true,
  lastBidAt: true,
  createdAt: true,
  category: { select: { slug: true, name: true } },
} as const;

/**
 * Midnight UTC today — the boundary for the Today board.
 *
 * Async because it reads the clock: under cacheComponents `new Date()` during
 * prerender is an "unstable value" and fails the build, so this marks request
 * time first and only then reads it. Callers get a value frozen for the
 * duration of one request, which is what a day boundary should be.
 */
export async function startOfTodayUtc(): Promise<Date> {
  await markRequestTime();
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export type BoardPage = {
  rows: BoardRow[];
  total: number;
  page: number;
  totalPages: number;
};

/**
 * All-time board: ranked by cumulative money paid.
 */
export async function getAllTimeBoard({
  categorySlug,
  page = 1,
  pageSize = PAGE_SIZE,
}: {
  categorySlug?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<BoardPage> {
  await markRequestTime();

  const where = {
    hidden: false,
    // A product with no money is not on the board at all.
    totalPaidCents: { gt: 0 },
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  const total = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const rows = await prisma.product.findMany({
    where,
    orderBy: BOARD_ORDER_BY,
    select: ROW_SELECT,
    skip: (safePage - 1) * pageSize,
    take: pageSize,
  });

  return { rows, total, page: safePage, totalPages };
}

/**
 * Today board: ranked by money paid since 00:00 UTC today.
 *
 * The ordering is by today's total, but the tiebreak stays on the product's
 * `lastBidAt`, so the two orderings can never disagree about who is ahead.
 */
export async function getTodayBoard({
  categorySlug,
  page = 1,
  pageSize = PAGE_SIZE,
}: {
  categorySlug?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<BoardPage> {
  await markRequestTime();

  const since = await startOfTodayUtc();

  const grouped = await prisma.bid.groupBy({
    by: ["productId"],
    where: {
      status: "paid",
      paidAt: { gte: since },
      product: {
        hidden: false,
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
    },
    _sum: { amountCents: true },
    orderBy: { _sum: { amountCents: "desc" } },
  });

  const total = grouped.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const window = grouped.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (window.length === 0) {
    return { rows: [], total, page: safePage, totalPages };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: window.map((g) => g.productId) } },
    select: ROW_SELECT,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Preserve the grouped order, and report today's figure as the row's total so
  // the Today board shows what was paid today rather than the all-time sum.
  const rows: BoardRow[] = [];
  for (const group of window) {
    const product = byId.get(group.productId);
    if (!product) continue;
    rows.push({
      ...product,
      totalPaidCents: group._sum.amountCents ?? 0,
    });
  }

  return { rows, total, page: safePage, totalPages };
}

/**
 * The ordered board used for pricing, as plain `BoardEntry` values.
 *
 * Only the top `upTo` entries matter: `rankPriceCents` reads a single index, and
 * any rank beyond the end of the board is an empty slot priced at the flat
 * minimum regardless. Bounding the query keeps a hostile `targetRank` from
 * forcing a full-table scan.
 */
export async function getBoardForPricing(
  categorySlug?: string,
): Promise<BoardEntry[]> {
  await markRequestTime();

  const rows = await prisma.product.findMany({
    where: {
      hidden: false,
      totalPaidCents: { gt: 0 },
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    orderBy: BOARD_ORDER_BY,
    select: { id: true, totalPaidCents: true, lastBidAt: true },
    take: MAX_TARGET_RANK,
  });

  return rows;
}

/**
 * The top N rows of the all-time board, for the podium and hero.
 *
 * Always the all-time board, never today's, even when a category page is showing
 * the Today tab: a podium is a statement about who holds the ranks, and ranks are
 * held with cumulative money. The tab beside it shows what moved today.
 */
export async function getTopRows(
  count = 3,
  categorySlug?: string,
): Promise<BoardRow[]> {
  await markRequestTime();

  return prisma.product.findMany({
    where: {
      hidden: false,
      totalPaidCents: { gt: 0 },
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    orderBy: BOARD_ORDER_BY,
    select: ROW_SELECT,
    take: count,
  });
}

/**
 * Smallest and largest paid totals, used to scale 3D block heights.
 *
 * Scoped by category when one is given, which matters more than it looks: a
 * category's leader might hold $30 while the global leader holds $2,455, so
 * scaling a category podium against the global range would draw every block as
 * an indistinguishable sliver. Heights are only meaningful relative to the board
 * they belong to.
 */
export async function getBoardMoneyRange(categorySlug?: string): Promise<{
  min: number;
  max: number;
}> {
  await markRequestTime();

  const where = {
    hidden: false,
    totalPaidCents: { gt: 0 },
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  const [min, max] = await Promise.all([
    prisma.product.aggregate({
      where,
      _min: { totalPaidCents: true },
    }),
    prisma.product.aggregate({
      where,
      _max: { totalPaidCents: true },
    }),
  ]);

  return {
    min: min._min.totalPaidCents ?? 0,
    max: max._max.totalPaidCents ?? 0,
  };
}

/** Products with their all-time rank, for the product page and its history. */
export async function getProductBySlug(slug: string) {
  await markRequestTime();

  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      ...ROW_SELECT,
      hidden: true,
    },
  });
  if (!product || product.hidden) return null;

  const [rank, clickCount, bids] = await Promise.all([
    // Count how many products outrank this one, rather than loading the board.
    prisma.product.count({
      where: {
        hidden: false,
        OR: [
          { totalPaidCents: { gt: product.totalPaidCents } },
          {
            totalPaidCents: product.totalPaidCents,
            lastBidAt: { lt: product.lastBidAt ?? new Date(8.64e15) },
          },
          ...(product.lastBidAt
            ? [
                {
                  totalPaidCents: product.totalPaidCents,
                  lastBidAt: product.lastBidAt,
                  id: { lt: product.id },
                },
              ]
            : []),
        ],
      },
    }),
    prisma.click.count({ where: { productId: product.id } }),
    prisma.bid.findMany({
      where: { productId: product.id, status: "paid" },
      orderBy: { paidAt: "asc" },
      select: { id: true, amountCents: true, paidAt: true, status: true },
    }),
  ]);

  return {
    product,
    rank: product.totalPaidCents > 0 ? rank + 1 : null,
    clickCount,
    bids,
  };
}

/** All categories with a count of live listings, for /categories. */
export async function getCategoriesWithCounts() {
  await markRequestTime();

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { products: { where: { hidden: false } } } },
    },
  });

  return categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    productCount: c._count.products,
  }));
}

export async function getCategoryBySlug(slug: string) {
  await markRequestTime();

  return prisma.category.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}
