import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ensureDocumentDirs, originalPdfPath, pagesDir } from "./storage.server";

const execFileAsync = promisify(execFile);
const CONVERT_TIMEOUT_MS = 30_000;
const RENDER_DPI = 150;

export class PdfConversionError extends Error {}

export function isPdftoppmAvailable(): boolean {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export async function convertPdfToPages(documentId: string): Promise<number> {
  ensureDocumentDirs(documentId);
  const pdfPath = originalPdfPath(documentId);
  const outDir = pagesDir(documentId);
  const tmpPrefix = path.join(outDir, "tmp");

  try {
    await execFileAsync("pdftoppm", ["-png", "-r", String(RENDER_DPI), pdfPath, tmpPrefix], {
      timeout: CONVERT_TIMEOUT_MS,
    });
  } catch (error) {
    throw new PdfConversionError(
      `pdftoppm failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // pdftoppm zero-pads its numeric suffix based on the total page count, so we
  // can't predict the exact filenames up front. Sort what it produced and
  // rename to a fixed page-N.png scheme so the rest of the app never has to
  // deal with variable padding.
  const generated = fs
    .readdirSync(outDir)
    .filter((name) => name.startsWith("tmp") && name.endsWith(".png"))
    .map((name) => {
      const match = name.match(/tmp-?(\d+)\.png$/);
      return { name, index: match ? Number(match[1]) : 0 };
    })
    .sort((a, b) => a.index - b.index);

  if (generated.length === 0) {
    throw new PdfConversionError("pdftoppm produced no pages");
  }

  generated.forEach((file, i) => {
    fs.renameSync(path.join(outDir, file.name), path.join(outDir, `page-${i + 1}.png`));
  });

  return generated.length;
}
