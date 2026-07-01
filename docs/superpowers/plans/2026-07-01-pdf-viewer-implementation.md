# Visor de PDFs de solo lectura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin (identified via an Entra ID group) upload a PDF, have it converted to per-page PNG images, and let any authenticated employee view it page-by-page in the browser with no download/print/copy affordances.

**Architecture:** A single-container React Router 8 (framework mode, SSR) app. Auth is Azure AD/Entra ID via OIDC Authorization Code + PKCE (`openid-client`), with the logged-in user stored in a signed httpOnly cookie session. Metadata (`users`, `documents`) lives in SQLite (`better-sqlite3`) on a local disk volume; the PDF and its converted page images live on the same volume. Conversion uses Poppler's `pdftoppm` via `child_process`. The viewer route renders one `<img>` per page, fetched from a per-page image route that streams the PNG with `Cache-Control: private, no-store`.

**Tech Stack:** React Router 8.0.0 (framework mode), Node 24 (Docker) / Node 22 (local dev), Vite 8, TypeScript 5.9, Tailwind v4, `better-sqlite3` ^12.11.1, `openid-client` ^6.8.4, Vitest ^4.1.9, `pdf-lib` ^1.17.1 (test fixtures only).

## Global Constraints

- SSO: Azure AD / Microsoft Entra ID via OIDC, Authorization Code flow + PKCE. Endpoint: `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`.
- Access model: any authenticated user can view any document in `status = 'ready'`. No per-document permissions.
- `is_admin` is derived from Entra ID group membership (`ENTRA_ADMIN_GROUP_ID` env var, checked against the ID token's `groups` claim) and recalculated on every login.
- Conversion: Poppler `pdftoppm -png -r 150`, 30 second timeout, synchronous within the upload request (no background queue — out of scope per spec).
- Storage: local disk. `DATABASE_PATH` (default `./data/app.db`, Docker `/data/app.db`). `DOCUMENTS_DIR` (default `./data/documents`, Docker `/data/documents`).
- Max upload size: `MAX_UPLOAD_BYTES` env var, default 50MB (52428800 bytes).
- Anti-copy (basic level only — no watermark, no expiring tokens, both explicitly out of scope for this phase): no download button anywhere in the viewer; `user-select: none` in the viewer; `draggable={false}` on page `<img>`s; block the context menu in the viewer; block `Ctrl+P`/`Ctrl+S` while the viewer is mounted; `Cache-Control: private, no-store` + `Content-Disposition: inline` on page-image responses; `@media print { body { display: none } }` as a print fallback.
- All server-only code lives in `*.server.ts` files (React Router convention — never bundled to the client).
- Env vars used across the app: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_ADMIN_GROUP_ID`, `SESSION_SECRET`, `APP_BASE_URL`, `DATABASE_PATH`, `DOCUMENTS_DIR`, `MAX_UPLOAD_BYTES`.
- Out of scope for this phase (per spec): dynamic watermarking, expiring signed image URLs, per-document ACLs, background conversion queue, SharePoint/OneDrive ingestion.
- Path alias `~/*` maps to `./app/*` (see `tsconfig.json`).

---

### Task 1: Test tooling (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json`
- Test: `app/lib/sanity.test.ts` (deleted at the end of this task — it only exists to prove the harness works)

**Interfaces:**
- Produces: `npm run test` runs Vitest once; all later tasks' `*.server.test.ts` files are picked up by `include: ["app/**/*.test.ts"]`. `vitest.setup.ts` pre-sets the env vars every later test relies on (`DATABASE_PATH=":memory:"`, `SESSION_SECRET`, `ENTRA_*`, `APP_BASE_URL`).

- [ ] **Step 1: Add Vitest as a dev dependency and a `test` script**

Edit `package.json`:
```json
{
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "@react-router/dev": "8.0.0",
    "@tailwindcss/vite": "^4.2.2",
    "@types/node": "^22",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.9.3",
    "vite": "^8.0.3",
    "vitest": "^4.1.9"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create the Vitest config and setup file**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `vitest.setup.ts`:
```ts
process.env.DATABASE_PATH = ":memory:";
process.env.SESSION_SECRET = "test-session-secret";
process.env.ENTRA_TENANT_ID = "test-tenant";
process.env.ENTRA_CLIENT_ID = "test-client";
process.env.ENTRA_CLIENT_SECRET = "test-secret";
process.env.ENTRA_ADMIN_GROUP_ID = "test-admin-group";
process.env.APP_BASE_URL = "https://app.example.com";
```

- [ ] **Step 3: Write a sanity test to prove the harness runs**

Create `app/lib/sanity.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("vitest harness", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm run test`
Expected: `1 passed` (the sanity test).

- [ ] **Step 5: Delete the sanity test and commit**

```bash
rm app/lib/sanity.test.ts
git add package.json package-lock.json vitest.config.ts vitest.setup.ts
git commit -m "chore: add Vitest test tooling"
```

---

### Task 2: SQLite data layer

**Files:**
- Create: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Tasks 5, 7, 8, 9, 10, 11):
  - `createDb(filePath: string): Database.Database`
  - `db: Database.Database` (singleton, reads `DATABASE_PATH` env var, default `./data/app.db`)
  - `type UserRecord = { id: string; email: string; name: string; isAdmin: boolean; lastLoginAt: string }`
  - `type DocumentStatus = "processing" | "ready" | "error"`
  - `type DocumentRecord = { id: string; title: string; description: string | null; pageCount: number; uploadedBy: string; createdAt: string; status: DocumentStatus; errorMessage: string | null }`
  - `upsertUser(conn, { id, email, name, isAdmin }): UserRecord`
  - `createDocument(conn, { id, title, description, uploadedBy }): DocumentRecord` (starts in `status: "processing"`)
  - `markDocumentReady(conn, id, pageCount): void`
  - `markDocumentError(conn, id, errorMessage): void`
  - `listReadyDocuments(conn): DocumentRecord[]`
  - `listAllDocuments(conn): DocumentRecord[]`
  - `getDocumentById(conn, id): DocumentRecord | undefined`

- [ ] **Step 1: Add `better-sqlite3`**

Edit `package.json` dependencies:
```json
"dependencies": {
  "@react-router/node": "8.0.0",
  "@react-router/serve": "8.0.0",
  "better-sqlite3": "^12.11.1",
  "isbot": "^5.1.36",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "react-router": "8.0.0"
}
```
Edit `package.json` devDependencies (add the type package):
```json
"@types/better-sqlite3": "^7.6.13",
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

Create `app/lib/db.server.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  createDb,
  createDocument,
  getDocumentById,
  listAllDocuments,
  listReadyDocuments,
  markDocumentError,
  markDocumentReady,
  upsertUser,
} from "./db.server";

describe("db.server", () => {
  const db = createDb(":memory:");

  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users;");
  });

  it("upserts a user, updating fields on repeat login", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: false });
    const updated = upsertUser(db, {
      id: "u1",
      email: "a@x.com",
      name: "Ana Updated",
      isAdmin: true,
    });

    expect(updated.name).toBe("Ana Updated");
    expect(updated.isAdmin).toBe(true);
  });

  it("creates a document in processing status and only lists it after marking ready", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    const doc = createDocument(db, {
      id: "d1",
      title: "Manual",
      description: null,
      uploadedBy: "u1",
    });

    expect(doc.status).toBe("processing");
    expect(listReadyDocuments(db)).toHaveLength(0);

    markDocumentReady(db, "d1", 5);
    const ready = listReadyDocuments(db);

    expect(ready).toHaveLength(1);
    expect(ready[0].pageCount).toBe(5);
    expect(ready[0].status).toBe("ready");
  });

  it("records an error message and keeps the document out of the ready list", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d2", title: "Roto", description: null, uploadedBy: "u1" });

    markDocumentError(db, "d2", "pdftoppm failed: corrupt file");
    const doc = getDocumentById(db, "d2");

    expect(doc?.status).toBe("error");
    expect(doc?.errorMessage).toBe("pdftoppm failed: corrupt file");
    expect(listReadyDocuments(db)).toHaveLength(0);
    expect(listAllDocuments(db)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- db.server`
Expected: FAIL — `Cannot find module './db.server'`.

- [ ] **Step 4: Implement `db.server.ts`**

Create `app/lib/db.server.ts`:
```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DocumentStatus = "processing" | "ready" | "error";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  lastLoginAt: string;
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
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  last_login_at: string;
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
}

export function createDb(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const conn = new Database(filePath);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT
    );
  `);
  return conn;
}

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
export const db = createDb(DATABASE_PATH);

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
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

