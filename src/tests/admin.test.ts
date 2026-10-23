import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  clearAdminSession,
  createAdminSession,
  isAdminSessionValid,
  mintToken,
  parseToken,
  passwordMatches,
  verifyToken,
} from "@/lib/admin-auth";
import {
  listAllProductsAdmin,
  listRecentBidsAdmin,
  saveKeywordSetting,
  setProductHidden,
} from "@/lib/admin";
import {
  loadProhibitedKeywords,
  PROHIBITED_KEYWORDS_KEY,
  resetKeywordCache,
} from "@/lib/moderation";

/**
 * The admin layer: the session token, and the three mutations behind the panel.
 *
 * The token tests are pure — they pass a clock in, so no time is waited on.
 * The mutation tests run against prisma/test.db (see vitest.config.ts), which
 * the webhook tests established the reset pattern for: child rows first, then
 * the parents, and a fresh category/product/bid trio per test.
 *
 * The Server Actions themselves are not unit-tested: they are `'use server'`
 * wrappers around `isAdminSessionValid()` plus one call each into ./admin, and
 * the request context (`cookies()`, `redirect()`) is what the wrapper adds.
 * The parts that must be right — the token, the flip, the upsert, the cache
 * reset — are all below without it.
 */

const PASSWORD = "admin-password-for-tests";

let productId = "";

async function reset() {
  await prisma.processedEvent.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.click.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.setting.deleteMany();

  const category = await prisma.category.create({
    data: { slug: "tools", name: "Tools" },
  });
  const product = await prisma.product.create({
    data: {
      slug: "aurelia",
      url: "https://example.com/aurelia",
      title: "Aurelia",
      description: "A listing.",
      categoryId: category.id,
    },
  });
  productId = product.id;

  // A stale keyword cache from another test must not leak into this one's
  // loadProhibitedKeywords() assertions.
  resetKeywordCache();
}

beforeEach(async () => {
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
  await reset();
});

describe("the session token", () => {
  it("round-trips: a minted token verifies", () => {
    const token = mintToken();
    expect(token).not.toBeNull();
    expect(verifyToken(parseToken(token))).toBe(true);
  });

  it("is a future-dated expiry, not a static value", () => {
    // Two mints at different times must differ: the payload is the expiry.
    const a = mintToken(new Date(1_700_000_000_000));
    const b = mintToken(new Date(1_700_000_000_001));
    expect(a).not.toBe(b);
  });

  it("stops verifying once the expiry has passed", () => {
    const token = mintToken(new Date(1_700_000_000_000));
    // A token minted at time T expires at T + 7 days. One second past that:
    const later = new Date(1_700_000_000_000 + 7 * 86_400_000 + 1_000);
    expect(verifyToken(parseToken(token), later)).toBe(false);
  });

  it("still verifies a moment before expiry", () => {
    const token = mintToken(new Date(1_700_000_000_000));
    const justInside = new Date(1_700_000_000_000 + 7 * 86_400_000 - 1_000);
    expect(verifyToken(parseToken(token), justInside)).toBe(true);
  });

  it("rejects a tampered payload (expiry pushed forward)", () => {
    const token = mintToken(new Date(1_700_000_000_000));
    const [payload, signature] = token!.split(".");
    const forged = `${(Number.parseInt(payload, 36) + 60_000).toString(36)}.${signature}`;
    expect(verifyToken(parseToken(forged))).toBe(false);
  });

  it("rejects a signature from a different password", () => {
    const token = mintToken(new Date(1_700_000_000_000));
    vi.stubEnv("ADMIN_PASSWORD", "a-different-password");
    expect(verifyToken(parseToken(token))).toBe(false);
  });

  it("rejects garbage cookie values", () => {
    for (const value of ["", ".", "abc", "abc.def", "zzz.not-a-signature"]) {
      expect(verifyToken(parseToken(value))).toBe(false);
    }
  });

  it("mints nothing when no password is configured", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(mintToken()).toBeNull();
    expect(verifyToken(parseToken("anything.definitely"))).toBe(false);
    expect(passwordMatches(PASSWORD)).toBe(false);
  });

  it("compares the password in constant time over equal lengths", () => {
    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(passwordMatches("wrong")).toBe(false);
    expect(passwordMatches(`${PASSWORD}extra`)).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });
});

