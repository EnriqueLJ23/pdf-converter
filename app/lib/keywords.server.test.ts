import { describe, expect, it } from "vitest";
import { extractKeywords } from "./keywords.server";

describe("extractKeywords", () => {
  it("removes stopwords and short tokens, ranking by frequency", () => {
    const text =
      "El contrato de arrendamiento establece que el arrendamiento del inmueble " +
      "inicia el primero de enero. El contrato tambien establece penalidades.";

    const keywords = extractKeywords(text);

    expect(keywords).toContain("contrato");
    expect(keywords).toContain("arrendamiento");
    expect(keywords).not.toContain("el");
    expect(keywords).not.toContain("de");
  });

  it("returns at most 15 keywords", () => {
    const words = Array.from({ length: 30 }, (_, i) => `palabraunica${i}`);
    const keywords = extractKeywords(words.join(" "));

    expect(keywords.length).toBeLessThanOrEqual(15);
  });
});
