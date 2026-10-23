import { prisma } from "./db";

/**
 * Prohibited-content moderation.
 *
 * The keyword list is *data*, not code: it lives in the `Setting` table so it can
 * be edited from /admin without a deploy. This module is the only place that
 * reads it, and the only place that decides whether a piece of text is allowed,
 * so the checkout route, the admin editor and the tests all agree.
 *
 * The check is deliberately simple and deterministic. It is a floor, not a
 * filter: it catches the obvious cases a human would have to be told about, and
 * it does so identically every time. Anything subtler needs a moderator, which
 * is what the admin view of bids is for.
 */

/** The `Setting` row the seed writes. */
export const PROHIBITED_KEYWORDS_KEY = "prohibited_keywords";

/** What a new database starts with, if the Setting is somehow absent. */
const DEFAULT_KEYWORDS = ["casino", "payday loan", "replica watch", "essay mill", "escort", "counterfeit"];

/** Escape everything regex-special so a keyword is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A word-boundary pattern for one keyword.
 *
 * The boundaries are applied only where the keyword's own edge is a word
 * character. That is the difference between "essay mill" matching as a phrase
 * and it firing inside "essay mille-feuille", and it also stops a keyword like
 * "casino" from matching the middle of an unrelated longer word. A keyword that
 * *ends* in punctuation (say "loan!") would otherwise demand a `\b` between two
 * non-word characters, which can never match.
 */
export function keywordPattern(keyword: string): RegExp {
  const needle = keyword.trim();
  const escaped = escapeRegExp(needle);
  const start = /^\w/.test(needle) ? "\\b" : "";
  const end = /\w$/.test(needle) ? "\\b" : "";
  return new RegExp(`${start}${escaped}${end}`, "i");
}

/**
 * The first prohibited keyword appearing in `text`, or null if it is clean.
 *
 * Pure and synchronous so it can be unit-tested without a database, and so the
 * caller decides what to do about a hit rather than this function throwing.
 */
export function findProhibited(
  text: string,
  keywords: readonly string[],
): string | null {
  for (const keyword of keywords) {
    if (!keyword.trim()) continue;
    if (keywordPattern(keyword).test(text)) return keyword;
  }
  return null;
}

/** Parse the newline-separated Setting value into a trimmed keyword list. */
export function parseKeywords(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/*
 * The list is read once per process rather than per request. It changes only
 * when an admin edits it, and a primary-key lookup on every claim would be pure
 * overhead. `resetKeywordCache()` exists for exactly the same reason
 * `resetDetectionCache()` does in ./scene-mode: so a test (or the admin action
 * that writes the row) can drop the cached value instead of being lied to by it.
 */
let cached: string[] | null = null;

/** Drop the cached list so the next read hits the database. */
export function resetKeywordCache(): void {
  cached = null;
}

/**
 * The current prohibited-keyword list.
 *
 * A missing row means "no list configured", not "block everything", so an
 * unseeded database permits submissions rather than making the site unusable.
 * The fallback is the seed's own list only when the read itself fails, which
 * keeps a transient database error from silently disabling moderation.
 */
export async function loadProhibitedKeywords(): Promise<string[]> {
  if (cached !== null) return cached;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: PROHIBITED_KEYWORDS_KEY },
      select: { value: true },
    });
    cached = parseKeywords(setting?.value);
  } catch {
    // Fail closed: if we cannot read the list, assume the default one rather
    // than letting everything through.
    return [...DEFAULT_KEYWORDS];
  }

  return cached;
}