export function createDocument(
  conn: Database.Database,
  doc: { id: string; title: string; description: string | null; uploadedBy: string },
): DocumentRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO documents (id, title, description, page_count, uploaded_by, created_at, status, error_message)
       VALUES (@id, @title, @description, 0, @uploadedBy, @createdAt, 'processing', NULL)`,
    )
    .run({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: doc.uploadedBy,
      createdAt: now,
    });

  return rowToDocument(
    conn.prepare("SELECT * FROM documents WHERE id = ?").get(doc.id) as DocumentRow,
  );
}

export function markDocumentReady(conn: Database.Database, id: string, pageCount: number): void {
  conn.prepare("UPDATE documents SET status = 'ready', page_count = ? WHERE id = ?").run(pageCount, id);
}

export function markDocumentError(conn: Database.Database, id: string, errorMessage: string): void {
  conn.prepare("UPDATE documents SET status = 'error', error_message = ? WHERE id = ?").run(errorMessage, id);
}

export function listReadyDocuments(conn: Database.Database): DocumentRecord[] {
  return (conn.prepare("SELECT * FROM documents WHERE status = 'ready' ORDER BY created_at DESC").all() as DocumentRow[]).map(
    rowToDocument,
  );
}

export function listAllDocuments(conn: Database.Database): DocumentRecord[] {
  return (conn.prepare("SELECT * FROM documents ORDER BY created_at DESC").all() as DocumentRow[]).map(rowToDocument);
}

export function getDocumentById(conn: Database.Database, id: string): DocumentRecord | undefined {
  const row = conn.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npm run test -- db.server`
