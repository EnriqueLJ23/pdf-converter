# Selector de idioma (Español / Japonés) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-document `language` field, a sidebar toggle that switches the whole app's UI between Spanish and Japanese, and filters `/documentos` to the selected language.

**Architecture:** A cookie (`lang`) holds the current UI/content language, read server-side by every route's own loader (same pattern as `requireUser`). A flat string-dictionary in `app/lib/i18n.ts` maps keys to translated strings for both languages. A resource route `POST /idioma` sets the cookie; React Router's automatic loader revalidation after an action re-renders everything in the new language with no manual reload. `documents.language` is a new SQLite column, migrated the same way `category_id` was.

**Tech Stack:** React Router 8 (framework mode), better-sqlite3, no new dependencies.

## Global Constraints

- No new npm dependencies (spec: custom dictionary, not a library).
- `admin/documentos` (admin's management list) must NOT filter by language — only its UI text translates.
- The language toggle's own option labels ("Español" / "日本語") are never run through the translation dictionary — they're fixed constants shown in their own language always.
- No DB `CHECK` constraint on `language` (matches existing `status`/`index_status` columns — validity enforced by the app, not SQLite).
- Existing documents default to `language = 'es'` via the column's SQL `DEFAULT`.
- `login.tsx`, `home.tsx`, `auth-callback.tsx`, `document-page-image.tsx` render no user-facing text (redirect-only loaders / raw image bytes) — out of scope, no changes.
- Spec: `docs/superpowers/specs/2026-07-02-language-toggle-design.md`.

---

### Task 1: Translation dictionary (`app/lib/i18n.ts`)

**Files:**
- Create: `app/lib/i18n.ts`
- Test: `app/lib/i18n.test.ts`

**Interfaces:**
- Produces: `type Language = "es" | "ja"`, `LANGUAGE_LABELS: Record<Language, string>`, `t(lang: Language, key: TranslationKey): string`, `type TranslationKey`. Every later task imports `Language`/`t`/`LANGUAGE_LABELS` from this file.

- [ ] **Step 1: Write the failing test**

Create `app/lib/i18n.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LANGUAGE_LABELS, t, translations } from "./i18n";

describe("i18n", () => {
  it("has the same set of keys for every language", () => {
    const esKeys = Object.keys(translations.es).sort();
    const jaKeys = Object.keys(translations.ja).sort();
    expect(jaKeys).toEqual(esKeys);
  });

  it("returns the translated string for a known key", () => {
    expect(t("es", "documents.title")).toBe("Documentos");
    expect(t("ja", "documents.title")).toBe("ドキュメント");
  });

  it("never translates the language switcher's own labels", () => {
    expect(LANGUAGE_LABELS.es).toBe("Español");
    expect(LANGUAGE_LABELS.ja).toBe("日本語");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/i18n.test.ts`
Expected: FAIL — `Cannot find module './i18n'`

- [ ] **Step 3: Write the implementation**

Create `app/lib/i18n.ts`:
```ts
export type Language = "es" | "ja";

export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  ja: "日本語",
};

export const translations = {
  es: {
    "nav.documents": "Documentos",
    "nav.adminSection": "Admin",
    "nav.upload": "Subir documento",
    "nav.manage": "Administrar documentos",
    "nav.categories": "Categorías",
    "nav.collapse": "Colapsar menú",
    "nav.expand": "Expandir menú",
    "nav.logout": "Cerrar sesión",
    "nav.themeToggle": "Cambiar tema",

    "common.back": "← Volver",
    "common.pageSingular": "página",
    "common.pagePlural": "páginas",
    "common.titleRequired": "El título es obligatorio.",

    "documents.title": "Documentos",
    "documents.searchPlaceholder": "Buscar por título, descripción o contenido...",
    "documents.emptyNoQuery": "Todavía no hay documentos disponibles.",
    "documents.emptyQuery": "No se encontraron documentos para «{query}».",

    "viewer.prevPage": "Página anterior",
    "viewer.nextPage": "Página siguiente",
    "viewer.pageIndicator": "Página {page} de {total}",
    "viewer.zoomOut": "Reducir zoom",
    "viewer.zoomIn": "Aumentar zoom",
    "viewer.resetZoom": "Restablecer zoom",
    "viewer.notFound": "Documento no encontrado",

    "upload.pageTitle": "Subir documento",
    "upload.titleLabel": "Título",
    "upload.descriptionLabel": "Descripción (opcional)",
    "upload.categoryLabel": "Categoría (opcional)",
    "upload.noCategory": "Sin categoría",
    "upload.languageLabel": "Idioma",
    "upload.fileLabel": "Archivo PDF",
    "upload.submit": "Subir",
    "upload.submitting": "Subiendo...",
    "upload.fileRequired": "Selecciona un archivo PDF.",
    "upload.fileTooLarge": "El archivo excede el tamaño máximo permitido.",
    "upload.invalidPdf": "El archivo no es un PDF válido.",
    "upload.folderTitle": "Subir carpeta como categoría",
    "upload.folderDescription":
      "Selecciona una carpeta con archivos PDF. El nombre de la carpeta se usará como categoría y cada PDF dentro se subirá con esa categoría automáticamente.",
    "upload.folderLabel": "Carpeta",
    "upload.folderSummary": "{count} archivo(s) PDF en la carpeta {folder}.",
    "upload.folderSubmit": "Subir carpeta",
    "upload.folderRequired": "Selecciona una carpeta con al menos un archivo PDF.",
    "upload.folderAllFailed": "No se pudo subir ningún archivo PDF de la carpeta.",

    "edit.pageTitle": "Editar documento",
    "edit.save": "Guardar cambios",
    "edit.saving": "Guardando...",
    "edit.deleteDocument": "Eliminar documento",
    "edit.deleteConfirm": '¿Borrar "{title}" permanentemente? Esta acción no se puede deshacer.',

    "categories.pageTitle": "Categorías",
    "categories.namePlaceholder": "Nombre de la categoría",
    "categories.create": "Crear",
    "categories.empty": "Todavía no hay categorías.",
    "categories.delete": "Eliminar",
    "categories.deleteConfirm":
      '¿Borrar la categoría "{name}"? Los documentos que la tengan quedarán sin categoría.',
    "categories.nameRequired": "El nombre es obligatorio.",

    "adminList.pageTitle": "Administrar documentos",
    "adminList.statusReady": "Listo",
    "adminList.statusProcessing": "Procesando",
    "adminList.statusError": "Error",

    "logout.confirm": "¿Seguro que quieres cerrar sesión?",
  },
  ja: {
    "nav.documents": "ドキュメント",
    "nav.adminSection": "管理者",
    "nav.upload": "文書をアップロード",
    "nav.manage": "文書を管理",
    "nav.categories": "カテゴリ",
    "nav.collapse": "メニューを折りたたむ",
    "nav.expand": "メニューを展開",
    "nav.logout": "ログアウト",
    "nav.themeToggle": "テーマを切り替える",

    "common.back": "← 戻る",
    "common.pageSingular": "ページ",
    "common.pagePlural": "ページ",
    "common.titleRequired": "タイトルは必須です。",

    "documents.title": "ドキュメント",
    "documents.searchPlaceholder": "タイトル、説明、内容で検索...",
    "documents.emptyNoQuery": "まだ利用可能な文書はありません。",
    "documents.emptyQuery": "「{query}」に一致する文書が見つかりませんでした。",

    "viewer.prevPage": "前のページ",
    "viewer.nextPage": "次のページ",
    "viewer.pageIndicator": "ページ {page} / {total}",
    "viewer.zoomOut": "縮小",
    "viewer.zoomIn": "拡大",
    "viewer.resetZoom": "ズームをリセット",
    "viewer.notFound": "文書が見つかりません",

    "upload.pageTitle": "文書をアップロード",
    "upload.titleLabel": "タイトル",
    "upload.descriptionLabel": "説明（任意）",
    "upload.categoryLabel": "カテゴリ（任意）",
    "upload.noCategory": "カテゴリなし",
    "upload.languageLabel": "言語",
    "upload.fileLabel": "PDFファイル",
    "upload.submit": "アップロード",
    "upload.submitting": "アップロード中...",
    "upload.fileRequired": "PDFファイルを選択してください。",
    "upload.fileTooLarge": "ファイルが許容される最大サイズを超えています。",
    "upload.invalidPdf": "ファイルは有効なPDFではありません。",
    "upload.folderTitle": "フォルダをカテゴリとしてアップロード",
    "upload.folderDescription":
      "PDFファイルが入ったフォルダを選択してください。フォルダ名がカテゴリとして使用され、中の各PDFに自動的にそのカテゴリが設定されます。",
    "upload.folderLabel": "フォルダ",
    "upload.folderSummary": "フォルダ「{folder}」内に{count}件のPDFファイル。",
    "upload.folderSubmit": "フォルダをアップロード",
    "upload.folderRequired": "少なくとも1つのPDFファイルを含むフォルダを選択してください。",
    "upload.folderAllFailed": "フォルダ内のPDFファイルを1つもアップロードできませんでした。",

    "edit.pageTitle": "文書を編集",
    "edit.save": "変更を保存",
    "edit.saving": "保存中...",
    "edit.deleteDocument": "文書を削除",
    "edit.deleteConfirm": "「{title}」を完全に削除しますか？この操作は取り消せません。",

    "categories.pageTitle": "カテゴリ",
    "categories.namePlaceholder": "カテゴリ名",
    "categories.create": "作成",
    "categories.empty": "まだカテゴリがありません。",
    "categories.delete": "削除",
    "categories.deleteConfirm": "カテゴリ「{name}」を削除しますか？このカテゴリの文書はカテゴリなしになります。",
    "categories.nameRequired": "名前は必須です。",

    "adminList.pageTitle": "文書を管理",
    "adminList.statusReady": "準備完了",
    "adminList.statusProcessing": "処理中",
    "adminList.statusError": "エラー",

    "logout.confirm": "本当にログアウトしますか？",
  },
} as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)["es"];

export function t(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/i18n.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/i18n.ts app/lib/i18n.test.ts
git commit -m "feat: add i18n translation dictionary for ES/JA"
```

---

### Task 2: Language cookie (`app/lib/language.server.ts`)

**Files:**
- Create: `app/lib/language.server.ts`
- Test: `app/lib/language.server.test.ts`

**Interfaces:**
- Consumes: `Language` from `app/lib/i18n.ts` (Task 1).
- Produces: `languageCookie` (react-router `Cookie`), `getLanguage(request: Request): Promise<Language>`, `serializeLanguage(language: Language): Promise<string>`. Used by every route loader and by the `/idioma` action (Task 5).

- [ ] **Step 1: Write the failing test**

Create `app/lib/language.server.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getLanguage, languageCookie, serializeLanguage } from "./language.server";

function requestWithCookie(cookieHeader: string | null): Request {
  const headers = new Headers();
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  return new Request("http://localhost/", { headers });
}

describe("language.server", () => {
  it("defaults to Spanish when there's no cookie", async () => {
    expect(await getLanguage(requestWithCookie(null))).toBe("es");
  });

  it("defaults to Spanish on a garbage cookie value", async () => {
    const bad = await languageCookie.serialize("not-a-real-language");
    const cookieHeader = bad.split(";")[0];
    expect(await getLanguage(requestWithCookie(cookieHeader))).toBe("es");
  });

  it("reads back a valid ja cookie", async () => {
    const set = await serializeLanguage("ja");
    const cookieHeader = set.split(";")[0];
    expect(await getLanguage(requestWithCookie(cookieHeader))).toBe("ja");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/language.server.test.ts`
Expected: FAIL — `Cannot find module './language.server'`

- [ ] **Step 3: Write the implementation**

Create `app/lib/language.server.ts`:
```ts
import { createCookie } from "react-router";
import type { Language } from "./i18n";

export const languageCookie = createCookie("lang", {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
});

export async function getLanguage(request: Request): Promise<Language> {
  const value = await languageCookie.parse(request.headers.get("Cookie"));
  return value === "ja" ? "ja" : "es";
}

export async function serializeLanguage(language: Language): Promise<string> {
  return languageCookie.serialize(language);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/language.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/language.server.ts app/lib/language.server.test.ts
git commit -m "feat: add language cookie resolution helper"
```

---

### Task 3: `documents.language` column + query filtering (`app/lib/db.server.ts`)

**Files:**
- Modify: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Consumes: `type Language` from `app/lib/i18n.ts` (Task 1).
- Produces: `DocumentRecord.language: Language`; `createDocument(conn, { ..., language?: Language })` (defaults to `"es"`); `updateDocumentMetadata(conn, id, { title, description, categoryId, language })` (language now required); `listReadyDocuments(conn, language?: Language)`; `searchReadyDocuments(conn, query, language?: Language)`; `suggestReadyDocuments(conn, query, limit?, language?: Language)`.

- [ ] **Step 1: Write the failing tests**

In `app/lib/db.server.test.ts`, first fix the one existing call site that will break once `language` becomes a required field of `updateDocumentMetadata`'s second argument. Find this test (`"stores a document's category and updates metadata"`):
```ts
    updateDocumentMetadata(db, "d1", {
      title: "Nomina 2026",
      description: "Actualizado",
      categoryId: null,
    });
```
and replace it with:
```ts
    updateDocumentMetadata(db, "d1", {
      title: "Nomina 2026",
      description: "Actualizado",
      categoryId: null,
      language: "es",
    });
```

Then add the import and three new tests. Change the import block at the top:
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
```
(no change needed here — same functions, new params). Add these tests at the end of the `describe("db.server", ...)` block, right before the final closing `});`:
```ts
  it("defaults a new document's language to Spanish", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    const doc = createDocument(db, { id: "d1", title: "Sin idioma", description: null, uploadedBy: "u1" });

    expect(doc.language).toBe("es");
  });

  it("stores an explicit document language and updates it", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d1", title: "Nihongo", description: null, uploadedBy: "u1", language: "ja" });

    expect(getDocumentById(db, "d1")?.language).toBe("ja");

    updateDocumentMetadata(db, "d1", { title: "Nihongo", description: null, categoryId: null, language: "es" });

    expect(getDocumentById(db, "d1")?.language).toBe("es");
  });

  it("filters ready and search results by language", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d1", title: "Documento ES", description: null, uploadedBy: "u1", language: "es" });
    createDocument(db, { id: "d2", title: "日本語文書", description: null, uploadedBy: "u1", language: "ja" });
    markDocumentReady(db, "d1", 1);
    markDocumentReady(db, "d2", 1);
    syncDocumentFts(db, "d1");
    syncDocumentFts(db, "d2");
    markDocumentIndexed(db, "d1", { extractedText: "contenido en español", keywords: ["prueba"] });
    markDocumentIndexed(db, "d2", { extractedText: "日本語のコンテンツ", keywords: ["prueba"] });
    syncDocumentFts(db, "d1");
    syncDocumentFts(db, "d2");

    expect(listReadyDocuments(db).map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    expect(listReadyDocuments(db, "es").map((d) => d.id)).toEqual(["d1"]);
    expect(listReadyDocuments(db, "ja").map((d) => d.id)).toEqual(["d2"]);

    expect(searchReadyDocuments(db, "prueba", "es").map((d) => d.id)).toEqual(["d1"]);
    expect(searchReadyDocuments(db, "prueba", "ja").map((d) => d.id)).toEqual(["d2"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/db.server.test.ts`
Expected: FAIL — `doc.language` is `undefined`, `updateDocumentMetadata` type error (missing `language`), filtering tests fail because `listReadyDocuments`/`searchReadyDocuments` don't accept a language argument yet.

- [ ] **Step 3: Write the implementation**

In `app/lib/db.server.ts`, add the import at the top (after existing imports):
```ts
import type { Language } from "./i18n";
```

In the `DocumentRow` interface, add a field:
```ts
  index_status: IndexStatus;
  keywords: string | null;
  language: string;
}
```
(replacing the closing `keywords: string | null;\n}` block with the version above that adds `language`).

In `DocumentRecord`, add a field right after `keywords: string[];`:
```ts
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
  language: Language;
}
```

In `createDb()`, add `language TEXT NOT NULL DEFAULT 'es'` to the `CREATE TABLE IF NOT EXISTS documents` block (after `index_status TEXT NOT NULL DEFAULT 'pending'`):
```sql
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
      index_status TEXT NOT NULL DEFAULT 'pending',
      language TEXT NOT NULL DEFAULT 'es'
    );
