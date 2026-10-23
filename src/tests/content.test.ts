import { describe, expect, it } from "vitest";
import { QUESTIONS, STRUCTURED_DATA } from "@/app/faq/content";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  normaliseText,
  normaliseUrl,
} from "@/lib/listing";

/**
 * Guards on the content modules.
 *
 * The FAQ keeps its human-readable answers as React nodes and its machine-
 * readable answers as plain strings, because a React node cannot be serialised
 * into JSON-LD. Two parallel lists can silently drift, which would publish
 * structured data that contradicts the page — a search-engine penalty for
 * something no type checker catches.
 */

describe("FAQ structured data", () => {
  it("has an answer for every question", () => {
    const entities = STRUCTURED_DATA.mainEntity;
    expect(entities).toHaveLength(QUESTIONS.length);
  });

  it("pairs each question with a non-empty answer", () => {
    const entities = STRUCTURED_DATA.mainEntity;
    for (const [index, entity] of entities.entries()) {
      expect(entity.name).toBe(QUESTIONS[index].q);
      expect(entity.acceptedAnswer.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("declares itself an FAQPage", () => {
    expect(STRUCTURED_DATA["@type"]).toBe("FAQPage");
    expect(STRUCTURED_DATA["@context"]).toBe("https://schema.org");
  });

  it("does not repeat a question", () => {
    const asked = QUESTIONS.map((item) => item.q);
    expect(new Set(asked).size).toBe(asked.length);
  });
});

describe("normaliseText", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normaliseText("  a \n\n b \t c  ", 160)).toBe("a b c");
  });

  it("caps at the limit", () => {
    expect(normaliseText("x".repeat(200), 160)).toHaveLength(160);
  });

  it("keeps the description cap the brief specified", () => {
    expect(MAX_DESCRIPTION_LENGTH).toBe(160);
  });
});

describe("normaliseUrl", () => {
  it("accepts https and http", () => {
    expect(normaliseUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normaliseUrl("http://example.com")).toBe("http://example.com/");
  });

  it("assumes https when no scheme is given", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com/");
  });

  it("rejects schemes that are not http(s)", () => {
    // A javascript: or data: destination on a public board is an injection
    // vector, not a listing.
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("data:text/html,<script>")).toBeNull();
    expect(normaliseUrl("mailto:hi@example.com")).toBeNull();
  });

  it("rejects a bare word with no host", () => {
    expect(normaliseUrl("notahost")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normaliseUrl("   ")).toBeNull();
  });

  it("keeps titles to a single display line", () => {
    expect(MAX_TITLE_LENGTH).toBeLessThanOrEqual(120);
  });
});
