import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  createDocument,
  db,
  markDocumentError,
  markDocumentReady,
  syncDocumentFts,
} from "./db.server";
import { indexDocumentText } from "./index-document.server";
import { PdfConversionError, convertPdfToPages } from "./pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "./storage.server";
import type { Language } from "./i18n";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function storeAndConvertPdf(
  userId: string,
  fileBytes: Buffer,
  title: string,
  description: string | null,
  categoryId: string | null,
  language: Language,
) {
  const documentId = randomUUID();
  ensureDocumentDirs(documentId);
  fs.writeFileSync(originalPdfPath(documentId), fileBytes);
  createDocument(db, { id: documentId, title, description, uploadedBy: userId, categoryId, language });
  syncDocumentFts(db, documentId);

  try {
    const pageCount = await convertPdfToPages(documentId);
    markDocumentReady(db, documentId, pageCount);
  } catch (error) {
    const message =
      error instanceof PdfConversionError ? error.message : "Error desconocido al convertir el PDF.";
    markDocumentError(db, documentId, message);
    return { ok: false as const };
  }

  // Deliberately not awaited: text extraction (with a possible OCR fallback)
  // can take several seconds per page, and must not delay this response.
  // indexDocumentText() already catches its own errors internally, but this
  // .catch() is a second safety net against an unhandled rejection ever
  // reaching the Node process and crashing the server.
  indexDocumentText(documentId).catch((error: unknown) => {
    console.error(`Unexpected error indexing document ${documentId}`, error);
  });

  return { ok: true as const };
}
