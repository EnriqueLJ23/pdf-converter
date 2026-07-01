# Administración completa de documentos (borrar, editar, categorías) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin delete a document permanently, edit its title/description/category, and manage a predefined list of categories — all built on top of the already-restyled `AppShell`/`GlassPanel`/`Button` components.

**Architecture:** Pure additive extension of the existing SQLite schema (`categories` table + `documents.category_id`, both via the same auto-migration pattern already used in `createDb()`) plus two new admin routes (`admin/categorias`, `admin/documentos/:id`) and small edits to the two existing admin routes that need to link to them.

**Tech Stack:** React Router 8 (framework mode), `better-sqlite3` (already a dependency), Vitest.

## Global Constraints

- Categories are purely organizational — they do **not** change who can see a document. Any authenticated user still sees any `status = 'ready'` document regardless of category.
- A document belongs to exactly one category, or none (`category_id` is nullable).
- Deleting a category never fails because documents reference it: `ON DELETE SET NULL` on the `category_id` foreign key handles this at the database level, so those documents simply become uncategorized.
- Deleting a document is permanent: removes the SQLite row **and** the on-disk directory (`original.pdf` + `pages/`), via the already-existing `documentDir(id)` helper in `storage.server.ts`. No soft delete, no undo.
- Schema changes must be applied automatically on startup (the existing `createDb()` migration pattern: check `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` if missing) — the production database on the VM already has data and must upgrade itself on the next deploy, with no manual SQL step.
- `PRAGMA foreign_keys = ON` must be enabled in `createDb()` for `ON DELETE SET NULL` to actually take effect (it is not on by default in SQLite/better-sqlite3).
- Delete confirmation is a plain browser `confirm()` before submitting the form — no dedicated confirmation page.
- New routes must use the existing `AppShell`, `GlassPanel`, and `Button`/`ButtonLink` components (already built in the glassmorphism redesign) — do not introduce new visual patterns.
- No automated tests for the new route files (`admin-categorias.tsx`, `admin-document-edit.tsx`) — they are glue code over `db.server.ts` functions that are unit tested. Verification for routes is manual, in the browser.
- A route file that imports `./+types/<name>` will fail typecheck unless that route is already registered in `app/routes.ts` — every task that creates a route file must also register it in the same task, before running `npm run typecheck`.

---

### Task 1: Categories table and CRUD

**Files:**
- Modify: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Consumes: nothing new (extends the existing `createDb()`/`db` singleton).
- Produces (used by Tasks 3, 5):
  - `interface CategoryRecord { id: string; name: string; createdAt: string }`
  - `createCategory(conn, { id: string; name: string }): CategoryRecord`
  - `listCategories(conn): CategoryRecord[]` (alphabetical by name)
  - `deleteCategory(conn, id: string): void`

- [ ] **Step 1: Write the failing tests**

Edit `app/lib/db.server.test.ts` — update the import list and `beforeEach`, and add two new tests:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import {
  createCategory,
  createDb,
  createDocument,
  deleteCategory,
  getDocumentById,
  listAllDocuments,
  listCategories,
  listReadyDocuments,
  markDocumentError,
  markDocumentReady,
  upsertUser,
} from "./db.server";

