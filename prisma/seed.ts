import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { slugify, uniqueSlug } from "../src/lib/slug";

/**
 * Seeds ~30 categories and ~60 products with realistic money spread across them.
 *
 * Two invariants the seed deliberately preserves, because the whole money path
 * depends on them:
 *   1. Product.totalPaidCents === SUM(Bid.amountCents WHERE status = 'paid')
 *      — so every product gets a paid Bid row, not just a total.
 *   2. Every amount is a whole dollar and at least the $5 listing minimum.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const adapter =
  url.startsWith("postgres://") || url.startsWith("postgresql://")
    ? new PrismaPg({ connectionString: url })
    : new PrismaBetterSqlite3({ url });

const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  "AI Tools",
  "Developer Tools",
  "Design",
  "Marketing",
  "Productivity",
  "Analytics",
  "Finance",
  "Crypto",
  "E-commerce",
  "Education",
  "Health",
  "Fitness",
  "Travel",
  "Food & Drink",
  "Gaming",
  "Music",
  "Video",
  "Photography",
  "Writing",
  "Newsletters",
  "Podcasts",
  "Communities",
  "Recruiting",
  "Customer Support",
  "Sales",
  "Security",
  "Infrastructure",
  "Databases",
  "Mobile Apps",
  "Open Source",
];

type Seedling = {
  title: string;
  url: string;
  description: string;
  category: string;
  /** Whole dollars actually paid. Drives rank. */
  paid: number;
  /** Age in days, used for createdAt/lastBidAt so the board looks lived-in. */
  ageDays: number;
};

