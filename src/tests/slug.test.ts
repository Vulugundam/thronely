import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("produces lowercase ASCII dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("AI Tools & Agents")).toBe("ai-tools-agents");
  });

  it("strips diacritics rather than dropping the character", () => {
    expect(slugify("Café Réseau")).toBe("cafe-reseau");
  });

  it("collapses runs of punctuation into a single dash", () => {
    expect(slugify("a --- b___c")).toBe("a-b-c");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("never leaves a trailing dash after truncation", () => {
    const long = slugify("a".repeat(40) + " " + "b".repeat(40));
    expect(long.endsWith("-")).toBe(false);
    expect(long.length).toBeLessThanOrEqual(60);
  });

  it("stays within lowercase ASCII, so SQL and JS collation agree", () => {
    const slug = slugify("Ünïcodé Pröduct — 日本");
    expect(slug).toMatch(/^[a-z0-9-]*$/);
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when it is free", async () => {
    expect(await uniqueSlug("Hello World", async () => false)).toBe("hello-world");
  });

  it("appends an incrementing suffix when taken", async () => {
    const taken = new Set(["hello-world", "hello-world-2"]);
    const slug = await uniqueSlug("Hello World", async (c) => taken.has(c));
    expect(slug).toBe("hello-world-3");
  });

  it("falls back to a non-empty slug for input with no usable characters", async () => {
    expect(await uniqueSlug("!!!", async () => false)).toBe("listing");
  });
});
