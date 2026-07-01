# Búsqueda de documentos por contenido (OCR + palabras clave) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract text from every uploaded PDF (native text first, OCR fallback for scans), reduce it to stopword-filtered keywords, index everything in SQLite FTS5, and let users filter `/documentos` by a search box.

**Architecture:** Two new pure-logic modules (`text-extract.server.ts`, `keywords.server.ts`) feed a small orchestrator (`index-document.server.ts`) that the upload action calls without awaiting, so OCR never blocks the HTTP response. SQLite gains a `documents_fts` virtual table (FTS5, built into `better-sqlite3` by default — verified locally) kept in sync via explicit `DELETE`+`INSERT`, not triggers.

**Tech Stack:** `pdf-parse` ^2.4.5 (class-based `PDFParse` API), `tesseract.js` ^7.0.0 (`createWorker`), `natural` ^8.1.1 (tokenizer + English stopwords), SQLite FTS5 via `better-sqlite3` (already a dependency).

## Global Constraints

- Extraction is hybrid: try `pdf-parse` first; if the result has fewer than 50 characters of trimmed text, fall back to OCR over the already-generated `pages/page-N.png` files (never re-render from the PDF).
- OCR language is `spa+eng` (confirmed via the user's answer: scanned PDFs mix Spanish and English).
- Keyword extraction is frequency-based (tokenize → strip stopwords/short tokens/pure numbers → top 15 by count), **not** TF-IDF against the whole corpus and **not** any AI/embeddings component.
- Indexing runs in the background: the upload `action` calls the indexing orchestrator without `await`, so a slow OCR job never delays the HTTP response. If the process restarts mid-index, that document's `index_status` simply stays `'pending'` forever — no retry queue, matches the spec's accepted limitation.
- `documents.index_status` (`'pending' | 'indexed' | 'failed'`) is independent of the existing `documents.status` (`'processing' | 'ready' | 'error'`, which tracks image conversion) — a document can be visible (`status='ready'`) while not yet searchable (`index_status='pending'`).
- Schema changes apply via the same auto-migration pattern already in `createDb()` (check `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` per missing column) — no manual SQL step on the production VM.
- The search box only exists on `/documentos` (the public list) — not on `/admin/documentos`, per the approved spec.
- FTS5 search queries must be sanitized (every whitespace-separated term wrapped in escaped double quotes) so a user typing `"`, `*`, `AND`, `NEAR()`, etc. never causes a syntax error or an unintended query — verified locally against `better-sqlite3`'s bundled FTS5.
- Tesseract's language data (`spa.traineddata.gz`, `eng.traineddata.gz`) is downloaded once at Docker **build** time from `https://tessdata.projectnaptha.com/4.0.0/` (tesseract.js's own documented default CDN) into `/app/tessdata`, not fetched at container runtime.
- No automated test exercises OCR unless both Poppler (`pdftoppm`) and the local `tessdata` directory are present — same `describe.skipIf` pattern already used for the Poppler conversion test. On this Windows dev machine both are absent, so that test is skipped locally and only runs for real inside the Docker image.

---

### Task 1: Add dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `pdf-parse`, `tesseract.js`, `natural` become available as imports for Tasks 2–3.

- [ ] **Step 1: Add the three dependencies**

Edit `package.json` dependencies (insert alphabetically):
```json
"dependencies": {
  "@react-router/node": "8.0.0",
  "@react-router/serve": "8.0.0",
  "better-sqlite3": "^12.11.1",
  "isbot": "^5.1.36",
  "lucide-react": "^1.23.0",
  "natural": "^8.1.1",
  "openid-client": "^6.8.4",
  "pdf-parse": "^2.4.5",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "react-router": "8.0.0",
  "tesseract.js": "^7.0.0"
}
```

Run: `npm install`

- [ ] **Step 2: Verify the install didn't break anything**