```
And add the migration guard right after the `index_status` one:
```ts
  if (!existingColumnNames.has("index_status")) {
    conn.exec("ALTER TABLE documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!existingColumnNames.has("language")) {
    conn.exec("ALTER TABLE documents ADD COLUMN language TEXT NOT NULL DEFAULT 'es'");
  }
```

In `rowToDocument`, add the field:
```ts
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
    language: row.language === "ja" ? "ja" : "es",
  };
}
```

Replace `createDocument`'s signature and body:
```ts
export function createDocument(
  conn: Database.Database,
  doc: {
    id: string;
    title: string;
    description: string | null;
    uploadedBy: string;
    categoryId?: string | null;
    language?: Language;
  },
): DocumentRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO documents (id, title, description, page_count, uploaded_by, created_at, status, error_message, category_id, language)
       VALUES (@id, @title, @description, 0, @uploadedBy, @createdAt, 'processing', NULL, @categoryId, @language)`,
    )
    .run({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: doc.uploadedBy,
      createdAt: now,
      categoryId: doc.categoryId ?? null,
      language: doc.language ?? "es",
    });

  return rowToDocument(
    conn.prepare(`${DOCUMENT_SELECT} WHERE documents.id = ?`).get(doc.id) as DocumentRow,
  );
}
```

