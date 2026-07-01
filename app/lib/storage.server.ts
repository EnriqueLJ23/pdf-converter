import fs from "node:fs";
import path from "node:path";

function documentsRoot(): string {
  return process.env.DOCUMENTS_DIR ?? path.join(process.cwd(), "data", "documents");
}

export function documentDir(id: string): string {
  return path.join(documentsRoot(), id);
}

export function originalPdfPath(id: string): string {
  return path.join(documentDir(id), "original.pdf");
}

export function pagesDir(id: string): string {
  return path.join(documentDir(id), "pages");
}

export function pageImagePath(id: string, pageNumber: number): string {
  return path.join(pagesDir(id), `page-${pageNumber}.png`);
}

export function ensureDocumentDirs(id: string): void {
  fs.mkdirSync(pagesDir(id), { recursive: true });
}
