import { extractKeywords } from "./keywords.server";
import { db, getDocumentById, markDocumentIndexFailed, markDocumentIndexed, syncDocumentFts } from "./db.server";
import { originalPdfPath } from "./storage.server";
import { extractDocumentText } from "./text-extract.server";

export async function indexDocumentText(documentId: string): Promise<void> {
  const document = getDocumentById(db, documentId);
  if (!document) return;

  try {
    const text = await extractDocumentText(documentId, originalPdfPath(documentId), document.pageCount);
    const keywords = extractKeywords(text);
    markDocumentIndexed(db, documentId, { extractedText: text, keywords });
  } catch (error) {
    console.error(`Failed to index document ${documentId}`, error);
    markDocumentIndexFailed(db, documentId);
  }

  // This function is called without `await` from the upload action (a slow
  // OCR job must not delay the HTTP response), so it must never reject —
  // an unhandled rejection here would crash the whole Node process.
  try {
    syncDocumentFts(db, documentId);
  } catch (error) {
    console.error(`Failed to sync FTS for document ${documentId}`, error);
  }
}