describe("db.server", () => {
  const db = createDb(":memory:");

  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users; DELETE FROM categories;");
  });

  // ... keep the 3 existing tests unchanged ...

  it("creates and lists categories alphabetically", () => {
    createCategory(db, { id: "c2", name: "Recursos Humanos" });
    createCategory(db, { id: "c1", name: "Finanzas" });

    const categories = listCategories(db);

    expect(categories.map((c) => c.name)).toEqual(["Finanzas", "Recursos Humanos"]);
  });

  it("deletes a category", () => {
    createCategory(db, { id: "c1", name: "Finanzas" });
    deleteCategory(db, "c1");

    expect(listCategories(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test -- db.server`
Expected: FAIL — `createCategory`/`listCategories`/`deleteCategory` are not exported yet.

- [ ] **Step 3: Implement categories in `db.server.ts`**

Replace `app/lib/db.server.ts` entirely:
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

(This step only adds `categories` — it deliberately does not touch `documents`/`DocumentRecord` yet; that's Task 2.)

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm run test -- db.server`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add categories table and CRUD"
```

---

### Task 2: Document category assignment, metadata editing, and deletion

**Files:**
- Modify: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Consumes: `CategoryRecord`, `createCategory`, `deleteCategory` (Task 1).
- Produces (used by Tasks 3, 4, 5):
  - `DocumentRecord` gains `categoryId: string | null` and `categoryName: string | null`.
  - `createDocument(conn, { ..., categoryId?: string | null })` — `categoryId` is optional, defaults to `null`.
  - `updateDocumentMetadata(conn, id, { title: string; description: string | null; categoryId: string | null }): void`
  - `deleteDocumentRecord(conn, id: string): void`
  - `listReadyDocuments`, `listAllDocuments`, `getDocumentById` now all return the joined `categoryName`.

- [ ] **Step 1: Write the failing tests**

Edit `app/lib/db.server.test.ts` — update imports and add three new tests at the end of the `describe` block:
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
  markDocumentReady,
  updateDocumentMetadata,
  upsertUser,
} from "./db.server";

// ... keep describe/beforeEach and all 5 existing tests unchanged, add: ...

  it("stores a document's category and updates metadata", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createCategory(db, { id: "c1", name: "Finanzas" });
    createDocument(db, {
      id: "d1",
      title: "Nomina",
      description: null,
      uploadedBy: "u1",
      categoryId: "c1",
    });

    const doc = getDocumentById(db, "d1");
    expect(doc?.categoryId).toBe("c1");
    expect(doc?.categoryName).toBe("Finanzas");

    updateDocumentMetadata(db, "d1", {
      title: "Nomina 2026",
      description: "Actualizado",
      categoryId: null,
    });

    const updated = getDocumentById(db, "d1");
    expect(updated?.title).toBe("Nomina 2026");
    expect(updated?.description).toBe("Actualizado");
    expect(updated?.categoryId).toBeNull();
  });

  it("deletes a document record", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d1", title: "Temporal", description: null, uploadedBy: "u1" });

    deleteDocumentRecord(db, "d1");

    expect(getDocumentById(db, "d1")).toBeUndefined();
  });

  it("leaves a document without a category when its category is deleted", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createCategory(db, { id: "c1", name: "Finanzas" });
    createDocument(db, {
      id: "d1",
      title: "Nomina",
      description: null,
      uploadedBy: "u1",
      categoryId: "c1",
    });

    deleteCategory(db, "c1");

    expect(getDocumentById(db, "d1")?.categoryId).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test -- db.server`
Expected: FAIL — `categoryId`/`categoryName` are `undefined`, `updateDocumentMetadata`/`deleteDocumentRecord` are not exported.

- [ ] **Step 3: Implement category support and document CRUD in `db.server.ts`**

Replace `app/lib/db.server.ts` entirely:
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
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  const documentColumns = conn.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!documentColumns.some((col) => col.name === "category_id")) {
    conn.exec(
      "ALTER TABLE documents ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL",
    );
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
Expected: 8 tests passed.

- [ ] **Step 5: Run the full suite and typecheck to catch any other consumer of `DocumentRecord`/`createDocument`**

Run: `npm run test`
Expected: 13 passed, 1 skipped (Poppler-dependent test, unchanged).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add document category assignment, metadata editing, and deletion"
```

---

### Task 3: Categories management route

**Files:**
- Create: `app/routes/admin-categorias.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`~/lib/auth.server`); `createCategory`, `deleteCategory`, `listCategories`, `db` (Task 1); `AppShell`, `Button`, `GlassPanel` (already built by the redesign plan).
- Produces: the `/admin/categorias` route, linked to from Task 5's update to `admin-documents-list.tsx`.

- [ ] **Step 1: Create the route**

Create `app/routes/admin-categorias.tsx`:
```tsx
import { randomUUID } from "node:crypto";
import { Form, data } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { createCategory, db, deleteCategory, listCategories } from "~/lib/db.server";
import type { Route } from "./+types/admin-categorias";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const categories = listCategories(db);
  return { user, categories };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    deleteCategory(db, id);
    return null;
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return data({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  createCategory(db, { id: randomUUID(), name });
  return null;
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminCategorias({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories } = loaderData;

  return (
    <AppShell title="Categorías" user={user}>
      <GlassPanel className="mx-auto mb-6 max-w-xl p-6">
        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}
        <Form method="post" className="flex gap-3">
          <input type="hidden" name="intent" value="create" />
          <input
            type="text"
            name="name"
            placeholder="Nombre de la categoría"
            required
            className={`flex-1 ${inputClasses}`}
          />
          <Button type="submit">Crear</Button>
        </Form>
      </GlassPanel>

      <GlassPanel className="mx-auto max-w-xl divide-y divide-black/5 dark:divide-white/10">
        {categories.length === 0 ? (
          <p className="p-6 text-sm text-black/60 dark:text-white/50">Todavía no hay categorías.</p>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between px-6 py-4">
              <span className="font-medium tracking-tight">{category.name}</span>
              <Form
                method="post"
                onSubmit={(event) => {
                  if (
                    !confirm(
                      `¿Borrar la categoría "${category.name}"? Los documentos que la tengan quedarán sin categoría.`,
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={category.id} />
                <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                  Eliminar
                </Button>
              </Form>
            </div>
          ))
        )}
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array (anywhere after the `admin/documentos` entry):
```ts
route("admin/categorias", "routes/admin-categorias.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin-categorias.tsx app/routes.ts
git commit -m "feat: add category management route"
```

---

### Task 4: Document edit/delete route

**Files:**
- Create: `app/routes/admin-document-edit.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`~/lib/auth.server`); `db`, `deleteDocumentRecord`, `getDocumentById`, `listCategories`, `updateDocumentMetadata` (Tasks 1, 2); `documentDir` (`~/lib/storage.server`, already exists); `AppShell`, `Button`, `GlassPanel`.
- Produces: the `/admin/documentos/:id` route, linked to from Task 5's update to `admin-documents-list.tsx`.

- [ ] **Step 1: Create the route**

Create `app/routes/admin-document-edit.tsx`:
```tsx
import fs from "node:fs";
import { Form, data, redirect, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import {
  db,
  deleteDocumentRecord,
  getDocumentById,
  listCategories,
  updateDocumentMetadata,
} from "~/lib/db.server";
import { documentDir } from "~/lib/storage.server";
import type { Route } from "./+types/admin-document-edit";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAdmin(request);

  const document = getDocumentById(db, params.id);
  if (!document) {
    throw data("Documento no encontrado", { status: 404 });
  }

  const categories = listCategories(db);
  return { user, document, categories };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    deleteDocumentRecord(db, params.id);
    fs.rmSync(documentDir(params.id), { recursive: true, force: true });
    return redirect("/admin/documentos");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;

  if (!title) {
    return data({ error: "El título es obligatorio." }, { status: 400 });
  }

  updateDocumentMetadata(db, params.id, { title, description, categoryId });
  return redirect("/admin/documentos");
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminDocumentEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { user, document, categories } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell title="Editar documento" user={user} backTo="/admin/documentos">
      <GlassPanel className="mx-auto max-w-xl p-8">
        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="update" />
          <label className="flex flex-col gap-1 text-sm">
            Título
            <input type="text" name="title" defaultValue={document.title} required className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Descripción (opcional)
            <textarea name="description" defaultValue={document.description ?? ""} className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Categoría
            <select name="categoryId" defaultValue={document.categoryId ?? ""} className={inputClasses}>
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </Form>

        <Form
          method="post"
          className="mt-6 border-t border-black/5 pt-6 dark:border-white/10"
          onSubmit={(event) => {
            if (!confirm(`¿Borrar "${document.title}" permanentemente? Esta acción no se puede deshacer.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="secondary" className="w-full text-red-600 dark:text-red-400">
            Eliminar documento
          </Button>
        </Form>
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Register the route**

Edit `app/routes.ts`, add inside the array:
```ts
route("admin/documentos/:id", "routes/admin-document-edit.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin-document-edit.tsx app/routes.ts
git commit -m "feat: add document edit/delete route"
```

---

### Task 5: Wire category links and selectors into existing admin routes

**Files:**
- Modify: `app/routes/admin-documents-list.tsx`
- Modify: `app/routes/admin-upload.tsx`

**Interfaces:**
- Consumes: `listCategories`, `db` (Tasks 1–2); `Link` (`react-router`); routes from Tasks 3–4 (`/admin/categorias`, `/admin/documentos/:id`).
- Produces: nothing new for later tasks (leaf changes).

- [ ] **Step 1: Update `admin-documents-list.tsx` — link rows to the edit page, show category, add a link to manage categories**

Replace `app/routes/admin-documents-list.tsx` entirely:
```tsx
import { Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { ButtonLink } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const documents = listAllDocuments(db);
  return { user, documents };
}

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents } = loaderData;

  return (
    <AppShell title="Administrar documentos" user={user}>
      <div className="mb-6 flex justify-end gap-3">
        <ButtonLink to="/admin/categorias" variant="secondary">
          Categorías
        </ButtonLink>
        <ButtonLink to="/admin/upload">Subir nuevo</ButtonLink>
      </div>

      <GlassPanel className="divide-y divide-black/5 dark:divide-white/10">
        {documents.map((doc) => (
          <Link
            key={doc.id}
            to={`/admin/documentos/${doc.id}`}
            className="block px-6 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <p className="font-medium tracking-tight">{doc.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>
                {doc.status}
              </span>
              {doc.categoryName && (
                <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs font-medium text-accent-600 dark:text-accent-400">
                  {doc.categoryName}
                </span>
              )}
            </div>
            {doc.status === "ready" && (
              <p className="text-sm text-black/60 dark:text-white/50">{doc.pageCount} páginas</p>
            )}
            {doc.status === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">{doc.errorMessage}</p>
            )}
          </Link>
        ))}
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Update `admin-upload.tsx` — add a category selector**

Edit `app/routes/admin-upload.tsx`:

Replace the imports and `loader`:
```tsx
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Form, data, redirect, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { createDocument, db, listCategories, markDocumentError, markDocumentReady } from "~/lib/db.server";
import { PdfConversionError, convertPdfToPages } from "~/lib/pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "~/lib/storage.server";
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const categories = listCategories(db);
  return { user, categories };
}
```

Replace the `action` function's category handling — add `categoryId` extraction right after `description`, and pass it to `createDocument`:
```tsx
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
```

Replace the component to read `categories` from `loaderData` and add the `<select>`:
```tsx
const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminUpload({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell title="Subir documento" user={user}>
      <GlassPanel className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Subir documento</h1>

        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Título
            <input type="text" name="title" required className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Descripción (opcional)
            <textarea name="description" className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Categoría (opcional)
            <select name="categoryId" defaultValue="" className={inputClasses}>
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Archivo PDF
            <input type="file" name="file" accept="application/pdf" required className={inputClasses} />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Subiendo..." : "Subir"}
          </Button>
        </Form>
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin-documents-list.tsx app/routes/admin-upload.tsx
git commit -m "feat: link category management and selection into admin routes"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run test`
Expected: 13 passed, 1 skipped (unchanged from Task 2's expectation — no new automated tests were added for the route files, per the plan's constraints).

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual verification checklist (in a browser, `npm run dev`)**

- [ ] Go to `/admin/categorias`, create a category (e.g. "Finanzas"), confirm it appears in the list.
- [ ] Go to `/admin/upload`, upload a PDF assigning it to "Finanzas", confirm the category shows as a tag on `/admin/documentos`.
- [ ] Click the document row to open `/admin/documentos/:id`, change its title and category, save, confirm the change is reflected on `/admin/documentos`.
- [ ] Go back to `/admin/categorias`, delete "Finanzas", confirm the browser `confirm()` dialog appears, and after confirming, the document from the previous step now shows no category tag.
- [ ] Open the document's edit page again, click "Eliminar documento", confirm the browser `confirm()` dialog appears, and after confirming, the document is gone from `/admin/documentos` **and** from `/documentos` (public list) — and its folder no longer exists on disk (`/data/documents/<id>` in Docker, or `./data/documents/<id>` locally).

- [ ] **Step 4: Commit any fixes found during manual verification**

If Step 3 uncovers a bug, fix it and commit:
```bash
git add <changed files>
git commit -m "fix: <describe the fix>"
```

If nothing needed fixing, this task requires no additional commit.

---

## Self-Review Notes

- **Spec coverage:** categories CRUD → Task 1; document category assignment/metadata edit/delete + `ON DELETE SET NULL` cascade → Task 2; `admin/categorias` route → Task 3; `admin/documentos/:id` route → Task 4; wiring into the upload form and documents list → Task 5; manual verification of the full flow (create category → assign → edit → delete category → delete document, including disk cleanup) → Task 6.
- **Type consistency checked:** `CategoryRecord`/`DocumentRecord` field names (`categoryId`, `categoryName`, etc.) defined in Tasks 1–2 are used verbatim in Tasks 3–5; `createCategory`/`listCategories`/`deleteCategory`/`updateDocumentMetadata`/`deleteDocumentRecord` names match between their definition and every call site.
- **Route registration ordering:** each route-creation task (3, 4) registers its route in `app/routes.ts` in the same task, before typechecking — a route file importing `./+types/<name>` fails typecheck if that route isn't registered yet, since `react-router typegen` only generates types for registered routes.
- **No placeholders:** every step has literal file contents or exact commands.