Run: `npm run typecheck`
Expected: no errors (only the pre-existing Node-version warning).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse, tesseract.js, and natural dependencies"
```

---

### Task 2: Text extraction module (pdf-parse + OCR fallback)

**Files:**
- Create: `app/lib/text-extract.server.ts`
- Test: `app/lib/text-extract.server.test.ts`

**Interfaces:**
- Consumes: `pageImagePath` (`~/lib/storage.server`, already exists); `convertPdfToPages`, `isPdftoppmAvailable` (`~/lib/pdf-convert.server`, already exists — used only by the test, to produce a real page image to OCR).
- Produces (used by Task 5):
  - `isTessdataAvailable(): boolean`
  - `extractTextFromPdf(pdfPath: string): Promise<string>`
  - `extractTextViaOcr(documentId: string, pageCount: number): Promise<string>`
  - `extractDocumentText(documentId: string, pdfPath: string, pageCount: number): Promise<string>` — the hybrid entry point: tries `extractTextFromPdf`, falls back to `extractTextViaOcr` if the result is under 50 trimmed characters.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/text-extract.server.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify the ones that can run fail**

Run: `npm run test -- text-extract.server`
Expected: FAIL — `Cannot find module './text-extract.server'`.

- [ ] **Step 3: Implement `text-extract.server.ts`**

Create `app/lib/text-extract.server.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npm run test -- text-extract.server`
Expected: `extractTextFromPdf` and `extractDocumentText` tests pass; the OCR integration test is skipped locally (no Poppler, no `tessdata` directory on this machine) with the console warning printed — this is a pass, not a failure.

- [ ] **Step 5: Commit**

```bash
git add app/lib/text-extract.server.ts app/lib/text-extract.server.test.ts
git commit -m "feat: extract PDF text with pdf-parse, falling back to Tesseract OCR"
```

---

### Task 3: Keyword extraction module

**Files:**
- Create: `app/lib/keywords.server.ts`
- Test: `app/lib/keywords.server.test.ts`

**Interfaces:**
- Consumes: `natural` (Task 1).
- Produces (used by Task 5): `extractKeywords(text: string): string[]` — lowercase, tokenized, stopwords/short-tokens/pure-numbers removed, top 15 by frequency.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/keywords.server.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- keywords.server`
Expected: FAIL — `Cannot find module './keywords.server'`.

- [ ] **Step 3: Implement `keywords.server.ts`**

