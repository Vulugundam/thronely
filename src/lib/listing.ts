/**
 * Listing field limits, shared by the form, the server action and the tests so
 * the browser constraint and the server constraint can never drift apart.
 */

/** The brief's cap on a listing description. Also what makes it fit a card. */
export const MAX_DESCRIPTION_LENGTH = 160;

/** Titles are shown as a single line on the board. */
export const MAX_TITLE_LENGTH = 80;

/** Trim, collapse runs of whitespace, and cap. Used on both sides. */
export function normaliseText(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Only http(s) destinations are accepted — a `javascript:` or `data:` URL on a
 * public board would be an injection vector, and a mailto: is not a listing.
 */
export function normaliseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