const PRODUCTS: Seedling[] = [
  { title: "Aurelia", url: "https://aurelia.example.com", description: "Draft, review and ship long-form writing with an editor that learns your voice.", category: "AI Tools", paid: 2450, ageDays: 210 },
  { title: "Nimbus Note", url: "https://nimbusnote.example.com", description: "A notes app that links thoughts the way you actually think about them.", category: "Productivity", paid: 1180, ageDays: 195 },
  { title: "Forgekit", url: "https://forgekit.example.com", description: "Ship a production API in an afternoon with typed contracts and zero config.", category: "Developer Tools", paid: 960, ageDays: 180 },
  { title: "Lumen Analytics", url: "https://lumen.example.com", description: "Privacy-first product analytics that answers questions without a SQL console.", category: "Analytics", paid: 875, ageDays: 240 },
  { title: "Palette", url: "https://palette.example.com", description: "Design tokens that stay in sync between Figma and your codebase.", category: "Design", paid: 610, ageDays: 160 },
  { title: "Ledgerline", url: "https://ledgerline.example.com", description: "Bookkeeping for founders who would rather be building.", category: "Finance", paid: 590, ageDays: 300 },
  { title: "Rally", url: "https://rally.example.com", description: "Run campaigns that adapt to results while they are still running.", category: "Marketing", paid: 540, ageDays: 145 },
  { title: "Stowaway", url: "https://stowaway.example.com", description: "Self-hosted object storage with the ergonomics of a managed service.", category: "Infrastructure", paid: 505, ageDays: 260 },
  { title: "Beacon HQ", url: "https://beaconhq.example.com", description: "A status page your customers actually trust, with incident timelines.", category: "Customer Support", paid: 480, ageDays: 275 },
  { title: "Tessellate", url: "https://tessellate.example.com", description: "Generate on-brand marketing pages from a component library.", category: "Design", paid: 455, ageDays: 130 },
  { title: "Parcelry", url: "https://parcelry.example.com", description: "Checkout and fulfilment for small merchants, without the platform tax.", category: "E-commerce", paid: 430, ageDays: 190 },
  { title: "Quorum", url: "https://quorum.example.com", description: "Decision records that keep distributed teams honest about why.", category: "Productivity", paid: 405, ageDays: 155 },
  { title: "Vantage Sound", url: "https://vantagesound.example.com", description: "Master audio in the browser with reference-grade metering.", category: "Music", paid: 380, ageDays: 220 },
  { title: "Kestrel DB", url: "https://kestreldb.example.com", description: "An embedded analytical database that fits in a single binary.", category: "Databases", paid: 375, ageDays: 320 },
  { title: "Hearth", url: "https://hearth.example.com", description: "Member communities with rooms, rituals and real moderation tools.", category: "Communities", paid: 355, ageDays: 200 },
  { title: "Slate & Ink", url: "https://slateandink.example.com", description: "A newsletter platform for writers who care about typography.", category: "Newsletters", paid: 330, ageDays: 265 },
  { title: "Vector Health", url: "https://vectorhealth.example.com", description: "Longitudinal health records you own and can take anywhere.", category: "Health", paid: 320, ageDays: 340 },
  { title: "Ridge Run", url: "https://ridgerun.example.com", description: "Adaptive training plans that respond to how you actually recover.", category: "Fitness", paid: 310, ageDays: 175 },
  { title: "Passage", url: "https://passage.example.com", description: "Itinerary planning that survives delayed flights and closed museums.", category: "Travel", paid: 295, ageDays: 290 },
  { title: "Mise", url: "https://mise.example.com", description: "Seasonal recipe collections with automatic shopping lists.", category: "Food & Drink", paid: 285, ageDays: 150 },
  { title: "Longbow", url: "https://longbow.example.com", description: "Co-operative tactics games that respect your evening.", category: "Gaming", paid: 275, ageDays: 205 },
  { title: "Reelforge", url: "https://reelforge.example.com", description: "Cut, caption and publish video without leaving the timeline.", category: "Video", paid: 265, ageDays: 165 },
  { title: "Aperture Field", url: "https://aperturefield.example.com", description: "Catalogue and cull a shoot at full resolution, on any device.", category: "Photography", paid: 250, ageDays: 230 },
  { title: "Cohort", url: "https://cohort.example.com", description: "Interview scheduling and structured scorecards for hiring teams.", category: "Recruiting", paid: 240, ageDays: 185 },
  { title: "Dealwise", url: "https://dealwise.example.com", description: "Pipeline forecasts built from what your team actually logged.", category: "Sales", paid: 235, ageDays: 210 },
  { title: "Bastion", url: "https://bastion.example.com", description: "Continuous authorisation checks for every service you run.", category: "Security", paid: 230, ageDays: 300 },
  { title: "Ledgerchain", url: "https://ledgerchain.example.com", description: "Reconcile on-chain movements against your accounting ledger.", category: "Crypto", paid: 225, ageDays: 255 },
  { title: "Tutorly", url: "https://tutorly.example.com", description: "Adaptive practice sets that find the gap behind the wrong answer.", category: "Education", paid: 215, ageDays: 245 },
  { title: "Podstack", url: "https://podstack.example.com", description: "Record, edit and distribute a podcast from one window.", category: "Podcasts", paid: 210, ageDays: 220 },
  { title: "Thicket", url: "https://thicket.example.com", description: "An open-source design system with accessible primitives included.", category: "Open Source", paid: 205, ageDays: 310 },
  { title: "Pocket Pilot", url: "https://pocketpilot.example.com", description: "Offline-first field apps that sync when the signal returns.", category: "Mobile Apps", paid: 195, ageDays: 160 },
  { title: "Tempo", url: "https://tempo.example.com", description: "Focus sessions that schedule themselves around your real calendar.", category: "Productivity", paid: 185, ageDays: 140 },
  { title: "Rookery", url: "https://rookery.example.com", description: "Feature flags with progressive delivery built in.", category: "Developer Tools", paid: 175, ageDays: 200 },
  { title: "Selvage", url: "https://selvage.example.com", description: "Deterministic CSS for teams that ship on a fixed cadence.", category: "Design", paid: 170, ageDays: 170 },
  { title: "Marrow", url: "https://marrow.example.com", description: "Deep, dependency-aware test selection for large monorepos.", category: "Developer Tools", paid: 165, ageDays: 280 },
  { title: "Cinder", url: "https://cinder.example.com", description: "Lightweight incident response with automatic timelines.", category: "Infrastructure", paid: 160, ageDays: 190 },
  { title: "Fathom Metrics", url: "https://fathommetrics.example.com", description: "Marketing attribution that survives a cookieless browser.", category: "Marketing", paid: 155, ageDays: 150 },
  { title: "Quill Check", url: "https://quillcheck.example.com", description: "Grammar and tone review tuned for technical documentation.", category: "Writing", paid: 150, ageDays: 225 },
  { title: "Plinth", url: "https://plinth.example.com", description: "Provision preview environments per pull request.", category: "Infrastructure", paid: 145, ageDays: 260 },
  { title: "Harvest Table", url: "https://harvesttable.example.com", description: "Farm-to-kitchen supply ordering for independent restaurants.", category: "Food & Drink", paid: 140, ageDays: 200 },
  { title: "Sundial", url: "https://sundial.example.com", description: "Time tracking that guesses correctly from your commit history.", category: "Productivity", paid: 135, ageDays: 175 },
  { title: "Coldfront", url: "https://coldfront.example.com", description: "Data warehouse cost control with per-team budgets.", category: "Databases", paid: 130, ageDays: 290 },
  { title: "Bright Ledger", url: "https://brightledger.example.com", description: "Invoicing and dunning for subscription businesses.", category: "Finance", paid: 125, ageDays: 240 },
  { title: "Waypoint", url: "https://waypoint.example.com", description: "Field service routing that accounts for real traffic.", category: "Mobile Apps", paid: 120, ageDays: 210 },
  { title: "Sable", url: "https://sable.example.com", description: "Secure document sharing with link expiry and audit trails.", category: "Security", paid: 115, ageDays: 230 },
  { title: "Chalkline", url: "https://chalkline.example.com", description: "Lesson planning and assessment for secondary teachers.", category: "Education", paid: 110, ageDays: 195 },
  { title: "Ravel", url: "https://ravel.example.com", description: "Sample library search by feel, tempo and key.", category: "Music", paid: 105, ageDays: 185 },
  { title: "Trailhead Fit", url: "https://trailheadfit.example.com", description: "Strength programmes for endurance athletes.", category: "Fitness", paid: 100, ageDays: 165 },
  { title: "Gatherly", url: "https://gatherly.example.com", description: "Community events with ticketing that does not gouge you.", category: "Communities", paid: 95, ageDays: 155 },
  { title: "Signal Desk", url: "https://signaldesk.example.com", description: "Shared inbox with SLAs your team can actually meet.", category: "Customer Support", paid: 90, ageDays: 145 },
  { title: "Copper Field", url: "https://copperfield.example.com", description: "Territory planning for field sales teams.", category: "Sales", paid: 85, ageDays: 170 },
  { title: "Northwind", url: "https://northwind.example.com", description: "Weather-aware logistics planning for regional carriers.", category: "Analytics", paid: 80, ageDays: 200 },
  { title: "Lantern", url: "https://lantern.example.com", description: "Local news desk with reader-funded reporting tools.", category: "Newsletters", paid: 75, ageDays: 215 },
  { title: "Paces", url: "https://paces.example.com", description: "Structured running plans for first-time marathoners.", category: "Fitness", paid: 70, ageDays: 135 },
  { title: "Broadsheet", url: "https://broadsheet.example.com", description: "Long-form publishing with footnotes that behave.", category: "Writing", paid: 65, ageDays: 160 },
  { title: "Cask", url: "https://cask.example.com", description: "Cellar tracking and tasting notes for collectors.", category: "Food & Drink", paid: 60, ageDays: 180 },
  { title: "Relay Post", url: "https://relaypost.example.com", description: "Transactional email with delivery debugging built in.", category: "Developer Tools", paid: 55, ageDays: 150 },
  { title: "Almanac", url: "https://almanac.example.com", description: "Seasonal planting calendars tuned to your postcode.", category: "Education", paid: 50, ageDays: 190 },
  { title: "Shutter Line", url: "https://shutterline.example.com", description: "Client galleries with print fulfilment attached.", category: "Photography", paid: 45, ageDays: 140 },
  { title: "Tidepool", url: "https://tidepool.example.com", description: "Small-team bookmarks that resurface what you saved.", category: "Productivity", paid: 40, ageDays: 120 },
  { title: "Kelvin", url: "https://kelvin.example.com", description: "Cold-chain temperature monitoring for small distributors.", category: "Health", paid: 35, ageDays: 175 },
  { title: "Marginal", url: "https://marginal.example.com", description: "Annotation and peer review for academic preprints.", category: "Open Source", paid: 30, ageDays: 165 },
];