Create `app/lib/keywords.server.ts`:
```ts
import natural from "natural";

const TOP_N = 15;
const MIN_TOKEN_LENGTH = 3;

// `natural` publicly exports English stopwords (`natural.stopwords`), but its
// Spanish list lives in an internal file with no public export, so we keep a
// small Spanish stopword list here instead of depending on natural's
// internal file layout (which could move between versions without notice).
const SPANISH_STOPWORDS = [
  "a", "un", "el", "ella", "y", "sobre", "de", "la", "que", "en",
  "los", "del", "se", "las", "por", "para", "con", "no",
  "una", "su", "al", "lo", "como", "más", "pero", "sus", "le",
  "ya", "o", "porque", "cuando", "muy", "sin", "también",
  "me", "hasta", "donde", "quien", "desde", "nos", "durante", "uno",
  "ni", "contra", "ese", "eso", "mí", "qué", "otro", "él", "cual",
  "poco", "mi", "tú", "te", "ti", "sí",
];

const STOPWORDS = new Set(
  [...natural.stopwords, ...SPANISH_STOPWORDS].map((word) => word.toLowerCase()),
);

const tokenizer = new natural.WordTokenizer();

export function extractKeywords(text: string): string[] {
  const tokens: string[] = tokenizer.tokenize(text.toLowerCase()) ?? [];

  const frequency = new Map<string, number>();
  for (const token of tokens) {
    if (token.length < MIN_TOKEN_LENGTH || STOPWORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([word]) => word);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test -- keywords.server`
Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/keywords.server.ts app/lib/keywords.server.test.ts
git commit -m "feat: extract frequency-based keywords with stopword filtering"
```

---

### Task 4: FTS5 search index in `db.server.ts`

**Files:**
- Modify: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Consumes: nothing new (extends the existing schema/singleton).
- Produces (used by Tasks 5, 6, 7):
  - `DocumentRecord` gains `indexStatus: "pending" | "indexed" | "failed"` and `keywords: string[]`.
  - `markDocumentIndexed(conn, id, { extractedText: string; keywords: string[] }): void`
  - `markDocumentIndexFailed(conn, id): void`
  - `syncDocumentFts(conn, id): void`
  - `searchReadyDocuments(conn, query: string): DocumentRecord[]`

- [ ] **Step 1: Write the failing tests**

Edit `app/lib/db.server.test.ts` — update the import list, the `beforeEach` to also clear `documents_fts`, and add four new tests at the end of the `describe` block:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  createCategory,
  createDb,
  createDocument,
  deleteCategory,
  deleteDocumentRecord,
  getDocumentById,
  listAllDocuments,
  listCategories,
  listReadyDocuments,
  markDocumentError,
  markDocumentIndexFailed,
  markDocumentIndexed,
  markDocumentReady,
  searchReadyDocuments,
  syncDocumentFts,
  updateDocumentMetadata,
  upsertUser,
} from "./db.server";

describe("db.server", () => {
  const db = createDb(":memory:");

  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users; DELETE FROM categories; DELETE FROM documents_fts;");
  });

  // ... keep all 8 existing tests unchanged, add: ...

  it("indexes a document's text and finds it via full-text search", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d1", title: "Contrato", description: null, uploadedBy: "u1" });
    markDocumentReady(db, "d1", 1);
    syncDocumentFts(db, "d1");

    expect(searchReadyDocuments(db, "arrendamiento")).toHaveLength(0);

    markDocumentIndexed(db, "d1", {
      extractedText: "Contrato de arrendamiento de un inmueble en la ciudad",
      keywords: ["contrato", "arrendamiento", "inmueble"],
    });
    syncDocumentFts(db, "d1");

    const results = searchReadyDocuments(db, "arrendamiento");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d1");
    expect(results[0].keywords).toEqual(["contrato", "arrendamiento", "inmueble"]);
    expect(results[0].indexStatus).toBe("indexed");
  });

  it("does not return documents that are not status='ready' from search", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d2", title: "Procesando", description: null, uploadedBy: "u1" });
    syncDocumentFts(db, "d2");
    markDocumentIndexed(db, "d2", { extractedText: "contenido de prueba", keywords: ["prueba"] });
    syncDocumentFts(db, "d2");

    expect(searchReadyDocuments(db, "prueba")).toHaveLength(0);
  });

  it("marks a document's index as failed", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d3", title: "Roto", description: null, uploadedBy: "u1" });

    markDocumentIndexFailed(db, "d3");

    expect(getDocumentById(db, "d3")?.indexStatus).toBe("failed");
  });

  it("sanitizes special FTS5 syntax characters in the search query without throwing", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d4", title: "Documento normal", description: null, uploadedBy: "u1" });
    markDocumentReady(db, "d4", 1);
    syncDocumentFts(db, "d4");

    expect(() => searchReadyDocuments(db, '"unclosed AND OR* NEAR()')).not.toThrow();
    expect(searchReadyDocuments(db, '"unclosed AND OR* NEAR()')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test -- db.server`
Expected: FAIL — `markDocumentIndexed`/`markDocumentIndexFailed`/`syncDocumentFts`/`searchReadyDocuments` are not exported, and `no such table: documents_fts`.

- [ ] **Step 3: Implement the FTS5 index in `db.server.ts`**

Replace `app/lib/db.server.ts` entirely:
```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DocumentStatus = "processing" | "ready" | "error";
export type IndexStatus = "pending" | "indexed" | "failed";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  lastLoginAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  description: string | null;
  pageCount: number;
  uploadedBy: string;
  createdAt: string;
  status: DocumentStatus;
  errorMessage: string | null;
  categoryId: string | null;
  categoryName: string | null;
  indexStatus: IndexStatus;
  keywords: string[];
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  last_login_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
}

interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  page_count: number;
  uploaded_by: string;
  created_at: string;
  status: DocumentStatus;
  error_message: string | null;
  category_id: string | null;
  category_name: string | null;
  index_status: IndexStatus;
  keywords: string | null;
}

export function createDb(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const conn = new Database(filePath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      extracted_text TEXT,
      keywords TEXT,
      index_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      document_id UNINDEXED,
      title,
      description,
      extracted_text,
      keywords
    );
  `);

  const documentColumns = conn.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  const existingColumnNames = new Set(documentColumns.map((col) => col.name));

  if (!existingColumnNames.has("category_id")) {
    conn.exec(
      "ALTER TABLE documents ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL",
    );
  }
  if (!existingColumnNames.has("extracted_text")) {
    conn.exec("ALTER TABLE documents ADD COLUMN extracted_text TEXT");
  }
  if (!existingColumnNames.has("keywords")) {
    conn.exec("ALTER TABLE documents ADD COLUMN keywords TEXT");
  }
  if (!existingColumnNames.has("index_status")) {
    conn.exec("ALTER TABLE documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending'");
  }

  return conn;
}

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
export const db = createDb(DATABASE_PATH);