Replace `updateDocumentMetadata`:
```ts
export function updateDocumentMetadata(
  conn: Database.Database,
  id: string,
  metadata: { title: string; description: string | null; categoryId: string | null; language: Language },
): void {
  conn
    .prepare("UPDATE documents SET title = ?, description = ?, category_id = ?, language = ? WHERE id = ?")
    .run(metadata.title, metadata.description, metadata.categoryId, metadata.language, id);
}
```

Replace `listReadyDocuments`:
```ts
export function listReadyDocuments(conn: Database.Database, language?: Language): DocumentRecord[] {
  const sql = language
    ? `${DOCUMENT_SELECT} WHERE documents.status = 'ready' AND documents.language = ? ORDER BY documents.created_at DESC`
    : `${DOCUMENT_SELECT} WHERE documents.status = 'ready' ORDER BY documents.created_at DESC`;
  const rows = (language ? conn.prepare(sql).all(language) : conn.prepare(sql).all()) as DocumentRow[];
  return rows.map(rowToDocument);
}
```

Replace `searchReadyDocuments`:
```ts
export function searchReadyDocuments(
  conn: Database.Database,
  query: string,
  language?: Language,
): DocumentRecord[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const sql = `SELECT documents.*, categories.name AS category_name
       FROM documents_fts
       JOIN documents ON documents.id = documents_fts.document_id
       LEFT JOIN categories ON categories.id = documents.category_id
       WHERE documents_fts MATCH ? AND documents.status = 'ready'${
         language ? " AND documents.language = ?" : ""
       }
       ORDER BY bm25(documents_fts)`;
  const rows = (
    language ? conn.prepare(sql).all(ftsQuery, language) : conn.prepare(sql).all(ftsQuery)
  ) as DocumentRow[];
  return rows.map(rowToDocument);
}
```