Expected: 3 tests passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add SQLite data layer for users and documents"
```

---

### Task 3: Storage path helpers

**Files:**
- Create: `app/lib/storage.server.ts`
- Test: `app/lib/storage.server.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Tasks 4, 7, 11):
  - `documentDir(id: string): string`
  - `originalPdfPath(id: string): string`
  - `pagesDir(id: string): string`
  - `pageImagePath(id: string, pageNumber: number): string`
  - `ensureDocumentDirs(id: string): void`

All four path functions read `process.env.DOCUMENTS_DIR` **on every call** (not cached at module load), so tests can override it per-test.

- [ ] **Step 1: Write the failing test**

Create `app/lib/storage.server.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- storage.server`
Expected: FAIL — `Cannot find module './storage.server'`.

- [ ] **Step 3: Implement `storage.server.ts`**

Create `app/lib/storage.server.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test -- storage.server`
Expected: 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/storage.server.ts app/lib/storage.server.test.ts
git commit -m "feat: add disk storage path helpers for documents"
```

---

### Task 4: PDF → PNG conversion (Poppler)

**Files:**
- Create: `app/lib/pdf-convert.server.ts`
- Test: `app/lib/pdf-convert.server.test.ts`

**Interfaces:**
- Consumes: `pagesDir`, `originalPdfPath`, `ensureDocumentDirs` from `./storage.server` (Task 3).
- Produces (used by Task 7):
  - `class PdfConversionError extends Error`
  - `convertPdfToPages(documentId: string): Promise<number>` — runs `pdftoppm`, renames its output to `page-1.png ... page-N.png`, returns the page count, throws `PdfConversionError` on failure.
  - `isPdftoppmAvailable(): boolean` — used to skip the integration test (and could be used later for a startup health check) when Poppler isn't installed on the machine running the tests.

**Note on local dev:** Poppler is not installed on this Windows machine by default (verified: `pdftoppm` is not on `PATH`). The Docker image installs it (`apk add poppler-utils`, see Task 12), so the integration test below is written to skip itself when the binary is missing, rather than being a placeholder. To run it locally on Windows, install Poppler for Windows (e.g. via `choco install poppler`) and ensure `pdftoppm.exe` is on `PATH`.

- [ ] **Step 1: Add `pdf-lib` as a dev dependency (test fixtures only)**

Edit `package.json` devDependencies:
```json
"pdf-lib": "^1.17.1",
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

Create `app/lib/pdf-convert.server.test.ts`:
```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- pdf-convert.server`
Expected: FAIL — `Cannot find module './pdf-convert.server'`.

- [ ] **Step 4: Implement `pdf-convert.server.ts`**