const DOCUMENT_SELECT = `
  SELECT documents.*, categories.name AS category_name
  FROM documents
  LEFT JOIN categories ON categories.id = documents.category_id
`;

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
}

function rowToCategory(row: CategoryRow): CategoryRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function rowToDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pageCount: row.page_count,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    status: row.status,
    errorMessage: row.error_message,
    categoryId: row.category_id,
    categoryName: row.category_name,
    indexStatus: row.index_status,
    keywords: row.keywords ? row.keywords.split(", ").filter(Boolean) : [],
  };
}

export function upsertUser(
  conn: Database.Database,
  user: { id: string; email: string; name: string; isAdmin: boolean },
): UserRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO users (id, email, name, is_admin, last_login_at)
       VALUES (@id, @email, @name, @isAdmin, @lastLoginAt)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         is_admin = excluded.is_admin,
         last_login_at = excluded.last_login_at`,
    )
    .run({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin ? 1 : 0,
      lastLoginAt: now,
    });

  return rowToUser(conn.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow);
}

export function createCategory(
  conn: Database.Database,
  category: { id: string; name: string },
): CategoryRecord {
  const now = new Date().toISOString();
  conn
    .prepare("INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)")
    .run(category.id, category.name, now);
  return rowToCategory(conn.prepare("SELECT * FROM categories WHERE id = ?").get(category.id) as CategoryRow);
}

export function listCategories(conn: Database.Database): CategoryRecord[] {
  return (conn.prepare("SELECT * FROM categories ORDER BY name ASC").all() as CategoryRow[]).map(rowToCategory);
}

export function deleteCategory(conn: Database.Database, id: string): void {
  conn.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function createDocument(
  conn: Database.Database,
  doc: {
    id: string;
    title: string;
    description: string | null;
    uploadedBy: string;
    categoryId?: string | null;
  },
): DocumentRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO documents (id, title, description, page_count, uploaded_by, created_at, status, error_message, category_id)
       VALUES (@id, @title, @description, 0, @uploadedBy, @createdAt, 'processing', NULL, @categoryId)`,
    )
    .run({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: doc.uploadedBy,
      createdAt: now,
      categoryId: doc.categoryId ?? null,
    });

  return rowToDocument(
    conn.prepare(`${DOCUMENT_SELECT} WHERE documents.id = ?`).get(doc.id) as DocumentRow,
  );
}

export function markDocumentReady(conn: Database.Database, id: string, pageCount: number): void {
  conn.prepare("UPDATE documents SET status = 'ready', page_count = ? WHERE id = ?").run(pageCount, id);
}

export function markDocumentError(conn: Database.Database, id: string, errorMessage: string): void {
  conn.prepare("UPDATE documents SET status = 'error', error_message = ? WHERE id = ?").run(errorMessage, id);
}

export function updateDocumentMetadata(
  conn: Database.Database,
  id: string,
  metadata: { title: string; description: string | null; categoryId: string | null },
): void {
  conn
    .prepare("UPDATE documents SET title = ?, description = ?, category_id = ? WHERE id = ?")
    .run(metadata.title, metadata.description, metadata.categoryId, id);
}

export function deleteDocumentRecord(conn: Database.Database, id: string): void {
  conn.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

export function markDocumentIndexed(
  conn: Database.Database,
  id: string,
  data: { extractedText: string; keywords: string[] },
): void {
  conn
    .prepare("UPDATE documents SET extracted_text = ?, keywords = ?, index_status = 'indexed' WHERE id = ?")
    .run(data.extractedText, data.keywords.join(", "), id);
}

export function markDocumentIndexFailed(conn: Database.Database, id: string): void {
  conn.prepare("UPDATE documents SET index_status = 'failed' WHERE id = ?").run(id);
}

export function syncDocumentFts(conn: Database.Database, id: string): void {
  const row = conn
    .prepare("SELECT title, description, extracted_text, keywords FROM documents WHERE id = ?")
    .get(id) as
    | { title: string; description: string | null; extracted_text: string | null; keywords: string | null }
    | undefined;
  if (!row) return;

  conn.prepare("DELETE FROM documents_fts WHERE document_id = ?").run(id);
  conn
    .prepare(
      "INSERT INTO documents_fts (document_id, title, description, extracted_text, keywords) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, row.title, row.description ?? "", row.extracted_text ?? "", row.keywords ?? "");
}

function sanitizeFtsQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => `"${term.replace(/"/g, '""')}"`);
  return terms.length > 0 ? terms.join(" ") : '""';
}