describe("setProductHidden", () => {
  it("hides and unhides the product", async () => {
    await setProductHidden(productId, true);
    expect(
      await prisma.product.findUnique({
        where: { id: productId },
        select: { hidden: true },
      }),
    ).toEqual({ hidden: true });

    await setProductHidden(productId, false);
    expect(
      await prisma.product.findUnique({
        where: { id: productId },
        select: { hidden: true },
      }),
    ).toEqual({ hidden: false });
  });

  it("keeps the money and bids on record when hiding", async () => {
    await prisma.bid.create({
      data: { productId, amountCents: 5_000, status: "paid", paidAt: new Date() },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { totalPaidCents: 5_000 },
    });

    await setProductHidden(productId, true);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { totalPaidCents: true, _count: { select: { bids: true } } },
    });
    expect(product).toEqual({ totalPaidCents: 5_000, _count: { bids: 1 } });
  });
});

describe("listAllProductsAdmin", () => {
  it("includes hidden products, which the board queries exclude", async () => {
    await setProductHidden(productId, true);
    const { products, total } = await listAllProductsAdmin();
    expect(total).toBe(1);
    expect(products).toHaveLength(1);
    expect(products[0].slug).toBe("aurelia");
    expect(products[0].hidden).toBe(true);
  });

  it("orders by money, highest first", async () => {
    const category = await prisma.category.findFirstOrThrow();
    await prisma.product.create({
      data: {
        slug: "richer",
        url: "https://example.com/richer",
        title: "Richer",
        description: "A listing.",
        categoryId: category.id,
        totalPaidCents: 100_000,
      },
    });
    const { products } = await listAllProductsAdmin();
    expect(products.map((p) => p.slug)).toEqual(["richer", "aurelia"]);
  });
});

describe("listRecentBidsAdmin", () => {
  it("lists bids with product titles and counts by status", async () => {
    await prisma.bid.create({
      data: { productId, amountCents: 5_000, status: "paid", paidAt: new Date() },
    });
    await prisma.bid.create({
      data: { productId, amountCents: 1_000, status: "pending" },
    });

    const { bids, counts } = await listRecentBidsAdmin();
    expect(bids).toHaveLength(2);
    expect(bids[0].product.title).toBe("Aurelia");
    expect(counts).toEqual({ paid: 1, pending: 1 });
  });
});

describe("saveKeywordSetting", () => {
  it("creates the Setting row when it does not exist", async () => {
    const keywords = await saveKeywordSetting("casino\npayday loan\n");
    expect(keywords).toEqual(["casino", "payday loan"]);

    const setting = await prisma.setting.findUnique({
      where: { key: PROHIBITED_KEYWORDS_KEY },
    });
    expect(setting?.value).toBe("casino\npayday loan");
  });

  it("updates an existing row in place", async () => {
    await saveKeywordSetting("first");
    await saveKeywordSetting("second\nthird");
    const setting = await prisma.setting.findUnique({
      where: { key: PROHIBITED_KEYWORDS_KEY },
    });
    expect(setting?.value).toBe("second\nthird");
  });

  it("is read by the moderation cache after a reset", async () => {
    // Prime the cache with the pre-save state (absent → empty list).
    await loadProhibitedKeywords();

    await saveKeywordSetting("essay mill");

    // Without the reset the process cache would still say the list is empty.
    resetKeywordCache();
    expect(await loadProhibitedKeywords()).toEqual(["essay mill"]);
  });
});

/*
 * The cookie-backed session helpers (createAdminSession, clearAdminSession,
 * isAdminSessionValid) read `cookies()` from next/headers, which exists only
 * inside a request or action context — vitest has none. They are one line each
 * over mintToken/verifyToken, which are the parts tested above.
 */
describe("session cookie helpers", () => {
  it("mintToken and verifyToken carry the whole session contract", () => {
    // Documenting why the cookie wrappers need no test of their own: the only
    // logic they add is the cookie name and the set/delete call.
    const token = mintToken();
    expect(token).not.toBeNull();
    expect(typeof token).toBe("string");
  });

  it("clearAdminSession and createAdminSession are exported for the actions", async () => {
    // Presence check only; see the block comment above.
    expect(typeof createAdminSession).toBe("function");
    expect(typeof clearAdminSession).toBe("function");
    expect(typeof isAdminSessionValid).toBe("function");
  });
});
