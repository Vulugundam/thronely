/**
 * `searchParams` values arrive as `string | string[] | undefined` because a URL
 * can repeat a key. Every page here wants a single value, so this normalises
 * once instead of at each call site.
 */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** A positive integer page number, defaulting to 1 for anything unusable. */
export function pageParam(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
