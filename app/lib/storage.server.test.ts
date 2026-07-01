import { describe, expect, it } from "vitest";
import path from "node:path";
import { documentDir, originalPdfPath, pageImagePath, pagesDir } from "./storage.server";

describe("storage.server path helpers", () => {
  it("builds paths under DOCUMENTS_DIR for a given document id", () => {
    process.env.DOCUMENTS_DIR = "/tmp/docs-test";

    expect(documentDir("abc")).toBe(path.join("/tmp/docs-test", "abc"));
    expect(originalPdfPath("abc")).toBe(path.join("/tmp/docs-test", "abc", "original.pdf"));
    expect(pagesDir("abc")).toBe(path.join("/tmp/docs-test", "abc", "pages"));
    expect(pageImagePath("abc", 3)).toBe(path.join("/tmp/docs-test", "abc", "pages", "page-3.png"));
  });
});
