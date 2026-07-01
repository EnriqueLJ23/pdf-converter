import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { pageImagePath } from "./storage.server";

const MIN_TEXT_LENGTH = 50;

function tessdataPath(): string {
  return process.env.TESSDATA_PATH ?? path.join(process.cwd(), "tessdata");
}

export function isTessdataAvailable(): boolean {
  const dir = tessdataPath();
  return (
    fs.existsSync(path.join(dir, "eng.traineddata.gz")) &&
    fs.existsSync(path.join(dir, "spa.traineddata.gz"))
  );
}

export async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function extractTextViaOcr(documentId: string, pageCount: number): Promise<string> {
  const dir = tessdataPath();
  const worker = await createWorker("spa+eng", undefined, {
    langPath: dir,
    cachePath: dir,
  });

  try {
    const pageTexts: string[] = [];
    for (let page = 1; page <= pageCount; page++) {
      const { data } = await worker.recognize(pageImagePath(documentId, page));
      pageTexts.push(data.text);
    }
    return pageTexts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

export async function extractDocumentText(
  documentId: string,
  pdfPath: string,
  pageCount: number,
): Promise<string> {
  let text = "";
  try {
    text = await extractTextFromPdf(pdfPath);
  } catch {
    text = "";
  }

  if (text.trim().length >= MIN_TEXT_LENGTH) {
    return text;
  }

  return extractTextViaOcr(documentId, pageCount);
}