Create `app/lib/pdf-convert.server.ts`:
```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npm run test -- pdf-convert.server`
Expected on this Windows machine (no Poppler installed): test suite **skipped** with the console warning printed — this is a pass, not a failure. Expected once run against the Docker image or a machine with Poppler installed: 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/lib/pdf-convert.server.ts app/lib/pdf-convert.server.test.ts
git commit -m "feat: convert PDFs to per-page PNGs via Poppler pdftoppm"
```

---

### Task 5: Auth (Azure AD / Entra ID OIDC + session)

**Files:**
- Create: `app/lib/auth.server.ts`
- Test: `app/lib/auth.server.test.ts`

**Interfaces:**
- Consumes: `db`, `upsertUser`, `UserRecord` from `./db.server` (Task 2).
- Produces (used by Tasks 6, 7, 8, 9, 10, 11):
  - `beginLogin(): Promise<{ url: URL; setCookieHeader: string }>`
  - `completeLogin(request: Request): Promise<{ user: UserRecord; setCookieHeader: string }>`
  - `getUserFromSession(request: Request): Promise<UserRecord | null>`
  - `requireUser(request: Request): Promise<UserRecord>` — throws a `redirect("/login")` `Response` if there's no session.
  - `requireAdmin(request: Request): Promise<UserRecord>` — throws a `data(message, 403)` if the user isn't an admin.
  - `destroyUserSession(request: Request): Promise<string>` — returns the `Set-Cookie` header value that clears the session.

- [ ] **Step 1: Add `openid-client`**

Edit `package.json` dependencies (add next to `react-router`):
```json
"openid-client": "^6.8.4",
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

Create `app/lib/auth.server.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import { db, upsertUser } from "./db.server";
import { requireAdmin, requireUser, sessionStorage } from "./auth.server";

async function cookieHeaderFor(userId: string): Promise<string> {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  const setCookie = await sessionStorage.commitSession(session);
  return setCookie.split(";")[0];
}

describe("requireUser / requireAdmin", () => {
  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users;");
  });

  it("redirects to /login when there is no session cookie", async () => {
    const request = new Request("https://app.example.com/documentos");

    await expect(requireUser(request)).rejects.toMatchObject({ status: 302 });
  });

  it("returns the user when the session cookie is valid", async () => {
    upsertUser(db, { id: "user-1", email: "a@b.com", name: "Ana", isAdmin: false });
    const cookie = await cookieHeaderFor("user-1");

    const request = new Request("https://app.example.com/documentos", {
      headers: { Cookie: cookie },
    });

    const result = await requireUser(request);
    expect(result.id).toBe("user-1");
  });

  it("throws a 403 from requireAdmin when the user is not an admin", async () => {
    upsertUser(db, { id: "user-2", email: "c@d.com", name: "Beto", isAdmin: false });
    const cookie = await cookieHeaderFor("user-2");

    const request = new Request("https://app.example.com/admin/upload", {
      headers: { Cookie: cookie },
    });

    await expect(requireAdmin(request)).rejects.toMatchObject({ init: { status: 403 } });
  });

  it("allows requireAdmin through when the user is an admin", async () => {
    upsertUser(db, { id: "user-3", email: "e@f.com", name: "Cami", isAdmin: true });
    const cookie = await cookieHeaderFor("user-3");

    const request = new Request("https://app.example.com/admin/upload", {
      headers: { Cookie: cookie },
    });

    const result = await requireAdmin(request);
    expect(result.isAdmin).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- auth.server`
Expected: FAIL — `Cannot find module './auth.server'`.

- [ ] **Step 4: Implement `auth.server.ts`**

Create `app/lib/auth.server.ts`:
```ts
import * as client from "openid-client";
import { createCookie, createCookieSessionStorage, data, redirect } from "react-router";
import { db, upsertUser, type UserRecord } from "./db.server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- OIDC configuration (Entra ID) ---

let oidcConfig: client.Configuration | null = null;

async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfig) return oidcConfig;

  const tenantId = requireEnv("ENTRA_TENANT_ID");
  const clientId = requireEnv("ENTRA_CLIENT_ID");
  const clientSecret = requireEnv("ENTRA_CLIENT_SECRET");

  oidcConfig = await client.discovery(
    new URL(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`),
    clientId,
    undefined,
    client.ClientSecretPost(clientSecret),
  );
  return oidcConfig;
}

function getRedirectUri(): string {
  return `${requireEnv("APP_BASE_URL")}/auth/callback`;
}

// --- Transient login handshake cookie (state + PKCE verifier) ---

interface OAuthHandshake {
  state: string;
  codeVerifier: string;
}

const oauthCookie = createCookie("__oauth", {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 600,
  secrets: [requireEnv("SESSION_SECRET")],
});

