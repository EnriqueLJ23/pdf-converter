import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertPdfToPages, isPdftoppmAvailable } from "./pdf-convert.server";

const poppler = isPdftoppmAvailable();

if (!poppler) {
  console.warn(
    "pdftoppm not found on PATH - skipping convertPdfToPages test. " +
      "Install Poppler locally (e.g. `choco install poppler` on Windows) to run it, " +
      "or rely on the Docker image, which installs poppler-utils.",
  );
}

describe.skipIf(!poppler)("convertPdfToPages", () => {
  const documentId = "test-doc";
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-viewer-test-"));
    process.env.DOCUMENTS_DIR = tmpDir;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 3; i++) {
      const page = pdfDoc.addPage([200, 200]);
      page.drawText(`Page ${i + 1}`, { x: 20, y: 100, size: 20, font });
    }
    const pdfBytes = await pdfDoc.save();

    fs.mkdirSync(path.join(tmpDir, documentId), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, documentId, "original.pdf"), pdfBytes);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("converts each page of the PDF into a numbered PNG", async () => {
    const pageCount = await convertPdfToPages(documentId);

    expect(pageCount).toBe(3);
    expect(fs.existsSync(path.join(tmpDir, documentId, "pages", "page-1.png"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, documentId, "pages", "page-2.png"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, documentId, "pages", "page-3.png"))).toBe(true);
  });
});