export function searchReadyDocuments(conn: Database.Database, query: string): DocumentRecord[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const rows = conn
    .prepare(
      `SELECT documents.*, categories.name AS category_name
       FROM documents_fts
       JOIN documents ON documents.id = documents_fts.document_id
       LEFT JOIN categories ON categories.id = documents.category_id
       WHERE documents_fts MATCH ? AND documents.status = 'ready'
       ORDER BY bm25(documents_fts)`,
    )
    .all(ftsQuery) as DocumentRow[];
  return rows.map(rowToDocument);
}

export function listReadyDocuments(conn: Database.Database): DocumentRecord[] {
  return (
    conn
      .prepare(`${DOCUMENT_SELECT} WHERE documents.status = 'ready' ORDER BY documents.created_at DESC`)
      .all() as DocumentRow[]
  ).map(rowToDocument);
}

export function listAllDocuments(conn: Database.Database): DocumentRecord[] {
  return (
    conn.prepare(`${DOCUMENT_SELECT} ORDER BY documents.created_at DESC`).all() as DocumentRow[]
  ).map(rowToDocument);
}

export function getDocumentById(conn: Database.Database, id: string): DocumentRecord | undefined {
  const row = conn.prepare(`${DOCUMENT_SELECT} WHERE documents.id = ?`).get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test -- db.server`
Expected: 12 tests passed.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: 21 passed, 2 skipped (the pre-existing Poppler-conversion test plus Task 2's OCR integration test — both skip locally on this Windows machine, no Poppler/tessdata here, and both run for real inside the Docker image).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add FTS5 search index for document content"
```

---

### Task 5: Indexing orchestrator

**Files:**
- Create: `app/lib/index-document.server.ts`

**Interfaces:**
- Consumes: `extractDocumentText` (`~/lib/text-extract.server`, Task 2); `extractKeywords` (`~/lib/keywords.server`, Task 3); `db`, `getDocumentById`, `markDocumentIndexed`, `markDocumentIndexFailed`, `syncDocumentFts` (`~/lib/db.server`, Task 4); `originalPdfPath` (`~/lib/storage.server`, already exists).
- Produces (used by Task 6): `indexDocumentText(documentId: string): Promise<void>` — reads the document's page count from the DB, extracts text, extracts keywords, marks the document indexed (or failed), and re-syncs its FTS row. Never throws — all failures are caught and result in `markDocumentIndexFailed`.

This is glue code over already-unit-tested functions (same category as the route files elsewhere in this project) — no dedicated test file; it's exercised by the manual verification in Task 9.

- [ ] **Step 1: Implement the orchestrator**

Create `app/lib/index-document.server.ts`:
```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/index-document.server.ts
git commit -m "feat: add background text-indexing orchestrator"
```

---

### Task 6: Wire indexing into the upload route

**Files:**
- Modify: `app/routes/admin-upload.tsx`

**Interfaces:**
- Consumes: `syncDocumentFts` (`~/lib/db.server`, Task 4); `indexDocumentText` (`~/lib/index-document.server`, Task 5).
- Produces: nothing new for later tasks (leaf change).

- [ ] **Step 1: Sync FTS immediately on creation, then fire-and-forget the text indexing**

Edit `app/routes/admin-upload.tsx` — update the imports and the `action` function:
```tsx
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Form, data, redirect, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { createDocument, db, listCategories, markDocumentError, markDocumentReady, syncDocumentFts } from "~/lib/db.server";
import { indexDocumentText } from "~/lib/index-document.server";
import { PdfConversionError, convertPdfToPages } from "~/lib/pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "~/lib/storage.server";
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const categories = listCategories(db);
  return { user, categories };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const file = formData.get("file");

  if (!title) {
    return data({ error: "El título es obligatorio." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return data({ error: "Selecciona un archivo PDF." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return data({ error: "El archivo excede el tamaño máximo permitido." }, { status: 400 });
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());
  if (fileBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return data({ error: "El archivo no es un PDF válido." }, { status: 400 });
  }

  const documentId = randomUUID();
  ensureDocumentDirs(documentId);
  fs.writeFileSync(originalPdfPath(documentId), fileBytes);
  createDocument(db, { id: documentId, title, description, uploadedBy: user.id, categoryId });
  syncDocumentFts(db, documentId);

  try {
    const pageCount = await convertPdfToPages(documentId);
    markDocumentReady(db, documentId, pageCount);
  } catch (error) {
    const message =
      error instanceof PdfConversionError ? error.message : "Error desconocido al convertir el PDF.";
    markDocumentError(db, documentId, message);
    return redirect("/admin/documentos?error=conversion");
  }

  // Deliberately not awaited: text extraction (with a possible OCR fallback)
  // can take several seconds per page, and must not delay this response.
  // indexDocumentText() already catches its own errors internally, but this
  // .catch() is a second safety net against an unhandled rejection ever
  // reaching the Node process and crashing the server.
  indexDocumentText(documentId).catch((error: unknown) => {
    console.error(`Unexpected error indexing document ${documentId}`, error);
  });

  return redirect("/admin/documentos?success=1");
}
```

(The component/JSX below `action` is unchanged from the current file — only the imports and `action` function change.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-upload.tsx
git commit -m "feat: trigger background text indexing after upload"
```

---

### Task 7: Search box and keyword tags on `/documentos`

**Files:**
- Modify: `app/routes/documents-list.tsx`

**Interfaces:**
- Consumes: `searchReadyDocuments`, `listReadyDocuments` (`~/lib/db.server`, Task 4).
- Produces: nothing new for later tasks (leaf change).

- [ ] **Step 1: Add the search form and keyword tags**

Replace `app/routes/documents-list.tsx` entirely:
```tsx
import { ChevronRight } from "lucide-react";
import { Form, Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments, searchReadyDocuments } from "~/lib/db.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query) : listReadyDocuments(db);
  return { user, documents, query };
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents, query } = loaderData;

  return (
    <AppShell title="Documentos" user={user}>
      <Form method="get" className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por título, descripción o contenido..."
          className="w-full rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]"
        />
      </Form>

      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">
          {query ? `No se encontraron documentos para «${query}».` : "Todavía no hay documentos disponibles."}
        </p>
      ) : (
        <GlassPanel className="divide-y divide-black/5 dark:divide-white/10">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              to={`/documentos/${doc.id}`}
              className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <div>
                <p className="font-medium tracking-tight">{doc.title}</p>
                {doc.description && (
                  <p className="text-sm text-black/60 dark:text-white/50">{doc.description}</p>
                )}
                <p className="text-xs text-black/40 dark:text-white/30">{doc.pageCount} páginas</p>
                {doc.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.keywords.slice(0, 6).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs text-accent-600 dark:text-accent-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight
                size={18}
                className="text-black/30 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/30"
              />
            </Link>
          ))}
        </GlassPanel>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/documents-list.tsx