export async function beginLogin(): Promise<{ url: URL; setCookieHeader: string }> {
  const config = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: getRedirectUri(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const setCookieHeader = await oauthCookie.serialize({ state, codeVerifier } satisfies OAuthHandshake);
  return { url, setCookieHeader };
}

export async function completeLogin(
  request: Request,
): Promise<{ user: UserRecord; setCookieHeader: string }> {
  const handshake = (await oauthCookie.parse(request.headers.get("Cookie"))) as OAuthHandshake | null;
  if (!handshake) {
    throw new Error("Missing OAuth handshake cookie");
  }

  const config = await getOidcConfig();
  const tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
    pkceCodeVerifier: handshake.codeVerifier,
    expectedState: handshake.state,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new Error("ID token missing claims");
  }

  const adminGroupId = requireEnv("ENTRA_ADMIN_GROUP_ID");
  const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];

  const user = upsertUser(db, {
    id: String(claims.sub),
    email: String(claims.email ?? claims.preferred_username ?? ""),
    name: String(claims.name ?? ""),
    isAdmin: groups.includes(adminGroupId),
  });

  const session = await sessionStorage.getSession();
  session.set("userId", user.id);
  const setCookieHeader = await sessionStorage.commitSession(session);

  return { user, setCookieHeader };
}

// --- Long-lived app session ---

interface SessionData {
  userId: string;
}

export const sessionStorage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "__session",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    secrets: [requireEnv("SESSION_SECRET")],
  },
});

export async function getUserFromSession(request: Request): Promise<UserRecord | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId) return null;

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | { id: string; email: string; name: string; is_admin: number; last_login_at: string }
    | undefined;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
}

