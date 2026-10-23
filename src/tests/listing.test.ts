import { describe, expect, it } from "vitest";
import { normaliseText, normaliseUrl, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from "@/lib/listing";
import { findProhibited, keywordPattern, parseKeywords } from "@/lib/moderation";

/**
 * The listing rules and the moderation floor.
 *
 * Both are pure, and both are what stands between a submitted form and what the
 * board renders, so they are worth pinning precisely — particularly `normaliseUrl`,
 * where the failure mode is not a wrong price but an injection.
 */

describe("normaliseText", () => {
  it("collapses whitespace and trims", () => {
    expect(normaliseText("  hello \n\n  world  ", 100)).toBe("hello world");
  });

  it("caps at the limit", () => {
    expect(normaliseText("abcdef", 3)).toBe("abc");
  });

  it("caps a description at the documented length", () => {
    const long = "x".repeat(MAX_DESCRIPTION_LENGTH + 50);
    expect(normaliseText(long, MAX_DESCRIPTION_LENGTH)).toHaveLength(
      MAX_DESCRIPTION_LENGTH,
    );
  });

  it("is not fooled by a tab or a newline into exceeding the cap", () => {
    const value = "a".repeat(MAX_TITLE_LENGTH) + "\t\n  b";
    // The cap applies after collapsing, so the visible text cannot push past it.
    expect(normaliseText(value, MAX_TITLE_LENGTH)).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("returns an empty string for whitespace only", () => {
    expect(normaliseText("   \n  ", 100)).toBe("");
  });
});

describe("normaliseUrl", () => {
  it("accepts https and http", () => {
    expect(normaliseUrl("https://example.com")).toBe("https://example.com/");
    expect(normaliseUrl("http://example.com/a?b=1")).toBe(
      "http://example.com/a?b=1",
    );
  });

  it("assumes https when no scheme is given", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com/");
  });

  it("rejects javascript: and data: outright", () => {
    // The whole reason this function exists. A board renders these as links.
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects other non-http schemes", () => {
    expect(normaliseUrl("mailto:someone@example.com")).toBeNull();
    expect(normaliseUrl("ftp://example.com")).toBeNull();
    expect(normaliseUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects a host with no dot", () => {
    expect(normaliseUrl("localhost")).toBeNull();
  });

  it("rejects empty and unparseable values", () => {
    expect(normaliseUrl("")).toBeNull();
    expect(normaliseUrl("   ")).toBeNull();
    expect(normaliseUrl("http://")).toBeNull();
  });

  it("does not let a javascript: URL slip through behind whitespace", () => {
    expect(normaliseUrl("  javascript:alert(1)  ")).toBeNull();
  });
});

describe("keywordPattern", () => {
  it("matches a keyword at a word boundary, not inside a longer word", () => {
    expect(keywordPattern("casino").test("a casino here")).toBe(true);
    expect(keywordPattern("casino").test("cassino")).toBe(false);
    expect(keywordPattern("casino").test("casinos")).toBe(false);
  });

  it("matches a multi-word phrase as a phrase", () => {
    expect(keywordPattern("essay mill").test("an essay mill wrote this")).toBe(
      true,
    );
  });

  it("does not fire on a longer hyphenated word", () => {
    // The case the boundary rules exist for.
    expect(keywordPattern("essay mill").test("essay mille-feuille")).toBe(false);
  });

  it("handles a keyword ending in punctuation", () => {
    // A trailing \b between two non-word characters could never match, so the
    // boundary has to be dropped on that edge.
    expect(keywordPattern("loan!").test("a loan! now")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(keywordPattern("casino").test("CASINO")).toBe(true);
  });

  it("treats regex metacharacters in a keyword literally", () => {
    // The list is admin-editable data, so a keyword is never a pattern.
    expect(keywordPattern("a.b").test("a.b")).toBe(true);
    expect(keywordPattern("a.b").test("axb")).toBe(false);
    expect(() => keywordPattern("(")).not.toThrow();
  });
});

describe("findProhibited", () => {
  const keywords = ["casino", "payday loan", "replica watch"];

  it("returns the matched keyword", () => {
    expect(findProhibited("best casino deals", keywords)).toBe("casino");
  });

  it("returns null for clean text", () => {
    expect(findProhibited("a friendly bakery", keywords)).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(findProhibited("BEST CASINO", keywords)).toBe("casino");
  });

  it("ignores blank entries in the list", () => {
    expect(findProhibited("a friendly bakery", ["", "   "])).toBeNull();
  });

  it("searches across newlines, so a title and description are one text", () => {
    expect(
      findProhibited("A bakery\nWe also run a payday loan desk", keywords),
    ).toBe("payday loan");
  });

  it("finds a keyword in a longer, otherwise clean string", () => {
    expect(
      findProhibited("handmade replica watch straps, ethically sourced", keywords),
    ).toBe("replica watch");
  });
});

describe("parseKeywords", () => {
  it("splits on newlines and trims", () => {
    expect(parseKeywords("casino\n  payday loan  \n")).toEqual([
      "casino",
      "payday loan",
    ]);
  });

  it("drops empty lines", () => {
    expect(parseKeywords("a\n\n\nb")).toEqual(["a", "b"]);
  });

  it("returns an empty list for null or empty", () => {
    expect(parseKeywords(null)).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords("")).toEqual([]);
  });
});