git commit -m "feat: add content search box and keyword tags to documents list"
```

---

### Task 8: Bundle Tesseract language data in Docker, document `TESSDATA_PATH`

**Files:**
- Modify: `Dockerfile`
- Modify: `.env.example`

**Interfaces:** none — infrastructure only.

- [ ] **Step 1: Download `spa`/`eng` language data at build time in the final image**

Edit `Dockerfile` — replace the final stage:
```dockerfile
FROM node:24-alpine
RUN apk add --no-cache poppler-utils ca-certificates
RUN mkdir -p /app/tessdata && \
    wget -q https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz -O /app/tessdata/eng.traineddata.gz && \
    wget -q https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz -O /app/tessdata/spa.traineddata.gz
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
VOLUME ["/data"]
ENV DATABASE_PATH=/data/app.db
ENV DOCUMENTS_DIR=/data/documents
ENV TESSDATA_PATH=/app/tessdata
CMD ["npm", "run", "start"]
```

(`ca-certificates` is added because Alpine's base image doesn't include it by default, and `wget` over `https://` needs it to validate the CDN's TLS certificate. `wget` itself is already part of Alpine's busybox — no separate package needed.)

- [ ] **Step 2: Document `TESSDATA_PATH` for local development**

Edit `.env.example`:
```
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_ADMIN_GROUP_ID=
SESSION_SECRET=
APP_BASE_URL=http://localhost:3000
DATABASE_PATH=./data/app.db
DOCUMENTS_DIR=./data/documents
MAX_UPLOAD_BYTES=52428800
TESSDATA_PATH=./tessdata
```