Replace `suggestReadyDocuments`:
```ts
export function suggestReadyDocuments(
  conn: Database.Database,
  query: string,
  limit = 8,
  language?: Language,
): DocumentSuggestion[] {
  const like = `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`;
  const sql = `SELECT documents.id AS id, documents.title AS title, categories.name AS category_name
       FROM documents
       LEFT JOIN categories ON categories.id = documents.category_id
       WHERE documents.status = 'ready' AND documents.title LIKE ? ESCAPE '\\'${
         language ? " AND documents.language = ?" : ""
       }
       ORDER BY documents.title ASC
       LIMIT ?`;
  const rows = (
    language ? conn.prepare(sql).all(like, language, limit) : conn.prepare(sql).all(like, limit)
  ) as { id: string; title: string; category_name: string | null }[];
  return rows.map((row) => ({ id: row.id, title: row.title, categoryName: row.category_name }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/db.server.test.ts`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors (this will surface any other call site still missing the new required `language` field on `updateDocumentMetadata` — there should be none yet, since `admin-document-edit.tsx` is updated in Task 10)

- [ ] **Step 6: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add documents.language column and language filtering"
```

---

### Task 4: Root loader + `<html lang>` (`app/root.tsx`)

**Files:**
- Modify: `app/root.tsx`

**Interfaces:**
- Consumes: `getLanguage` from `app/lib/language.server.ts` (Task 2).

- [ ] **Step 1: Add the loader and use it in `Layout`**

Replace the top of `app/root.tsx`:
```tsx
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/root";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  return { language: await getLanguage(request) };
}

export const links: Route.LinksFunction = () => [
```
(keep the rest of the `links` array unchanged).

Replace the `Layout` function's opening:
```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData<typeof loader>("root");
  const language = rootData?.language ?? "es";

  return (
    <html lang={language}>
```
(keep everything else in `Layout` — the `<head>`, theme script, `<body>` — unchanged).

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

Run `npx react-router dev`, visit `/login` (or any page), view source / inspect element: `<html lang="es">` should be present.

- [ ] **Step 4: Commit**

```bash
git add app/root.tsx
git commit -m "feat: resolve html lang from the language cookie"
```

---

### Task 5: `/idioma` resource route + registration

**Files:**
- Create: `app/routes/set-language.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `languageCookie` from `app/lib/language.server.ts` (Task 2).
- Produces: `POST /idioma` — accepts form field `language` (`"es"|"ja"`), responds with `Set-Cookie`, no body. Consumed by the sidebar toggle in Task 6.

- [ ] **Step 1: Create the resource route**

Create `app/routes/set-language.tsx`:
```tsx
import { data } from "react-router";
import { languageCookie } from "~/lib/language.server";
import type { Route } from "./+types/set-language";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const language = formData.get("language") === "ja" ? "ja" : "es";
  return data(null, {
    headers: { "Set-Cookie": await languageCookie.serialize(language) },
  });
}
```

- [ ] **Step 2: Register the route**

In `app/routes.ts`, add the route (after the `documentos/sugerencias` line):
```ts
  route("documentos", "routes/documents-list.tsx"),
  route("documentos/sugerencias", "routes/documentos-sugerencias.tsx"),
  route("idioma", "routes/set-language.tsx"),
  route("documentos/:id", "routes/document-viewer.tsx"),
```

- [ ] **Step 3: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run `npx react-router dev`. With `curl -i -X POST -d "language=ja" http://localhost:3000/idioma`, confirm the response has `Set-Cookie: lang=ja...`.

- [ ] **Step 5: Commit**

```bash
git add app/routes/set-language.tsx app/routes.ts
git commit -m "feat: add POST /idioma resource route to set the language cookie"
```

---

### Task 6: Sidebar language toggle + translated nav (`app/components/AppShell.tsx`)

**Files:**
- Modify: `app/components/AppShell.tsx`

**Interfaces:**
- Consumes: `Language`, `LANGUAGE_LABELS`, `t` from `app/lib/i18n.ts` (Task 1); posts to `/idioma` (Task 5).
- Produces: `AppShell` now requires a `language: Language` prop. **Every route that renders `<AppShell>` must be updated to pass it** (Tasks 7–13 each do this for their own route).

- [ ] **Step 1: Add the language prop, toggle component, and translate nav labels**

Replace the top of `app/components/AppShell.tsx` (imports + component signature):
```tsx
import { useEffect, useState } from "react";
import {
  FileText,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useFetcher } from "react-router";
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINK_CLASSES =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-black/70 transition-colors hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5";

function LanguageToggle({ language }: { language: Language }) {
  const fetcher = useFetcher();

  function selectLanguage(next: Language) {
    fetcher.submit({ language: next }, { method: "post", action: "/idioma" });
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-black/10 p-0.5 text-xs dark:border-white/10">
      {(["es", "ja"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => selectLanguage(option)}
          aria-pressed={language === option}
          className={`rounded-full px-2 py-1 transition-colors ${
            language === option
              ? "bg-accent-500 text-white"
              : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
          }`}
        >
          {LANGUAGE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

export function AppShell({
  user,
  language,
  children,
}: {
  user?: { name: string; isAdmin: boolean };
  language: Language;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
```
(keep the rest of the function body — `useEffect`, `toggleCollapsed` — unchanged).

- [ ] **Step 2: Translate the nav labels and aria-labels**

Within the same file, replace each hardcoded string with its translated equivalent (exact text matches shown so you can locate them):

- `{!collapsed && (<span className="text-lg font-semibold tracking-tight">Documentos</span>)}` → replace `Documentos` with `{t(language, "nav.documents")}`
- `aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}` → `aria-label={collapsed ? t(language, "nav.expand") : t(language, "nav.collapse")}`
- `title="Documentos"` (on the `/documentos` Link) and the `<span>Documentos</span>` inside it → both become `t(language, "nav.documents")`
- `<span className="px-3 text-xs ...">Admin</span>` → `{t(language, "nav.adminSection")}`
- `title="Subir documento"` and `<span>Subir documento</span>` → `t(language, "nav.upload")`
- `title="Administrar documentos"` and `<span>Administrar documentos</span>` → `t(language, "nav.manage")`
- `title="Categorías"` and `<span>Categorías</span>` → `t(language, "nav.categories")`
- `aria-label="Cerrar sesión"` and `title="Cerrar sesión"` on the logout `Link` → `t(language, "nav.logout")`

- [ ] **Step 3: Render the toggle next to `ThemeToggle`**

Replace the footer block:
```tsx
        {user && (
          <div className="flex flex-col gap-2 border-t border-black/5 p-3 dark:border-white/10">
            {!collapsed && (
              <span className="truncate px-1 text-sm text-black/60 dark:text-white/50">
                {user.name}
              </span>
            )}
            {!collapsed && <LanguageToggle language={language} />}
            <div
              className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}
            >
              <ThemeToggle />
              <Link
                to="/logout"
                aria-label={t(language, "nav.logout")}
                title={t(language, "nav.logout")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/70 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
              >
                <LogOut size={16} />
              </Link>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Also translate `ThemeToggle`'s aria-label**

`app/components/ThemeToggle.tsx` has no loader access, so pass the label as a prop instead. Modify `app/components/ThemeToggle.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ label }: { label: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/70 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
```
And in `AppShell.tsx`, change `<ThemeToggle />` to `<ThemeToggle label={t(language, "nav.themeToggle")} />`.

- [ ] **Step 5: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: errors at every call site of `<AppShell>` (missing required `language` prop) and possibly at `<ThemeToggle />` usages elsewhere — this is expected; Tasks 7–13 fix each one. Confirm the errors are exactly "Property 'language' is missing" in each route file, nothing else.

- [ ] **Step 6: Commit**

```bash
git add app/components/AppShell.tsx app/components/ThemeToggle.tsx
git commit -m "feat: add sidebar language toggle and translate nav labels"
```

---

### Task 7: `/documentos` — filtering + translation (`app/routes/documents-list.tsx`)

**Files:**
- Modify: `app/routes/documents-list.tsx`

**Interfaces:**
- Consumes: `getLanguage` (Task 2), `t`/`Language` (Task 1), `listReadyDocuments(db, language)`/`searchReadyDocuments(db, query, language)` (Task 3), `AppShell` now needs `language` prop (Task 6).

- [ ] **Step 1: Update the loader**

Replace:
```ts
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query) : listReadyDocuments(db);
  return { user, documents, query };
}
```
with:
```ts
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const language = await getLanguage(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query, language) : listReadyDocuments(db, language);
  return { user, documents, query, language };
}
```
Add the import at the top:
```ts
import { getLanguage } from "~/lib/language.server";
import { t } from "~/lib/i18n";
```

- [ ] **Step 2: Wire language into the component**

In `export default function DocumentsList({ loaderData }: Route.ComponentProps)`, change the destructure to:
```ts
  const { user, documents, query, language } = loaderData;
