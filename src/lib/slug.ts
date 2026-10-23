/**
 * Slug generation.
 *
 * Slugs are lowercase ASCII. That is not cosmetic: the board's final tiebreak is
 * `id ASC`, and Postgres compares strings by collation while JavaScript compares
 * UTF-16 code units. Restricting ids/slugs to lowercase ASCII keeps the two
 * orderings identical, so pagination can never disagree with the comparator.
 */

/** Any run of characters that is not a-z or 0-9 becomes a single dash. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining marks so "café" becomes "cafe" rather than "caf".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    // Re-trim: slicing can leave a trailing dash.
    .replace(/-+$/g, "");
}

/**
 * Produce a slug that is unique against `isTaken`, appending -2, -3, … as needed.
 * Kept async-free by taking a predicate, so it is trivially testable.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "listing";
  let candidate = root;
  let suffix = 1;

  while (await isTaken(candidate)) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}
