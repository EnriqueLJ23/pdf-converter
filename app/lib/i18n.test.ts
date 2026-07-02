import { describe, expect, it } from "vitest";
import { LANGUAGE_LABELS, t, translations } from "./i18n";

describe("i18n", () => {
  it("has the same set of keys for every language", () => {
    const esKeys = Object.keys(translations.es).sort();
    const jaKeys = Object.keys(translations.ja).sort();
    expect(jaKeys).toEqual(esKeys);
  });

  it("returns the translated string for a known key", () => {
    expect(t("es", "documents.title")).toBe("Documentos");
    expect(t("ja", "documents.title")).toBe("ドキュメント");
  });

  it("never translates the language switcher's own labels", () => {
    expect(LANGUAGE_LABELS.es).toBe("Español");
    expect(LANGUAGE_LABELS.ja).toBe("日本語");
  });
});
