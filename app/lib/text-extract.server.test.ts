import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { convertPdfToPages, isPdftoppmAvailable } from "./pdf-convert.server";
import {
  extractDocumentText,
  extractTextFromPdf,
  extractTextViaOcr,
  isTessdataAvailable,
} from "./text-extract.server";

describe("extractTextFromPdf", () => {
  it("extracts real text embedded in a PDF", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([300, 300]);
    page.drawText("Contrato de arrendamiento", { x: 20, y: 250, size: 18, font });
    const pdfBytes = await pdfDoc.save();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "text-extract-test-"));
    const pdfPath = path.join(tmpDir, "sample.pdf");
    fs.writeFileSync(pdfPath, pdfBytes);

    const text = await extractTextFromPdf(pdfPath);

    expect(text).toContain("Contrato de arrendamiento");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("extractDocumentText", () => {
  it("returns the pdf-parse result directly when there is enough embedded text", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 400]);
    page.drawText(
      "Este es un contrato con suficiente texto legible para superar el umbral minimo de extraccion.",
      { x: 20, y: 300, size: 12, font, maxWidth: 360 },
    );
    const pdfBytes = await pdfDoc.save();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-doc-test-"));
    const pdfPath = path.join(tmpDir, "sample.pdf");
    fs.writeFileSync(pdfPath, pdfBytes);

    const text = await extractDocumentText("unused-doc-id", pdfPath, 1);

    expect(text).toContain("contrato");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

const canRunOcrIntegration = isPdftoppmAvailable() && isTessdataAvailable();

if (!canRunOcrIntegration) {
  console.warn(
    "Skipping OCR integration test - requires both pdftoppm and Tesseract language data. " +
      "Install Poppler locally and download spa+eng traineddata to TESSDATA_PATH to run it, " +
      "or rely on the Docker image, which has both.",
  );
}

describe.skipIf(!canRunOcrIntegration)("extractTextViaOcr", () => {
  const documentId = "ocr-test-doc";
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-test-"));
    process.env.DOCUMENTS_DIR = tmpDir;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 200]);
    page.drawText("FACTURA ELECTRONICA", { x: 20, y: 100, size: 28, font });
    const pdfBytes = await pdfDoc.save();

    fs.mkdirSync(path.join(tmpDir, documentId), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, documentId, "original.pdf"), pdfBytes);
    await convertPdfToPages(documentId);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recognizes text rendered onto the page image", async () => {
    const text = await extractTextViaOcr(documentId, 1);
    expect(text.toUpperCase()).toContain("FACTURA");
  });
});