/**
 * A plausible rank-history of bids. The final bid's amount is chosen so the sum
 * lands exactly on `total`, keeping invariant (1) intact.
 */
function bidPlan(totalCents: number, count: number, firstPaidAt: Date) {
  const bids: { amountCents: number; status: string; paidAt: Date }[] = [];
  let remaining = totalCents;

  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast
      ? remaining
      : Math.min(remaining - 500 * (count - 1 - i), Math.max(500, Math.round(remaining / (count - i) / 100) * 100));

    if (amount <= 0) break;
    remaining -= amount;
    bids.push({
      amountCents: amount,
      status: "paid",
      // Spread bids forwards in time from the product's first appearance.
      paidAt: new Date(firstPaidAt.getTime() + (i + 1) * 86_400_000 * 7),
    });
    if (remaining <= 0) break;
  }

  // Any rounding remainder rides on the last bid so the sum is exact.
  if (remaining > 0) {
    if (bids.length === 0) {
      bids.push({ amountCents: remaining, status: "paid", paidAt: firstPaidAt });
    } else {
      bids[bids.length - 1].amountCents += remaining;
    }
  }

  return bids;
}

async function main() {
  console.log("Clearing existing data…");
  // Order matters: children before parents.
  await prisma.click.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.processedEvent.deleteMany();

  console.log(`Seeding ${CATEGORIES.length} categories…`);
  const categoryIds = new Map<string, string>();
  for (const name of CATEGORIES) {
    const created = await prisma.category.create({
      data: { slug: slugify(name), name },
    });
    categoryIds.set(name, created.id);
  }

  console.log(`Seeding ${PRODUCTS.length} products…`);
  const now = Date.now();
  const utcMidnight = new Date(
    Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
    ),
  );
  let bidCount = 0;

  /**
   * Some of today's bids land on the board.
   *
   * Without this the newest bid in the fixture is months old, so the Today
   * board — and the Today tab, and /daily, and the category today views — would
   * all render empty on a fresh install, which makes the feature impossible to
   * look at or review. These are dated a few hours back rather than "now" so the
   * fixture stays deterministic and does not produce future timestamps.
   *
   * The money is added on top of the product's planned total rather than taken
   * out of it, so the "totalPaidCents equals the sum of paid bids" invariant
   * the seed maintains still holds exactly.
   */
  const todayBidders = new Set([
    "Aurelia",
    "Nimbus Note",
    "Forgekit",
    "Rally",
    "Tidepool",
  ]);

  for (const item of PRODUCTS) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      throw new Error(`Seed product "${item.title}" references unknown category "${item.category}"`);
    }

    const createdAt = new Date(now - item.ageDays * 86_400_000);
    const totalCents = item.paid * 100;
    const slug = await uniqueSlug(item.title, async (candidate) => {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });

    const product = await prisma.product.create({
      data: {
        slug,
        url: item.url,
        title: item.title,
        description: item.description,
        categoryId,
        totalPaidCents: totalCents,
        createdAt,
      },
    });

    // Between one and four stacked bids, so the bid history looks real and the
    // totals sum exactly.
    const plan = bidPlan(totalCents, 1 + (bidCount % 4), createdAt);
    for (const [index, bid] of plan.entries()) {
      await prisma.bid.create({
        data: {
          productId: product.id,
          amountCents: bid.amountCents,
          stripeSessionId: `seed_${product.id}_${index}`,
          status: bid.status,
          createdAt: bid.paidAt,
          paidAt: bid.paidAt,
        },
      });
      bidCount += 1;
    }

    // A payment from earlier today, on a few listings, so the Today board has
    // something on it.
    //
    // Anchored to the UTC day boundary rather than to "N hours ago": if the seed
    // runs at 02:00 UTC, a bid nine hours back lands in *yesterday* and the
    // Today board comes up empty. Placing it a deterministic fraction into the
    // elapsed part of the day is always inside today, whatever the hour.
    let todayPaidAt: Date | null = null;
    if (todayBidders.has(item.title)) {
      const elapsedTodayMs = now - utcMidnight.getTime();
      const fraction = ((bidCount % 5) + 1) / 6;
      todayPaidAt = new Date(utcMidnight.getTime() + elapsedTodayMs * fraction);
      const amountCents = (2 + (bidCount % 6)) * 100;
      await prisma.bid.create({
        data: {
          productId: product.id,
          amountCents,
          stripeSessionId: `seed_${product.id}_today`,
          status: "paid",
          createdAt: todayPaidAt,
          paidAt: todayPaidAt,
        },
      });
      bidCount += 1;
      await prisma.product.update({
        where: { id: product.id },
        data: { totalPaidCents: { increment: amountCents } },
      });
    }

    // `lastBidAt` is the ranking tiebreak, so it has to be the newest payment —
    // which after the block above is not necessarily the last one in `plan`.
    const plannedLastPaidAt = plan.at(-1)?.paidAt ?? createdAt;
    const lastPaidAt =
      todayPaidAt && todayPaidAt > plannedLastPaidAt
        ? todayPaidAt
        : plannedLastPaidAt;
    await prisma.product.update({
      where: { id: product.id },
      data: { lastBidAt: lastPaidAt },
    });

    // A handful of clicks on the more prominent listings.
    const clicks = item.paid > 400 ? 12 : item.paid > 150 ? 5 : 2;
    for (let i = 0; i < clicks; i += 1) {
      await prisma.click.create({
        data: {
          productId: product.id,
          createdAt: new Date(now - i * 3_600_000),
          ipHash: `seed-ip-${(i * 7 + bidCount) % 97}`,
          userAgent: "Mozilla/5.0 (seed)",
          referrer: i % 3 === 0 ? "https://news.ycombinator.com/" : null,
        },
      });
    }
  }

  await prisma.setting.upsert({
    where: { key: "prohibited_keywords" },
    create: { key: "prohibited_keywords", value: PROHIBITED_KEYWORDS.join("\n") },
    update: {},
  });

  const [categories, products, bids, clicks] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.bid.count(),
    prisma.click.count(),
  ]);

  /**
   * Assert the invariants the whole app rests on, rather than only counting
   * rows. A seed that silently breaks one produces a board whose ranks and
   * prices disagree with its own history — a bug that would surface much later
   * and look like a pricing fault.
   *
   * Done through Prisma's query API rather than raw SQL so it keeps working
   * unchanged after the Postgres swap.
   */
  const paidByProduct = new Map(
    (
      await prisma.bid.groupBy({
        by: ["productId"],
        where: { status: "paid" },
        _sum: { amountCents: true },
      })
    ).map((group) => [group.productId, group._sum.amountCents ?? 0]),
  );

  const allProducts = await prisma.product.findMany({
    select: { id: true, title: true, totalPaidCents: true },
  });

  const mismatched = allProducts.filter(
    (product) =>
      product.totalPaidCents !== (paidByProduct.get(product.id) ?? 0),
  );
  if (mismatched.length > 0) {
    throw new Error(
      `totalPaidCents does not match the sum of paid bids for: ${mismatched
        .map((row) => row.title)
        .join(", ")}`,
    );
  }

  const futureBids = await prisma.bid.count({
    where: { paidAt: { gt: new Date() } },
  });
  if (futureBids > 0) {
    throw new Error(
      `${futureBids} seeded bids are dated in the future; a bid that has not happened yet would show up on the Today board.`,
    );
  }

  const todayBids = await prisma.bid.count({
    where: { status: "paid", paidAt: { gte: utcMidnight } },
  });
  if (todayBids === 0) {
    throw new Error(
      "No paid bids fall inside today, so the Today board would render empty.",
    );
  }

  console.log(
    `Done: ${categories} categories, ${products} products, ${bids} bids, ${clicks} clicks.`,
  );
  console.log(
    `Verified: every total matches its bids, no future-dated bids, ${todayBids} bid(s) today.`,
  );
}

/** Starting keyword list for moderation; editable from /admin. */
export const PROHIBITED_KEYWORDS = [
  "casino",
  "payday loan",
  "replica watch",
  "essay mill",
  "escort",
  "counterfeit",
];

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