```
Change `<AppShell user={user}>` to `<AppShell user={user} language={language}>`.

- [ ] **Step 3: Translate the JSX**

Replace `<h1 className="mb-6 text-2xl font-semibold tracking-tight">Documentos</h1>` with:
```tsx
<h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "documents.title")}</h1>
```

Replace the search input's placeholder:
```tsx
placeholder="Buscar por título, descripción o contenido..."
```
with:
```tsx
placeholder={t(language, "documents.searchPlaceholder")}
```

Replace the empty-state block:
```tsx
      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">
          {query ? `No se encontraron documentos para «${query}».` : "Todavía no hay documentos disponibles."}
        </p>
      ) : (
```
with:
```tsx
      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">
          {query
            ? t(language, "documents.emptyQuery").replace("{query}", query)
            : t(language, "documents.emptyNoQuery")}
        </p>
      ) : (
```

Replace the page-count line:
```tsx
              <p className="mt-auto pt-2 text-xs text-black/40 dark:text-white/30">
                {doc.pageCount} página{doc.pageCount === 1 ? "" : "s"}
              </p>
```
with:
```tsx
              <p className="mt-auto pt-2 text-xs text-black/40 dark:text-white/30">
                {doc.pageCount}{" "}
                {doc.pageCount === 1 ? t(language, "common.pageSingular") : t(language, "common.pagePlural")}
              </p>
```

- [ ] **Step 4: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 5: Commit**

```bash
git add app/routes/documents-list.tsx
git commit -m "feat: filter /documentos by language and translate its UI"
```

---

### Task 8: Autocomplete filtering (`app/routes/documentos-sugerencias.tsx`)

**Files:**
- Modify: `app/routes/documentos-sugerencias.tsx`

**Interfaces:**
- Consumes: `getLanguage` (Task 2), `suggestReadyDocuments(db, query, limit, language)` (Task 3).

- [ ] **Step 1: Filter suggestions by language**

Replace the full file:
```tsx
import { requireUser } from "~/lib/auth.server";
import { db, suggestReadyDocuments } from "~/lib/db.server";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/documentos-sugerencias";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const language = await getLanguage(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return { suggestions: [] };
  return { suggestions: suggestReadyDocuments(db, query, 8, language) };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

With the dev server running and a seeded session cookie (see prior verification in this session for the pattern), confirm `curl .../documentos/sugerencias?q=...` only returns documents matching the current `lang` cookie.

- [ ] **Step 4: Commit**

```bash
git add app/routes/documentos-sugerencias.tsx
git commit -m "feat: filter document autocomplete suggestions by language"
```

---

### Task 9: Document viewer translation (`app/routes/document-viewer.tsx`)

**Files:**
- Modify: `app/routes/document-viewer.tsx`

**Interfaces:**
- Consumes: `getLanguage` (Task 2), `t`/`Language` (Task 1), `AppShell` needs `language` (Task 6).

- [ ] **Step 1: Update the loader**

Replace:
```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  return { user, document: doc };
}
```
with:
```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const language = await getLanguage(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data(t(language, "viewer.notFound"), { status: 404 });
  }

  return { user, document: doc, language };
}
```
Add imports:
```ts
import { getLanguage } from "~/lib/language.server";
import { t } from "~/lib/i18n";
```

- [ ] **Step 2: Wire language into the component**

Change:
```ts
  const { user, document: pdfDocument } = loaderData;
```
to:
```ts
  const { user, document: pdfDocument, language } = loaderData;
```
Change `<AppShell user={user}>` to `<AppShell user={user} language={language}>`.

- [ ] **Step 3: Translate JSX**

Replace `← Volver` (the back link text) with `{t(language, "common.back")}`.

Replace:
```tsx
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                className={toolbarButtonClasses}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-black/60 dark:text-white/50">
                Página {page} de {pdfDocument.pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pdfDocument.pageCount}
                onClick={() =>
                  setPage((p) => Math.min(pdfDocument.pageCount, p + 1))
                }
                aria-label="Página siguiente"
                className={toolbarButtonClasses}
              >
                <ChevronRight size={18} />
              </button>
```
with:
```tsx
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label={t(language, "viewer.prevPage")}
                className={toolbarButtonClasses}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-black/60 dark:text-white/50">
                {t(language, "viewer.pageIndicator")
                  .replace("{page}", String(page))
                  .replace("{total}", String(pdfDocument.pageCount))}
              </span>
              <button
                type="button"
                disabled={page >= pdfDocument.pageCount}
                onClick={() =>
                  setPage((p) => Math.min(pdfDocument.pageCount, p + 1))
                }
                aria-label={t(language, "viewer.nextPage")}
                className={toolbarButtonClasses}
              >
                <ChevronRight size={18} />
              </button>
```

Replace the zoom controls:
```tsx
              <button
                type="button"
                disabled={zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
                }
                aria-label="Reducir zoom"
                className={toolbarButtonClasses}
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title="Restablecer zoom"
                className="w-14 text-center text-sm text-black/60 hover:text-black dark:text-white/50 dark:hover:text-white"
              >
                {zoom}%
              </button>
              <button
                type="button"
                disabled={zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
                }
                aria-label="Aumentar zoom"
                className={toolbarButtonClasses}
              >
                <Plus size={18} />
              </button>
```
with:
```tsx
              <button
                type="button"
                disabled={zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
                }
                aria-label={t(language, "viewer.zoomOut")}
                className={toolbarButtonClasses}
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title={t(language, "viewer.resetZoom")}
                className="w-14 text-center text-sm text-black/60 hover:text-black dark:text-white/50 dark:hover:text-white"
              >
                {zoom}%
              </button>
              <button
                type="button"
                disabled={zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
                }
                aria-label={t(language, "viewer.zoomIn")}
                className={toolbarButtonClasses}
              >
                <Plus size={18} />
              </button>
```

- [ ] **Step 4: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 5: Commit**

```bash
git add app/routes/document-viewer.tsx
git commit -m "feat: translate the document viewer UI"
```

---

### Task 10: Upload forms — language field + translation (`app/routes/admin-upload.tsx`)

**Files:**
- Modify: `app/routes/admin-upload.tsx`

**Interfaces:**
- Consumes: `getLanguage`/`t`/`Language`/`LANGUAGE_LABELS` (Tasks 1–2), `createDocument(..., language)` (Task 3), `AppShell` needs `language` (Task 6).
- Produces: `storeAndConvertPdf(..., language: Language)` — its new final parameter.

- [ ] **Step 1: Add imports**

At the top of `app/routes/admin-upload.tsx`, add:
```ts
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
```

- [ ] **Step 2: Update the loader**

Replace:
```ts
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const categories = listCategories(db);
  return { user, categories };
}
```
with:
```ts
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);
  const categories = listCategories(db);
  return { user, categories, language };
}
```

- [ ] **Step 3: Thread `language` through `storeAndConvertPdf`**

Replace:
```ts
async function storeAndConvertPdf(
  userId: string,
  fileBytes: Buffer,
  title: string,
  description: string | null,
  categoryId: string | null,
) {
  const documentId = randomUUID();
  ensureDocumentDirs(documentId);
  fs.writeFileSync(originalPdfPath(documentId), fileBytes);
  createDocument(db, { id: documentId, title, description, uploadedBy: userId, categoryId });
  syncDocumentFts(db, documentId);
```
with:
```ts
async function storeAndConvertPdf(
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
```
(rest of the function body — the try/catch conversion + indexing call — stays the same).

- [ ] **Step 4: Update the action**

Replace the start of `action` through the folder-branch's two `storeAndConvertPdf` call sites and error messages:
```ts
export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const uiLang = await getLanguage(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "file");
  const docLanguage: Language = formData.get("language") === "ja" ? "ja" : "es";

  if (intent === "folder") {
    // Files come from the folder-picker input, whose onChange renames each
    // File to its full relative path ("CarpetaSeleccionada/sub/archivo.pdf")
    // so that path survives the multipart upload — browsers otherwise only
    // send the bare filename, dropping the directory structure.
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return data({ error: t(uiLang, "upload.folderRequired") }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    for (const file of files) {
      const segments = file.name.split("/").filter(Boolean);
      const folderName = segments.length > 1 ? segments[0] : null;
      const baseName = segments[segments.length - 1] ?? file.name;
      const title = baseName.replace(/\.pdf$/i, "");

      if (file.size > MAX_UPLOAD_BYTES) {
        skipped++;
        continue;
      }
      const fileBytes = Buffer.from(await file.arrayBuffer());
      if (fileBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        skipped++;
        continue;
      }

      const categoryId = folderName ? findOrCreateCategoryByName(db, folderName).id : null;
      const result = await storeAndConvertPdf(user.id, fileBytes, title, null, categoryId, docLanguage);
      if (result.ok) {
        created++;
      } else {
        skipped++;
      }
    }

    if (created === 0) {
      return data({ error: t(uiLang, "upload.folderAllFailed") }, { status: 400 });
    }
    return redirect(`/admin/documentos?success=1&count=${created}${skipped ? `&skipped=${skipped}` : ""}`);
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const file = formData.get("file");

  if (!title) {
    return data({ error: t(uiLang, "common.titleRequired") }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return data({ error: t(uiLang, "upload.fileRequired") }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return data({ error: t(uiLang, "upload.fileTooLarge") }, { status: 400 });
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());
  if (fileBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return data({ error: t(uiLang, "upload.invalidPdf") }, { status: 400 });
  }

  const result = await storeAndConvertPdf(user.id, fileBytes, title, description, categoryId, docLanguage);
  if (!result.ok) {
    return redirect("/admin/documentos?error=conversion");
  }

  return redirect("/admin/documentos?success=1");
}
```

- [ ] **Step 5: Update the component**

Change the destructure and `AppShell` usage:
```ts
  const { user, categories, language } = loaderData;
```
```tsx
    <AppShell user={user} language={language}>
```

Translate the single-file form. Replace:
```tsx
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Subir documento</h1>
```
with:
```tsx
        <h1 className="mb-6 text-xl font-semibold tracking-tight">{t(language, "upload.pageTitle")}</h1>
```

Replace the form body:
```tsx
        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="file" />
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
```
with:
```tsx
        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="file" />
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.titleLabel")}
            <input type="text" name="title" required className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.descriptionLabel")}
            <textarea name="description" className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.categoryLabel")}
            <select name="categoryId" defaultValue="" className={inputClasses}>
              <option value="">{t(language, "upload.noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.languageLabel")}
            <select name="language" defaultValue="es" className={inputClasses}>
              <option value="es">{LANGUAGE_LABELS.es}</option>
              <option value="ja">{LANGUAGE_LABELS.ja}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.fileLabel")}
            <input type="file" name="file" accept="application/pdf" required className={inputClasses} />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t(language, "upload.submitting") : t(language, "upload.submit")}
          </Button>
        </Form>
```

Translate the folder-upload form. Replace:
```tsx
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Subir carpeta como categoría</h2>
        <p className="mb-6 text-sm text-black/60 dark:text-white/50">
          Selecciona una carpeta con archivos PDF. El nombre de la carpeta se usará como categoría
          y cada PDF dentro se subirá con esa categoría automáticamente.
        </p>

        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="folder" />
          <label className="flex flex-col gap-1 text-sm">
            Carpeta
            <input
              ref={folderInputRef}
              type="file"
              name="files"
              multiple
              required
              onChange={handleFolderChange}
              className={inputClasses}
              {...{ webkitdirectory: "", directory: "" }}
            />
          </label>
          {folderFileCount > 0 && (
            <p className="text-sm text-black/60 dark:text-white/50">
              {folderFileCount} archivo{folderFileCount === 1 ? "" : "s"} PDF en la carpeta
              {folderName ? ` "${folderName}"` : ""}.
            </p>
          )}
          <Button type="submit" disabled={isSubmitting || folderFileCount === 0}>
            {isSubmitting ? "Subiendo..." : "Subir carpeta"}
          </Button>
        </Form>
```
with:
```tsx
        <h2 className="mb-1 text-xl font-semibold tracking-tight">{t(language, "upload.folderTitle")}</h2>
        <p className="mb-6 text-sm text-black/60 dark:text-white/50">{t(language, "upload.folderDescription")}</p>

        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="folder" />
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.folderLabel")}
            <input
              ref={folderInputRef}
              type="file"
              name="files"
              multiple
              required
              onChange={handleFolderChange}
              className={inputClasses}
              {...{ webkitdirectory: "", directory: "" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.languageLabel")}
            <select name="language" defaultValue="es" className={inputClasses}>
              <option value="es">{LANGUAGE_LABELS.es}</option>
              <option value="ja">{LANGUAGE_LABELS.ja}</option>
            </select>
          </label>
          {folderFileCount > 0 && (
            <p className="text-sm text-black/60 dark:text-white/50">
              {t(language, "upload.folderSummary")
                .replace("{count}", String(folderFileCount))
                .replace("{folder}", folderName || "")}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting || folderFileCount === 0}>
            {isSubmitting ? t(language, "upload.submitting") : t(language, "upload.folderSubmit")}
          </Button>
        </Form>
```

- [ ] **Step 6: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 7: Manual verification**

Repeat the folder-upload smoke test used earlier in this session (Node `fetch`-based `FormData` POST to `/admin/upload` with `intent=folder`, two files under `CarpetaPrueba/...`, now also including a `language` field) against an isolated scratch DB — confirm the created documents have `language` set as expected in `db.server.ts`'s `getDocumentById`.

- [ ] **Step 8: Commit**

```bash
git add app/routes/admin-upload.tsx
git commit -m "feat: add language selector to upload forms and translate them"
```

---

### Task 11: Document edit — language field + translation (`app/routes/admin-document-edit.tsx`)

**Files:**
- Modify: `app/routes/admin-document-edit.tsx`

**Interfaces:**
- Consumes: `getLanguage`/`t`/`Language`/`LANGUAGE_LABELS` (Tasks 1–2), `updateDocumentMetadata(..., language)` (Task 3), `AppShell` needs `language` (Task 6).

- [ ] **Step 1: Add imports and update the loader**

Add imports:
```ts
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
```
Replace the loader:
```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);

  const document = getDocumentById(db, params.id);
  if (!document) {
    throw data(t(language, "viewer.notFound"), { status: 404 });
  }

  const categories = listCategories(db);
  return { user, document, categories, language };
}
```

- [ ] **Step 2: Update the action**

Replace:
```ts
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
```
with:
```ts
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const uiLang = await getLanguage(request);
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
  const docLanguage = formData.get("language") === "ja" ? "ja" : "es";

  if (!title) {
    return data({ error: t(uiLang, "common.titleRequired") }, { status: 400 });
  }

  updateDocumentMetadata(db, params.id, { title, description, categoryId, language: docLanguage });
  return redirect("/admin/documentos");
}
```

- [ ] **Step 3: Update the component**

Replace:
```tsx
  const { user, document, categories } = loaderData;
```
with:
```tsx
  const { user, document, categories, language } = loaderData;
```
Change `<AppShell user={user}>` to `<AppShell user={user} language={language}>`.

Replace:
```tsx
      <Link
        to="/admin/documentos"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        ← Volver
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Editar documento</h1>
```
with:
```tsx
      <Link
        to="/admin/documentos"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        {t(language, "common.back")}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "edit.pageTitle")}</h1>
```

Replace the form body:
```tsx
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
```
with:
```tsx
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="update" />
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.titleLabel")}
            <input type="text" name="title" defaultValue={document.title} required className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.descriptionLabel")}
            <textarea name="description" defaultValue={document.description ?? ""} className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.categoryLabel")}
            <select name="categoryId" defaultValue={document.categoryId ?? ""} className={inputClasses}>
              <option value="">{t(language, "upload.noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.languageLabel")}
            <select name="language" defaultValue={document.language} className={inputClasses}>
              <option value="es">{LANGUAGE_LABELS.es}</option>
              <option value="ja">{LANGUAGE_LABELS.ja}</option>
            </select>
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t(language, "edit.saving") : t(language, "edit.save")}
          </Button>
        </Form>

        <Form
          method="post"
          className="mt-6 border-t border-black/5 pt-6 dark:border-white/10"
          onSubmit={(event) => {
            if (!confirm(t(language, "edit.deleteConfirm").replace("{title}", document.title))) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="secondary" className="w-full text-red-600 dark:text-red-400">
            {t(language, "edit.deleteDocument")}
          </Button>
        </Form>
```

- [ ] **Step 4: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin-document-edit.tsx
git commit -m "feat: add language selector to document edit and translate it"
```

---

### Task 12: Admin document list translation (`app/routes/admin-documents-list.tsx`)

**Files:**
- Modify: `app/routes/admin-documents-list.tsx`

**Interfaces:**
- Consumes: `getLanguage`/`t` (Tasks 1–2), `AppShell` needs `language` (Task 6). Deliberately does **not** filter by language (spec decision).

- [ ] **Step 1: Replace the whole file**

```tsx
import { Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import { t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);
  const documents = listAllDocuments(db);
  return { user, documents, language };
}

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABEL_KEY: Record<string, "adminList.statusReady" | "adminList.statusProcessing" | "adminList.statusError"> = {
  ready: "adminList.statusReady",
  processing: "adminList.statusProcessing",
  error: "adminList.statusError",
};

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents, language } = loaderData;

  return (
    <AppShell user={user} language={language}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "adminList.pageTitle")}</h1>

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
                {t(language, STATUS_LABEL_KEY[doc.status])}
              </span>
              {doc.categoryName && (
                <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs font-medium text-accent-600 dark:text-accent-400">
                  {doc.categoryName}
                </span>
              )}
            </div>
            {doc.status === "ready" && (
              <p className="text-sm text-black/60 dark:text-white/50">
                {doc.pageCount}{" "}
                {doc.pageCount === 1 ? t(language, "common.pageSingular") : t(language, "common.pagePlural")}
              </p>
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

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-documents-list.tsx
git commit -m "feat: translate admin document list UI"
```

---

### Task 13: Categories page translation (`app/routes/admin-categorias.tsx`)

**Files:**
- Modify: `app/routes/admin-categorias.tsx`

**Interfaces:**
- Consumes: `getLanguage`/`t` (Tasks 1–2), `AppShell` needs `language` (Task 6).

- [ ] **Step 1: Replace the whole file**

```tsx
import { randomUUID } from "node:crypto";
import { Form, data } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { createCategory, db, deleteCategory, listCategories } from "~/lib/db.server";
import { t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/admin-categorias";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);
  const categories = listCategories(db);
  return { user, categories, language };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const uiLang = await getLanguage(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    deleteCategory(db, id);
    return null;
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return data({ error: t(uiLang, "categories.nameRequired") }, { status: 400 });
  }
  createCategory(db, { id: randomUUID(), name });
  return null;
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminCategorias({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories, language } = loaderData;

  return (
    <AppShell user={user} language={language}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "categories.pageTitle")}</h1>

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
            placeholder={t(language, "categories.namePlaceholder")}
            required
            className={`flex-1 ${inputClasses}`}
          />
          <Button type="submit">{t(language, "categories.create")}</Button>
        </Form>
      </GlassPanel>

      <GlassPanel className="mx-auto max-w-xl divide-y divide-black/5 dark:divide-white/10">
        {categories.length === 0 ? (
          <p className="p-6 text-sm text-black/60 dark:text-white/50">{t(language, "categories.empty")}</p>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between px-6 py-4">
              <span className="font-medium tracking-tight">{category.name}</span>
              <Form
                method="post"
                onSubmit={(event) => {
                  if (!confirm(t(language, "categories.deleteConfirm").replace("{name}", category.name))) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={category.id} />
                <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                  {t(language, "categories.delete")}
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

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors remaining for this file

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-categorias.tsx
git commit -m "feat: translate categories admin UI"
```

---

### Task 14: Logout page translation (`app/routes/logout.tsx`)

**Files:**
- Modify: `app/routes/logout.tsx`

**Interfaces:**
- Consumes: `getLanguage`/`t` (Tasks 1–2). Does not use `AppShell` (standalone centered card, unchanged).

- [ ] **Step 1: Replace the whole file**

```tsx
import { Form, redirect } from "react-router";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { destroyUserSession, requireUser } from "~/lib/auth.server";
import { t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const language = await getLanguage(request);
  return { language };
}

export async function action({ request }: Route.ActionArgs) {
  const setCookieHeader = await destroyUserSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LogoutRoute({ loaderData }: Route.ComponentProps) {
  const { language } = loaderData;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <GlassPanel className="w-full max-w-sm p-8 text-center">
        <p className="mb-6 text-black/70 dark:text-white/70">{t(language, "logout.confirm")}</p>
        <Form method="post">
          <Button type="submit" className="w-full">
            {t(language, "nav.logout")}
          </Button>
        </Form>
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors anywhere in the project now — this is the last file consuming `AppShell`/`t`, so this is the point where the whole app should compile clean.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new ones from Tasks 1–3.

- [ ] **Step 4: Commit**

```bash
git add app/routes/logout.tsx
git commit -m "feat: translate logout confirmation page"
```

---

### Task 15: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Seed a scratch environment**

Reuse the pattern from this session's earlier verification: an isolated `DATABASE_PATH`/`DOCUMENTS_DIR` (never the real `data/app.db`), a script seeding a user + a Spanish document + a Japanese document, and a signed session cookie via `sessionStorage.commitSession`.

- [ ] **Step 2: Verify the toggle switches UI language**

With the seeded cookie, `curl` (or a browser) `/documentos` with no `lang` cookie — page should be in Spanish. `POST /idioma` with `language=ja`, then re-fetch `/documentos` sending the returned `Set-Cookie` back — the page (including `<html lang="ja">`) should now be in Japanese, and the document list should show only the Japanese-language seeded document.

- [ ] **Step 3: Verify admin pages translate but don't filter**

With the `lang=ja` cookie, fetch `/admin/documentos` — UI text should be in Japanese, but **both** the Spanish and Japanese seeded documents should appear in the list.

- [ ] **Step 4: Verify upload assigns language**

POST to `/admin/upload` with `intent=file`, a valid PDF, and `language=ja` — confirm the created document's `language` is `"ja"` via `getDocumentById`.

- [ ] **Step 5: Clean up**

Stop the scratch dev server process; the real `data/app.db` was never touched (isolated `DATABASE_PATH` throughout), so no cleanup needed there.

---

## Self-Review Notes

- **Spec coverage:** every "Incluido" bullet in the spec maps to a task — data model (Task 3), cookie (Task 2), sidebar toggle (Task 6), dictionary (Task 1), translation of every page (Tasks 6–14), filtering of `/documentos` + autocomplete (Tasks 7–8), migration with default `'es'` (Task 3), upload/edit language selects (Tasks 10–11). The "fuera de alcance" bullets (`admin/documentos` filtering, auto-detection, dual-language docs, per-user persistence, complex interpolation) are respected — Task 12 explicitly does not filter.
- **Type consistency:** `Language` is defined once (Task 1) and imported everywhere else; `AppShell`'s `language` prop name and `t(lang, key)` signature are identical in every task; `createDocument`'s `language` stays optional (back-compat with existing tests), `updateDocumentMetadata`'s stays required — its one pre-existing call site in `db.server.test.ts` is fixed in Task 3 Step 1, and its one route call site (`admin-document-edit.tsx`) is updated in Task 11.
- **No placeholders:** every step shows literal before/after code, not descriptions of changes.
