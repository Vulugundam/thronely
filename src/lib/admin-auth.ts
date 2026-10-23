import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { markRequestTime } from "./request-time";

/**
 * The /admin session.
 *
 * One password, held in `ADMIN_PASSWORD`, and a cookie that proves the visitor
 * presented it. The cookie never carries the password: it is an HMAC-signed
 * expiry timestamp, minted on login and verified on every admin request.
 *
 * The signing key is derived from the password itself, so no extra secret exists
 * to configure or leak separately, and rotating the password invalidates every
 * outstanding session for free. The token says nothing except *when* it expires
 * — there is no user identity to encode, because there is only one admin.
 *
 * ## Fail closed
 *
 * With `ADMIN_PASSWORD` unset, nothing here mints a valid token and the login
 * comparison can never succeed, so an unconfigured deployment shows the admin
 * UI as locked rather than as open. The page renders a "not configured" notice
 * in that state, but the security of it does not depend on the page: the
 * actions re-check the session independently.
 */

/** The cookie the session lives in. */
const SESSION_COOKIE = "thronely_admin";

/** How long one login lasts, in milliseconds. A week: admin use is rare. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** `expires.signature`, both halves base-36 for a compact cookie value. */
type Token = { expires: number; signature: string };

/** The configured password, or null when the deployment has not set one. */
function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

/** True when the deployment has an admin password configured at all. */
export function adminConfigured(): boolean {
  return adminPassword() !== null;
}

/** The HMAC key for tokens, derived from the password (see module note). */
function signingKey(password: string): Buffer {
  return createHmac("sha256", password).update("thronely-admin-session").digest();
}

/** The exact string a token's signature is computed over. */
function signedPayload(expires: number): string {
  return expires.toString(36);
}

function sign(expires: number, password: string): string {
  return createHmac("sha256", signingKey(password))
    .update(signedPayload(expires))
    .digest("base64url");
}

/** Mint the cookie value for a session that starts now. */
export function mintToken(now: Date = new Date()): string | null {
  const password = adminPassword();
  if (!password) return null;

  const expires = now.getTime() + SESSION_TTL_MS;
  return `${signedPayload(expires)}.${sign(expires, password)}`;
}

/** Parse a cookie value back into a token, or null when malformed. */
export function parseToken(value: string | undefined | null): Token | null {
  if (!value) return null;
  const [expiresRaw, signature] = value.split(".");
  if (!expiresRaw || !signature) return null;
  const expires = Number.parseInt(expiresRaw, 36);
  if (!Number.isFinite(expires) || expires <= 0) return null;
  return { expires, signature };
}

/**
 * Does a token prove a login that is still valid?
 *
 * Pure: it takes the token and the clock rather than reading cookies, so the
 * tests can drive it without a request context. The signature is compared with
 * `timingSafeEqual` on a digest of both sides, so a wrong-length forgery is
 * still compared in constant time.
 */
export function verifyToken(
  token: Token | null,
  now: Date = new Date(),
): boolean {
  const password = adminPassword();
  if (!password || !token) return false;
  if (token.expires <= now.getTime()) return false;

  const expected = sign(token.expires, password);
  return timingSafeEqual(hash(token.signature), hash(expected));
}

/** A fixed-length digest, so `timingSafeEqual` never sees unequal lengths. */
function hash(value: string): Buffer {
  return createHmac("sha256", "length-shield").update(value).digest();
}

/**
 * Does the submitted password match?
 *
 * Both sides are digested first so the comparison is over equal-length buffers:
 * `timingSafeEqual` throws on a length mismatch, and comparing digests also
 * keeps the password's length out of the timing channel.
 */
export function passwordMatches(submitted: string): boolean {
  const password = adminPassword();
  if (!password) return false;
  return timingSafeEqual(hash(submitted), hash(password));
}

/** Set the session cookie. Only callable from a Server Action or route handler. */
export async function createAdminSession(): Promise<void> {
  const token = mintToken();
  if (!token) return;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Clear the session cookie. */
export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Is the current request holding a valid admin session?
 *
 * Reads `cookies()`, so under `cacheComponents` it must be called from inside
 * a `<Suspense>` boundary in a page (see src/app/admin/page.tsx) — never from
 * the page body, which would make the route blocking. Server Actions have no
 * such constraint: they always run per request, and every action in
 * src/app/admin/actions.ts re-checks through here rather than trusting the
 * form that invoked it.
 *
 * `markRequestTime()` runs first because token verification reads the clock:
 * without it the prerender pass would evaluate `new Date()` while building the
 * static shell, which `cacheComponents` treats as an error rather than a
 * warning (the `connection()` guide covers exactly this case). The page's
 * Suspense boundary means the shell still serves immediately.
 */
export async function isAdminSessionValid(): Promise<boolean> {
  await markRequestTime();
  const store = await cookies();
  return verifyToken(parseToken(store.get(SESSION_COOKIE)?.value));
}
