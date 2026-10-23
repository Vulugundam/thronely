import { connection } from "next/server";

/**
 * Force the calling code to run at request time rather than during prerendering.
 *
 * This matters more than it looks. We reach the database through
 * `better-sqlite3`, which is a *synchronous* driver — and synchronous queries
 * happily complete during prerendering, which would bake the leaderboard into
 * the static shell at build time and leave it frozen forever. Calling
 * `connection()` before the query opts the work out of prerendering, so the
 * board is always live.
 *
 * Under `cacheComponents`, anything calling this must sit behind a `<Suspense>`
 * boundary so the surrounding static shell can still be served immediately.
 */
export async function markRequestTime(): Promise<void> {
  await connection();
}