export async function requireUser(request: Request): Promise<UserRecord> {
  const user = await getUserFromSession(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

export async function requireAdmin(request: Request): Promise<UserRecord> {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw data("No tienes permiso para acceder a esta sección.", 403);
  }
  return user;
}

export async function destroyUserSession(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return sessionStorage.destroySession(session);
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npm run test -- auth.server`
Expected: 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/lib/auth.server.ts app/lib/auth.server.test.ts
git commit -m "feat: add Entra ID OIDC login and session auth helpers"
```

---

### Task 6: Login, callback, and logout routes

**Files:**
- Create: `app/routes/login.tsx`
- Create: `app/routes/auth-callback.tsx`
- Create: `app/routes/logout.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `beginLogin`, `completeLogin`, `destroyUserSession`, `requireUser` from `~/lib/auth.server` (Task 5).
- Produces: the `/login`, `/auth/callback`, `/logout` routes used by Tasks 9, 10, 12 for navigation links.

This task has no independent business logic beyond what Task 5 already unit-tests — it's route wiring. It's verified via typecheck plus the manual end-to-end check in Task 12 (real login against Entra ID requires real app registration credentials, which aren't available in an automated test).

- [ ] **Step 1: Create the login route**

Create `app/routes/login.tsx`:
```tsx
import { redirect } from "react-router";
import { beginLogin } from "~/lib/auth.server";
import type { Route } from "./+types/login";

export async function loader(_args: Route.LoaderArgs) {
  const { url, setCookieHeader } = await beginLogin();
  return redirect(url.toString(), {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LoginRoute() {
  return null;
}
```

- [ ] **Step 2: Create the callback route**

Create `app/routes/auth-callback.tsx`:
```tsx
import { redirect } from "react-router";
import { completeLogin } from "~/lib/auth.server";
import type { Route } from "./+types/auth-callback";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const { setCookieHeader } = await completeLogin(request);
    return redirect("/documentos", {
      headers: { "Set-Cookie": setCookieHeader },
    });
  } catch (error) {
    console.error("Login callback failed", error);
    return redirect("/login?error=1");
  }
}

export default function AuthCallbackRoute() {
  return null;
}
```

- [ ] **Step 3: Create the logout route**

Create `app/routes/logout.tsx`:
```tsx
import { Form, redirect } from "react-router";
import { destroyUserSession, requireUser } from "~/lib/auth.server";
import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const setCookieHeader = await destroyUserSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LogoutRoute() {
  return (
    <main className="mx-auto max-w-md p-8">
      <p className="mb-4">¿Seguro que quieres cerrar sesión?</p>
      <Form method="post">
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
          Cerrar sesión
        </button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 4: Register the routes**

Edit `app/routes.ts`:
```ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/login.tsx app/routes/auth-callback.tsx app/routes/logout.tsx app/routes.ts
git commit -m "feat: add login, Entra ID callback, and logout routes"
```

---

### Task 7: Admin upload route

**Files:**
- Create: `app/routes/admin-upload.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`~/lib/auth.server`, Task 5); `db`, `createDocument`, `markDocumentReady`, `markDocumentError` (`~/lib/db.server`, Task 2); `ensureDocumentDirs`, `originalPdfPath` (`~/lib/storage.server`, Task 3); `convertPdfToPages`, `PdfConversionError` (`~/lib/pdf-convert.server`, Task 4).
- Produces: the `/admin/upload` route used by Task 8's "Subir nuevo" link and Task 12's manual verification.

No independent unit test here — all the logic this route calls (`createDocument`, `convertPdfToPages`, etc.) is already covered in Tasks 2 and 4. This route is glue plus form validation, verified via typecheck and the manual upload check in Task 12.

- [ ] **Step 1: Create the route**

Create `app/routes/admin-upload.tsx`:
```tsx
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Form, data, redirect, useNavigation } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { createDocument, db, markDocumentError, markDocumentReady } from "~/lib/db.server";
import { PdfConversionError, convertPdfToPages } from "~/lib/pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "~/lib/storage.server";
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
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
  createDocument(db, { id: documentId, title, description, uploadedBy: user.id });

  try {
    const pageCount = await convertPdfToPages(documentId);
    markDocumentReady(db, documentId, pageCount);
  } catch (error) {
    const message =
      error instanceof PdfConversionError ? error.message : "Error desconocido al convertir el PDF.";
    markDocumentError(db, documentId, message);
    return redirect("/admin/documentos?error=conversion");
  }

  return redirect("/admin/documentos?success=1");
}

export default function AdminUpload({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Subir documento</h1>

      {actionData?.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{actionData.error}</p>
      )}

      <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Título
          <input type="text" name="title" required className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Descripción (opcional)
          <textarea name="description" className="rounded border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Archivo PDF
          <input type="file" name="file" accept="application/pdf" required className="rounded border p-2" />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Subiendo..." : "Subir"}
        </button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("admin/upload", "routes/admin-upload.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin-upload.tsx app/routes.ts
git commit -m "feat: add admin PDF upload route"
```

---

### Task 8: Admin documents list route

**Files:**
- Create: `app/routes/admin-documents-list.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`~/lib/auth.server`, Task 5); `db`, `listAllDocuments` (`~/lib/db.server`, Task 2).
- Produces: the `/admin/documentos` route.

- [ ] **Step 1: Create the route**

Create `app/routes/admin-documents-list.tsx`:
```tsx
import { Link } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const documents = listAllDocuments(db);
  return { documents };
}

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administrar documentos</h1>
        <Link to="/admin/upload" className="rounded bg-gray-900 px-4 py-2 text-white">
          Subir nuevo
        </Link>
      </div>

      <ul className="divide-y divide-gray-200">
        {documents.map((doc) => (
          <li key={doc.id} className="py-4">
            <p className="font-medium">{doc.title}</p>
            <p className="text-sm text-gray-500">
              Estado: {doc.status}
              {doc.status === "ready" && ` · ${doc.pageCount} páginas`}
            </p>
            {doc.status === "error" && <p className="text-sm text-red-600">{doc.errorMessage}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("admin/documentos", "routes/admin-documents-list.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin-documents-list.tsx app/routes.ts
git commit -m "feat: add admin documents list route"
```

---

### Task 9: Public documents list route

**Files:**
- Create: `app/routes/documents-list.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser` (`~/lib/auth.server`, Task 5); `db`, `listReadyDocuments` (`~/lib/db.server`, Task 2).
- Produces: the `/documentos` route, linked to by Task 12's home redirect and Task 10's viewer.

- [ ] **Step 1: Create the route**

Create `app/routes/documents-list.tsx`:
```tsx
import { Link } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments } from "~/lib/db.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const documents = listReadyDocuments(db);
  return { user, documents };
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents } = loaderData;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <div className="flex items-center gap-4 text-sm">
          <span>{user.name}</span>
          {user.isAdmin && (
            <Link to="/admin/documentos" className="underline">
              Panel admin
            </Link>
          )}
          <Link to="/logout" className="underline">
            Cerrar sesión
          </Link>
        </div>
      </div>

      {documents.length === 0 ? (
        <p>Todavía no hay documentos disponibles.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {documents.map((doc) => (
            <li key={doc.id} className="py-4">
              <Link to={`/documentos/${doc.id}`} className="text-lg font-medium underline">
                {doc.title}
              </Link>
              {doc.description && <p className="text-sm text-gray-600">{doc.description}</p>}
              <p className="text-xs text-gray-400">{doc.pageCount} páginas</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("documentos", "routes/documents-list.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/documents-list.tsx app/routes.ts
git commit -m "feat: add public documents list route"
```

---

### Task 10: Document viewer route (anti-copy)

**Files:**
- Create: `app/routes/document-viewer.tsx`
- Modify: `app/routes.ts`
- Modify: `app/app.css`

**Interfaces:**
- Consumes: `requireUser` (`~/lib/auth.server`, Task 5); `db`, `getDocumentById` (`~/lib/db.server`, Task 2).
- Produces: the `/documentos/:id` route. Requests page images from the `/documentos/:id/pagina/:n` route built in Task 11.

- [ ] **Step 1: Create the route**

Create `app/routes/document-viewer.tsx`:
```tsx
import { useEffect, useState } from "react";
import { data } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db, getDocumentById } from "~/lib/db.server";
import type { Route } from "./+types/document-viewer";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  return { document: doc };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  // Renamed to `pdfDocument`: destructuring as `document` would shadow the
  // global `document` object needed below for the keydown listener.
  const { document: pdfDocument } = loaderData;
  const [page, setPage] = useState(1);

  useEffect(() => {
    function blockShortcuts(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && (event.key === "p" || event.key === "s")) {
        event.preventDefault();
      }
    }
    document.addEventListener("keydown", blockShortcuts);
    return () => document.removeEventListener("keydown", blockShortcuts);
  }, []);

  return (
    <main
      className="mx-auto max-w-4xl select-none p-8 print:hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <h1 className="mb-4 text-xl font-semibold">{pdfDocument.title}</h1>

      <div className="mb-4 flex items-center gap-4">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <span>
          Página {page} de {pdfDocument.pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pdfDocument.pageCount}
          onClick={() => setPage((p) => Math.min(pdfDocument.pageCount, p + 1))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>

      <img
        src={`/documentos/${pdfDocument.id}/pagina/${page}`}
        alt={`Página ${page} de ${pdfDocument.title}`}
        draggable={false}
        className="w-full select-none border"
      />

      {page < pdfDocument.pageCount && (
        // Hidden prefetch: even with Cache-Control: no-store (required so
        // pages aren't left in a shared computer's disk cache), starting the
        // fetch for the next page ahead of time still shaves latency off the
        // "Siguiente" click, because it warms the in-flight/decoded-image
        // memory cache rather than the HTTP disk cache.
        <img
          src={`/documentos/${pdfDocument.id}/pagina/${page + 1}`}
          alt=""
          aria-hidden="true"
          className="hidden"
        />
      )}

      <p className="mt-4 text-xs text-gray-400">
        Este documento es de solo lectura. La descarga y la impresión están deshabilitadas.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("documentos/:id", "routes/document-viewer.tsx"),
```

- [ ] **Step 3: Add the print-blocking fallback to global CSS**

Edit `app/app.css`, append:
```css
@media print {
  body {
    display: none;
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/document-viewer.tsx app/routes.ts app/app.css
git commit -m "feat: add read-only document viewer with anti-copy measures"
```

---

### Task 11: Page image serving route

**Files:**
- Create: `app/routes/document-page-image.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser` (`~/lib/auth.server`, Task 5); `db`, `getDocumentById` (`~/lib/db.server`, Task 2); `pageImagePath` (`~/lib/storage.server`, Task 3).
- Produces: the `/documentos/:id/pagina/:n` resource route requested by Task 10's `<img>` tags.

This is a resource route (no default component export — it only ever returns a raw `Response`), which is a standard, documented React Router pattern.

- [ ] **Step 1: Create the route**

Create `app/routes/document-page-image.tsx`:
```tsx
import fs from "node:fs";
import { data } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db, getDocumentById } from "~/lib/db.server";
import { pageImagePath } from "~/lib/storage.server";
import type { Route } from "./+types/document-page-image";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  const pageNumber = Number(params.n);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.pageCount) {
    throw data("Página no encontrada", { status: 404 });
  }

  const filePath = pageImagePath(doc.id, pageNumber);
  if (!fs.existsSync(filePath)) {
    throw data("Página no encontrada", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("documentos/:id/pagina/:n", "routes/document-page-image.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/document-page-image.tsx app/routes.ts
git commit -m "feat: serve converted page images with no-store caching"
```

---

### Task 12: Home redirect, Docker packaging, and end-to-end verification

**Files:**
- Modify: `app/routes/home.tsx`
- Delete: `app/welcome/welcome.tsx`, `app/welcome/logo-dark.svg`, `app/welcome/logo-light.svg`
- Modify: `Dockerfile`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `getUserFromSession` (`~/lib/auth.server`, Task 5).
- Produces: a working `/` entry point and a Docker image that can actually run the app (Poppler installed, `/data` volume, env vars documented).

- [ ] **Step 1: Redirect `/` based on session state**

Edit `app/routes/home.tsx` (replace entirely):
```tsx
import { redirect } from "react-router";
import { getUserFromSession } from "~/lib/auth.server";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromSession(request);
  throw redirect(user ? "/documentos" : "/login");
}

export default function Home() {
  return null;
}
```

- [ ] **Step 2: Delete the now-unused template welcome screen**

```bash
rm app/welcome/welcome.tsx app/welcome/logo-dark.svg app/welcome/logo-light.svg
rmdir app/welcome
```

- [ ] **Step 3: Update the Dockerfile — install Poppler, build tools for `better-sqlite3`, and a `/data` volume**

Edit `Dockerfile` (replace entirely):
```dockerfile
FROM node:24-alpine AS development-dependencies-env
RUN apk add --no-cache python3 make g++
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
RUN apk add --no-cache python3 make g++
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache poppler-utils
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
VOLUME ["/data"]
ENV DATABASE_PATH=/data/app.db
ENV DOCUMENTS_DIR=/data/documents
CMD ["npm", "run", "start"]
```

- [ ] **Step 4: Document required environment variables**

Create `.env.example`:
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
```

- [ ] **Step 5: Keep local dev data out of git**

Edit `.gitignore`, append:
```
# Local SQLite DB and uploaded PDFs/page images
/data/
```

- [ ] **Step 6: Full test suite + typecheck + build**

Run: `npm run test`
Expected: all tests pass (Poppler-dependent test skipped locally, as noted in Task 4).

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Build and run the Docker image, then verify manually in a browser**

```bash
docker build -t pdf-viewer .
docker run --rm -p 3000:3000 \
  -v pdf-viewer-data:/data \
  -e ENTRA_TENANT_ID=<your-tenant-id> \
  -e ENTRA_CLIENT_ID=<your-client-id> \
  -e ENTRA_CLIENT_SECRET=<your-client-secret> \
  -e ENTRA_ADMIN_GROUP_ID=<your-admin-group-guid> \
  -e SESSION_SECRET=<random-long-string> \
  -e APP_BASE_URL=http://localhost:3000 \
  pdf-viewer
```

Manual checklist (from the spec's testing section):
- [ ] Visiting `http://localhost:3000/` with no session redirects to `/login`, which redirects to the Microsoft login page.
- [ ] Logging in with an account in the admin Entra ID group lands on `/documentos` and shows the "Panel admin" link.
- [ ] As that admin, `/admin/upload` accepts a PDF, and after submitting, `/admin/documentos` shows it with a page count and `status: ready`.
- [ ] Logging in with an account **not** in the admin group can see the document in `/documentos` and open it, but has no "Panel admin" link and gets a 403 if visiting `/admin/upload` directly.
- [ ] In the viewer, right-click is blocked, `Ctrl+P`/`Ctrl+S` are blocked, and there is no download button anywhere.
- [ ] Requesting `/documentos/<id>/pagina/<n>` directly without a session cookie (e.g. in an incognito window) redirects to `/login` rather than serving the image.

- [ ] **Step 8: Commit**

```bash
git add app/routes/home.tsx Dockerfile .env.example .gitignore
git commit -m "feat: wire home redirect, Docker packaging, and env documentation"
```

---

## Self-Review Notes

- **Spec coverage:** architecture/data model → Tasks 2–5; auth/routes → Tasks 5–6; upload/conversion → Tasks 4, 7; visor/anti-copy → Tasks 10–11; errores (documented in the spec's error table) → covered by `requireUser`/`requireAdmin` throws (Task 5), the 404s in Tasks 10–11, and the try/catch around conversion in Task 7; pruebas → Vitest units (Tasks 2–5) + manual/exploratory checklist (Task 12) matches the spec's stated scope (no load/pentest automation).
- **Type consistency checked:** `DocumentRecord`/`UserRecord` field names (`pageCount`, `isAdmin`, `errorMessage`, etc.) are defined once in Task 2 and reused verbatim in Tasks 7–11; `convertPdfToPages`/`PdfConversionError` names from Task 4 match their usage in Task 7; `requireUser`/`requireAdmin`/`getUserFromSession`/`destroyUserSession`/`beginLogin`/`completeLogin`/`sessionStorage` names from Task 5 match their usage in Tasks 6–11.
- **No placeholders:** every step has literal file contents or exact commands; the one deliberately-skipped test (Task 4, no local Poppler) is real conditional test code (`describe.skipIf`), not a TODO.