- [ ] **Step 3: Build the Docker image to verify the Dockerfile is valid**

Run: `docker build -t pdf-viewer .`
Expected: build succeeds, including the two `wget` steps downloading the language files.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .env.example
git commit -m "chore: bundle Tesseract language data in the Docker image"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run test`
Expected: 21 passed, 2 skipped (the pre-existing Poppler-conversion test, plus the OCR integration test from Task 2 — both skip locally on this Windows machine and both run for real inside the Docker image).

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Verify the bundled Tesseract language data downloaded correctly**

```bash
docker run --rm pdf-viewer sh -c "ls -la /app/tessdata && [ -s /app/tessdata/eng.traineddata.gz ] && [ -s /app/tessdata/spa.traineddata.gz ] && echo 'tessdata OK'"
```
Expected: both files listed with non-trivial size (a few MB each, not 0 bytes — a 0-byte file would mean the `wget` in Task 8 failed silently), and `tessdata OK` printed.

- [ ] **Step 4: Manual verification checklist (in a browser, real deployment)**

- [ ] Upload a PDF that has real embedded text (e.g. exported from Word). Within a few seconds, search `/documentos` for a distinctive word from that PDF's body — it should appear in results, and show keyword tags.
- [ ] Upload a scanned PDF (a photo of a printed page, or a PDF made purely of a picture with no text layer). Wait a bit longer (OCR takes several seconds per page), then search for a word visible in the scan — it should also appear, with the OCR'd keywords as tags.
- [ ] Search `/documentos` for something no document contains — confirm the "No se encontraron documentos para «...»" message appears instead of an empty list.
- [ ] Type search terms containing quotes or asterisks (e.g. `"test* OR`) — confirm no error page appears, just an empty or normal result set.
- [ ] Confirm a document still appears in `/documentos` and opens normally in the viewer immediately after upload, even before its background indexing finishes (visibility should never depend on indexing completing).

- [ ] **Step 5: Commit any fixes found during manual verification**

If Step 4 uncovers a bug, fix it and commit:
```bash
git add <changed files>
git commit -m "fix: <describe the fix>"
```

If nothing needed fixing, this task requires no additional commit.

---

## Self-Review Notes

- **Spec coverage:** hybrid extraction (pdf-parse + OCR fallback) → Task 2; frequency-based keyword extraction with stopwords → Task 3; FTS5 index + `index_status` independent of `status` + automatic migration → Task 4; background "fire and forget" indexing → Tasks 5–6; search box + keyword tags on `/documentos` only → Task 7; bundling language data at Docker build time (not runtime) → Task 8; error handling table from the spec (pdf-parse failure → OCR fallback, OCR failure → `index_status='failed'` without blocking visibility, FTS5 syntax sanitization, `'pending'` documents simply absent from results) → covered across Tasks 2, 4, 5 and exercised in Task 9's manual checklist.
- **Type consistency checked:** `extractDocumentText`/`extractTextViaOcr`/`isTessdataAvailable` names and signatures from Task 2 match their use in Task 5; `extractKeywords` from Task 3 matches its use in Task 5; `markDocumentIndexed`/`markDocumentIndexFailed`/`syncDocumentFts`/`searchReadyDocuments` from Task 4 match their use in Tasks 5–7; `DocumentRecord.keywords`/`indexStatus` field names match between Task 4's definition and Task 7's rendering.
- **No placeholders:** every step has literal file contents or exact commands; the Task 2 OCR test and Task 9's final count are real conditional test code (`describe.skipIf`), not TODOs — consistent with the existing Poppler test pattern in this codebase.
- **Known gap flagged (not silently expanded scope):** documents uploaded *before* this plan lands will have `index_status='pending'` forever (the migration backfills the column but nothing re-triggers indexing for pre-existing rows) — there's no re-indexing trigger in this plan, matching the spec's explicit "sin cola de trabajos / sin reintento automático" constraint. If the already-uploaded test documents need to be searchable, they'll need to be re-uploaded, or a manual reindex path added later as a follow-up.
