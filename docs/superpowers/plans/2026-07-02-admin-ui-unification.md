# Unificación de la UI de administración Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `admin/upload` and `admin/categorias` into `admin/documentos`, which becomes the single admin hub — a file-explorer-style grid of documents grouped by category, with a drag-and-drop upload dialog and inline category creation/deletion/assignment.

**Architecture:** `admin-documents-list.tsx` gains one action with an `intent`-based dispatch (`upload` | `createCategory` | `deleteCategory` | `assignCategory`), replacing the three separate route files. A new `DocumentUploadForm` client component collects files from either click-to-browse or drag-and-drop (including recursive folder walking via `webkitGetAsEntry`) into a single hidden file input, so the server-side upload logic barely changes from today's folder-upload branch. A native `<dialog>` hosts that form. Category sections and document cards reuse the existing card visual language from `/documentos` via a new shared `DocumentThumbnail` component.

**Tech Stack:** React Router 8 (framework mode), native HTML `<dialog>`, native drag-and-drop + `webkitGetAsEntry`/`FileSystemDirectoryReader`, no new dependencies.

## Global Constraints

- No new npm dependencies.
- `admin/documentos/:id` (the full edit page) is unchanged — it stays the place to edit title/description/language/delete; the new inline category `<select>` on each card is a fast-path, not a replacement.
- `/documentos` (non-admin) behavior is unchanged except for the `DocumentThumbnail` extraction (purely visual, zero behavior change).
- Category bulk-assignment is out of scope — assignment is one document at a time via its card's `<select>`.
- Renaming an existing category is out of scope (unchanged from today: create/delete only).
- Spec: `docs/superpowers/specs/2026-07-02-admin-ui-unification-design.md`.

---

### Task 1: `updateDocumentCategory` in `db.server.ts`

**Files:**
- Modify: `app/lib/db.server.ts`
- Test: `app/lib/db.server.test.ts`

**Interfaces:**
- Produces: `updateDocumentCategory(conn: Database.Database, id: string, categoryId: string | null): void`. Used by Task 7's `assignCategory` action branch.

- [ ] **Step 1: Write the failing test**

In `app/lib/db.server.test.ts`, add `updateDocumentCategory` to the import list at the top:
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
  updateDocumentCategory,
  updateDocumentMetadata,
  upsertUser,
} from "./db.server";
```

Add this test at the end of the `describe("db.server", ...)` block, right before its closing `});`:
```ts
  it("reassigns a document's category without touching other fields", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createCategory(db, { id: "c1", name: "Finanzas" });
    createCategory(db, { id: "c2", name: "RH" });
    createDocument(db, {
      id: "d1",
      title: "Nomina",
      description: "desc",
      uploadedBy: "u1",
      categoryId: "c1",
    });

    updateDocumentCategory(db, "d1", "c2");

    const doc = getDocumentById(db, "d1");
    expect(doc?.categoryId).toBe("c2");
    expect(doc?.title).toBe("Nomina");
    expect(doc?.description).toBe("desc");

    updateDocumentCategory(db, "d1", null);
    expect(getDocumentById(db, "d1")?.categoryId).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/db.server.test.ts`
Expected: FAIL — `updateDocumentCategory is not a function` (or a TS import error)

- [ ] **Step 3: Write the implementation**

In `app/lib/db.server.ts`, add this function right after `updateDocumentMetadata` (which ends around line 284):
```ts
export function updateDocumentCategory(conn: Database.Database, id: string, categoryId: string | null): void {
  conn.prepare("UPDATE documents SET category_id = ? WHERE id = ?").run(categoryId, id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/db.server.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts
git commit -m "feat: add updateDocumentCategory for inline category reassignment"
```

---

### Task 2: Extract upload logic into `app/lib/upload-document.server.ts`

**Files:**
- Create: `app/lib/upload-document.server.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES: number`, `storeAndConvertPdf(userId, fileBytes, title, description, categoryId, language): Promise<{ ok: boolean }>`. Used by Task 7's unified `upload` action branch. (`admin-upload.tsx` keeps its own copy for now — it's deleted wholesale in Task 9, so it's not worth editing first.)

- [ ] **Step 1: Create the file**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no new errors (this file isn't imported anywhere yet)

- [ ] **Step 3: Commit**

```bash
git add app/lib/upload-document.server.ts
git commit -m "feat: extract storeAndConvertPdf into a shared server module"
```

---

### Task 3: Update the i18n dictionary

**Files:**
- Modify: `app/lib/i18n.ts`

**Interfaces:**
- Produces new keys: `adminList.addDocument`, `adminList.editDocument`, `adminList.assignCategoryAriaLabel`, `adminList.deleteCategoryAriaLabel`, `upload.dropHint`, `upload.orText`, `upload.chooseFiles`, `upload.chooseFolder`, `upload.filesSummary`, `upload.filesSummaryFolder`, `upload.noFilesSelected`, `upload.uploadAllFailed`, `upload.cancel`. Removes now-dead keys: `nav.upload`, `nav.categories`, `categories.pageTitle`, `categories.empty`, `upload.pageTitle`, `upload.folderTitle`, `upload.folderDescription`, `upload.folderLabel`, `upload.folderSummary`, `upload.folderSubmit`, `upload.folderRequired`, `upload.folderAllFailed`, `upload.fileLabel`, `upload.submit`, `upload.fileRequired`, `upload.fileTooLarge`, `upload.invalidPdf`.

- [ ] **Step 1: Replace the whole `translations` object**

Replace the `export const translations = { ... } as const satisfies ...` block in `app/lib/i18n.ts` (everything between `export const translations = {` and the line `} as const satisfies Record<Language, Record<string, string>>;`) with:

```ts
export const translations = {
  es: {
    "nav.documents": "Documentos",
    "nav.adminSection": "Admin",
    "nav.manage": "Administrar documentos",
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

    "upload.titleLabel": "Título",
    "upload.descriptionLabel": "Descripción (opcional)",
    "upload.categoryLabel": "Categoría (opcional)",
    "upload.noCategory": "Sin categoría",
    "upload.languageLabel": "Idioma",
    "upload.submitting": "Subiendo...",
    "upload.dropHint": "Arrastra un archivo o una carpeta aquí",
    "upload.orText": "o",
    "upload.chooseFiles": "Elegir archivo(s)",
    "upload.chooseFolder": "Elegir carpeta",
    "upload.filesSummary": "{count} archivo(s) PDF seleccionados.",
    "upload.filesSummaryFolder": "{count} archivo(s) PDF en la carpeta {folder}.",
    "upload.noFilesSelected": "Selecciona o arrastra al menos un PDF.",
    "upload.uploadAllFailed": "No se pudo subir ningún archivo PDF.",
    "upload.cancel": "Cancelar",

    "edit.pageTitle": "Editar documento",
    "edit.save": "Guardar cambios",
    "edit.saving": "Guardando...",
    "edit.deleteDocument": "Eliminar documento",
    "edit.deleteConfirm": '¿Borrar "{title}" permanentemente? Esta acción no se puede deshacer.',

    "categories.namePlaceholder": "Nombre de la categoría",
    "categories.create": "Crear",
    "categories.delete": "Eliminar",
    "categories.deleteConfirm":
      '¿Borrar la categoría "{name}"? Los documentos que la tengan quedarán sin categoría.',
    "categories.nameRequired": "El nombre es obligatorio.",

    "adminList.pageTitle": "Administrar documentos",
    "adminList.statusReady": "Listo",
    "adminList.statusProcessing": "Procesando",
    "adminList.statusError": "Error",
    "adminList.addDocument": "Agregar documento",
    "adminList.editDocument": "Editar",
    "adminList.assignCategoryAriaLabel": "Cambiar categoría",
    "adminList.deleteCategoryAriaLabel": "Eliminar categoría",

    "logout.confirm": "¿Seguro que quieres cerrar sesión?",
  },
  ja: {
    "nav.documents": "ドキュメント",
    "nav.adminSection": "管理者",
    "nav.manage": "文書を管理",
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

    "upload.titleLabel": "タイトル",
    "upload.descriptionLabel": "説明（任意）",
    "upload.categoryLabel": "カテゴリ（任意）",
    "upload.noCategory": "カテゴリなし",
    "upload.languageLabel": "言語",
    "upload.submitting": "アップロード中...",
    "upload.dropHint": "ファイルまたはフォルダをここにドラッグ",
    "upload.orText": "または",
    "upload.chooseFiles": "ファイルを選択",
    "upload.chooseFolder": "フォルダを選択",
    "upload.filesSummary": "{count}件のPDFファイルが選択されました。",
    "upload.filesSummaryFolder": "フォルダ「{folder}」内に{count}件のPDFファイル。",
    "upload.noFilesSelected": "少なくとも1つのPDFファイルを選択またはドラッグしてください。",
    "upload.uploadAllFailed": "PDFファイルを1つもアップロードできませんでした。",
    "upload.cancel": "キャンセル",

    "edit.pageTitle": "文書を編集",
    "edit.save": "変更を保存",
    "edit.saving": "保存中...",
    "edit.deleteDocument": "文書を削除",
    "edit.deleteConfirm": "「{title}」を完全に削除しますか？この操作は取り消せません。",

    "categories.namePlaceholder": "カテゴリ名",
    "categories.create": "作成",
    "categories.delete": "削除",
    "categories.deleteConfirm": "カテゴリ「{name}」を削除しますか？このカテゴリの文書はカテゴリなしになります。",
    "categories.nameRequired": "名前は必須です。",

    "adminList.pageTitle": "文書を管理",
    "adminList.statusReady": "準備完了",
    "adminList.statusProcessing": "処理中",
    "adminList.statusError": "エラー",
    "adminList.addDocument": "文書を追加",
    "adminList.editDocument": "編集",
    "adminList.assignCategoryAriaLabel": "カテゴリを変更",
    "adminList.deleteCategoryAriaLabel": "カテゴリを削除",

    "logout.confirm": "本当にログアウトしますか？",
  },
} as const satisfies Record<Language, Record<string, string>>;
```

- [ ] **Step 2: Run the i18n tests**

Run: `npx vitest run app/lib/i18n.test.ts`
Expected: PASS (the test only checks key-set parity and one known key/value pair, both still true)

- [ ] **Step 3: Typecheck — expect specific pre-existing errors**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: errors **only** in these three files, all referencing translation keys removed in this task — they get fixed in Tasks 8 and 9:
- `app/routes/admin-upload.tsx` (uses `upload.pageTitle`, `upload.folderTitle`, etc. — deleted in Task 9)
- `app/routes/admin-categorias.tsx` (uses `categories.pageTitle`, `categories.empty` — deleted in Task 9)
- `app/components/AppShell.tsx` (uses `nav.upload`, `nav.categories` — fixed in Task 8)

If any error appears in a file **other** than these three, stop and investigate — it means a key removed above was still in use somewhere unexpected.

- [ ] **Step 4: Commit**

```bash
git add app/lib/i18n.ts
git commit -m "feat: update i18n dictionary for the unified admin UI"
```

---

### Task 4: Extract `DocumentThumbnail` and use it in `/documentos`

**Files:**
- Create: `app/components/DocumentThumbnail.tsx`
- Modify: `app/routes/documents-list.tsx`

**Interfaces:**
- Produces: `DocumentThumbnail()` — no props, renders the PDF icon tile. Used by Task 7's admin cards.

- [ ] **Step 1: Create the component**

```tsx
import { FileText } from "lucide-react";

export function DocumentThumbnail() {
  return (
    <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-500/[0.03] dark:from-accent-400/10 dark:to-transparent">
      <FileText
        size={36}
        strokeWidth={1.5}
        className="text-accent-500/60 transition-transform group-hover:scale-110 dark:text-accent-400/60"
      />
      <span className="absolute right-0 top-0 h-0 w-0 border-b-[16px] border-l-[16px] border-b-transparent border-l-black/[0.06] dark:border-l-white/[0.08]" />
      <span className="absolute bottom-2 right-2 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        PDF
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Use it in `documents-list.tsx`**

Remove the `FileText` import (no longer used directly) and add the new one. Replace:
```tsx
import { FileText } from "lucide-react";
import { Form, Link, useFetcher } from "react-router";
import { AppShell } from "~/components/AppShell";
```
with:
```tsx
import { Form, Link, useFetcher } from "react-router";
import { AppShell } from "~/components/AppShell";
import { DocumentThumbnail } from "~/components/DocumentThumbnail";
```

Replace the icon-tile block inside the card `<Link>`:
```tsx
              <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-500/[0.03] dark:from-accent-400/10 dark:to-transparent">
                <FileText
                  size={36}
                  strokeWidth={1.5}
                  className="text-accent-500/60 transition-transform group-hover:scale-110 dark:text-accent-400/60"
                />
                <span className="absolute right-0 top-0 h-0 w-0 border-b-[16px] border-l-[16px] border-b-transparent border-l-black/[0.06] dark:border-l-white/[0.08]" />
                <span className="absolute bottom-2 right-2 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                  PDF
                </span>
              </div>
```
with:
```tsx
              <DocumentThumbnail />
```

- [ ] **Step 3: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: the same three pre-existing errors from Task 3 (admin-upload.tsx, admin-categorias.tsx, AppShell.tsx) — nothing new

- [ ] **Step 4: Commit**

```bash
git add app/components/DocumentThumbnail.tsx app/routes/documents-list.tsx
git commit -m "refactor: extract DocumentThumbnail, reuse it in /documentos"
```

---

### Task 5: `Dialog` component

**Files:**
- Create: `app/components/Dialog.tsx`

**Interfaces:**
- Produces: `Dialog({ ref, children }: { ref: Ref<HTMLDialogElement>; children: ReactNode })` — a styled native `<dialog>` wrapper. React 19 supports `ref` as a normal prop (no `forwardRef` needed). Used by Task 7.

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode, Ref } from "react";

export function Dialog({
  ref,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      className="w-full max-w-xl rounded-2xl border border-black/10 bg-white p-6 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#141414]"
    >
      {children}
    </dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: the same three pre-existing errors, nothing new

- [ ] **Step 3: Commit**

```bash
git add app/components/Dialog.tsx
git commit -m "feat: add reusable native-dialog wrapper component"
```

---

### Task 6: `DocumentUploadForm` component (drag-and-drop + click upload)

**Files:**
- Create: `app/components/DocumentUploadForm.tsx`

**Interfaces:**
- Consumes: `CategoryRecord` from `~/lib/db.server`, `Language`/`LANGUAGE_LABELS`/`t` from `~/lib/i18n`.
- Produces: `DocumentUploadForm({ categories, language, onCancel }: { categories: CategoryRecord[]; language: Language; onCancel: () => void })`. Renders a `<Form method="post" encType="multipart/form-data">` with hidden `intent=upload`, submitting a `files` file input plus conditional `title`/`description`, a `categoryId` select (hidden when a folder was picked), and a `language` select. Used by Task 7 inside the `Dialog`.

- [ ] **Step 1: Create the component**

```tsx
import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { Button } from "./Button";
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import type { CategoryRecord } from "~/lib/db.server";

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
  createReader(): FileSystemDirectoryReaderLike;
}

interface FileSystemDirectoryReaderLike {
  readEntries(
    success: (entries: FileSystemEntryLike[]) => void,
    error?: (err: unknown) => void,
  ): void;
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

async function walkEntry(entry: FileSystemEntryLike, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
    if (relativePath.toLowerCase().endsWith(".pdf")) {
      out.push(new File([file], relativePath, { type: file.type }));
    }
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    let batch: FileSystemEntryLike[];
    do {
      batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of batch) {
        await walkEntry(child, newPrefix, out);
      }
    } while (batch.length > 0);
  }
}

async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items) as DataTransferItemWithEntry[];
  // Entries/files must be captured synchronously, before any `await` — browsers
  // invalidate the DataTransfer as soon as the drop handler yields control, so
  // resolving them lazily inside the loop below would silently return nothing
  // for every item after the first.
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  const fallbackFiles = items.map((item, i) => (entries[i] ? null : item.getAsFile()));

  const out: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = entries[i];
    if (entry) {
      await walkEntry(entry, "", out);
    } else {
      const file = fallbackFiles[i];
      if (file && file.name.toLowerCase().endsWith(".pdf")) out.push(file);
    }
  }
  return out;
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export function DocumentUploadForm({
  categories,
  language,
  onCancel,
}: {
  categories: CategoryRecord[];
  language: Language;
  onCancel: () => void;
}) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const submitInputRef = useRef<HTMLInputElement>(null);

  const fileCount = selectedNames.length;
  const folderName = selectedNames.find((name) => name.includes("/"))?.split("/")[0] ?? "";
  const isSingleFile = fileCount === 1 && !folderName;
  const singleFileTitle = isSingleFile ? selectedNames[0].replace(/\.pdf$/i, "") : "";

  function applyFiles(files: File[]) {
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    const dataTransfer = new DataTransfer();
    for (const file of pdfFiles) {
      dataTransfer.items.add(file);
    }
    if (submitInputRef.current) submitInputRef.current.files = dataTransfer.files;
    setSelectedNames(pdfFiles.map((file) => file.name));
  }

  function handlePickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    applyFiles(Array.from(event.currentTarget.files ?? []));
  }

  function handlePickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    const renamed = selected.map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return new File([file], relativePath, { type: file.type });
    });
    applyFiles(renamed);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const files = await collectFilesFromDataTransfer(event.dataTransfer);
    applyFiles(files);
  }

  return (
    <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="upload" />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-accent-500 bg-accent-500/5" : "border-black/10 dark:border-white/10"
        }`}
      >
        <UploadCloud size={28} className="text-black/40 dark:text-white/30" />
        <p className="text-sm text-black/60 dark:text-white/50">{t(language, "upload.dropHint")}</p>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => filesInputRef.current?.click()}
            className="text-accent-600 underline dark:text-accent-400"
          >
            {t(language, "upload.chooseFiles")}
          </button>
          <span className="text-black/30 dark:text-white/20">{t(language, "upload.orText")}</span>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="text-accent-600 underline dark:text-accent-400"
          >
            {t(language, "upload.chooseFolder")}
          </button>
        </div>
        <input
          ref={filesInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={handlePickFiles}
        />
        <input
          ref={folderInputRef}
          type="file"
          hidden
          onChange={handlePickFolder}
          {...{ webkitdirectory: "", directory: "" }}
        />
        <input ref={submitInputRef} type="file" name="files" hidden />
      </div>

      {fileCount > 0 && (
        <p className="text-sm text-black/60 dark:text-white/50">
          {folderName
            ? t(language, "upload.filesSummaryFolder")
                .replace("{count}", String(fileCount))
                .replace("{folder}", folderName)
            : t(language, "upload.filesSummary").replace("{count}", String(fileCount))}
        </p>
      )}

      {isSingleFile && (
        <>
          <label className="flex flex-col gap-1 text-sm" key={`title-${singleFileTitle}`}>
            {t(language, "upload.titleLabel")}
            <input type="text" name="title" defaultValue={singleFileTitle} className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.descriptionLabel")}
            <textarea name="description" className={inputClasses} />
          </label>
        </>
      )}

      {!folderName && (
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
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t(language, "upload.languageLabel")}
        <select name="language" defaultValue="es" className={inputClasses}>
          <option value="es">{LANGUAGE_LABELS.es}</option>
          <option value="ja">{LANGUAGE_LABELS.ja}</option>
        </select>
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t(language, "upload.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting || fileCount === 0}>
          {isSubmitting ? t(language, "upload.submitting") : t(language, "adminList.addDocument")}
        </Button>
      </div>
    </Form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: the same three pre-existing errors, nothing new

- [ ] **Step 3: Commit**

```bash
git add app/components/DocumentUploadForm.tsx
git commit -m "feat: add unified drag-and-drop document upload form"
```

---

### Task 7: Rewrite `admin-documents-list.tsx` as the unified hub

**Files:**
- Modify: `app/routes/admin-documents-list.tsx`

**Interfaces:**
- Consumes: `storeAndConvertPdf`/`MAX_UPLOAD_BYTES` (Task 2), new i18n keys (Task 3), `DocumentThumbnail` (Task 4), `Dialog` (Task 5), `DocumentUploadForm` (Task 6), `updateDocumentCategory` (Task 1).
- Produces: the route's `action` now dispatches on `intent`: `"upload" | "createCategory" | "deleteCategory" | "assignCategory"`.

- [ ] **Step 1: Replace the whole file**

```tsx
import { randomUUID } from "node:crypto";
import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Link, data, redirect, useFetcher, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { DocumentThumbnail } from "~/components/DocumentThumbnail";
import { DocumentUploadForm } from "~/components/DocumentUploadForm";
import { requireAdmin } from "~/lib/auth.server";
import {
  createCategory,
  db,
  deleteCategory,
  findOrCreateCategoryByName,
  listAllDocuments,
  listCategories,
  updateDocumentCategory,
} from "~/lib/db.server";
import type { CategoryRecord, DocumentRecord } from "~/lib/db.server";
import { MAX_UPLOAD_BYTES, storeAndConvertPdf } from "~/lib/upload-document.server";
import { t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);
  const documents = listAllDocuments(db);
  const categories = listCategories(db);
  return { user, documents, categories, language };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const uiLang = await getLanguage(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "createCategory") {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      return data({ error: t(uiLang, "categories.nameRequired") }, { status: 400 });
    }
    createCategory(db, { id: randomUUID(), name });
    return null;
  }

  if (intent === "deleteCategory") {
    const id = String(formData.get("id") ?? "");
    deleteCategory(db, id);
    return null;
  }

  if (intent === "assignCategory") {
    const documentId = String(formData.get("documentId") ?? "");
    const categoryId = String(formData.get("categoryId") ?? "") || null;
    updateDocumentCategory(db, documentId, categoryId);
    return null;
  }

  // intent === "upload"
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return data({ error: t(uiLang, "upload.noFilesSelected") }, { status: 400 });
  }

  const docLanguage: Language = formData.get("language") === "ja" ? "ja" : "es";
  const manualCategoryId = String(formData.get("categoryId") ?? "") || null;
  const explicitTitle = String(formData.get("title") ?? "").trim() || null;
  const explicitDescription = String(formData.get("description") ?? "").trim() || null;

  let created = 0;
  let skipped = 0;
  for (const file of files) {
    const segments = file.name.split("/").filter(Boolean);
    const folderName = segments.length > 1 ? segments[0] : null;
    const baseName = segments[segments.length - 1] ?? file.name;
    const isSingleFile = files.length === 1 && !folderName;
    const title = isSingleFile && explicitTitle ? explicitTitle : baseName.replace(/\.pdf$/i, "");
    const description = isSingleFile ? explicitDescription : null;

    if (file.size > MAX_UPLOAD_BYTES) {
      skipped++;
      continue;
    }
    const fileBytes = Buffer.from(await file.arrayBuffer());
    if (fileBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      skipped++;
      continue;
    }

    const categoryId = folderName ? findOrCreateCategoryByName(db, folderName).id : manualCategoryId;
    const result = await storeAndConvertPdf(user.id, fileBytes, title, description, categoryId, docLanguage);
    if (result.ok) {
      created++;
    } else {
      skipped++;
    }
  }

  if (created === 0) {
    return data({ error: t(uiLang, "upload.uploadAllFailed") }, { status: 400 });
  }
  return redirect(`/admin/documentos?success=1&count=${created}${skipped ? `&skipped=${skipped}` : ""}`);
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

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

function groupByCategory(documents: DocumentRecord[], categories: CategoryRecord[]) {
  const byCategory = new Map<string, DocumentRecord[]>();
  for (const doc of documents) {
    const key = doc.categoryId ?? "";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(doc);
  }
  const sections = categories.map((category) => ({
    category,
    documents: byCategory.get(category.id) ?? [],
  }));
  const uncategorized = byCategory.get("") ?? [];
  return { sections, uncategorized };
}

function NewCategoryForm({ language }: { language: Language }) {
  const fetcher = useFetcher<{ error?: string }>();

  return (
    <fetcher.Form method="post" className="mb-8 flex items-start gap-3">
      <input type="hidden" name="intent" value="createCategory" />
      <input
        type="text"
        name="name"
        placeholder={t(language, "categories.namePlaceholder")}
        required
        className={`flex-1 ${inputClasses}`}
      />
      <Button type="submit" disabled={fetcher.state !== "idle"}>
        {t(language, "categories.create")}
      </Button>
      {fetcher.data?.error && (
        <p className="self-center text-sm text-red-600 dark:text-red-400">{fetcher.data.error}</p>
      )}
    </fetcher.Form>
  );
}

function CategorySectionHeader({ category, language }: { category: CategoryRecord; language: Language }) {
  const fetcher = useFetcher();

  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{category.name}</h2>
      <fetcher.Form
        method="post"
        onSubmit={(event) => {
          if (!confirm(t(language, "categories.deleteConfirm").replace("{name}", category.name))) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="deleteCategory" />
        <input type="hidden" name="id" value={category.id} />
        <button
          type="submit"
          aria-label={t(language, "adminList.deleteCategoryAriaLabel")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-white/30 dark:hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </fetcher.Form>
    </div>
  );
}

function AdminDocumentCard({
  doc,
  categories,
  language,
}: {
  doc: DocumentRecord;
  categories: CategoryRecord[];
  language: Language;
}) {
  const fetcher = useFetcher();

  function handleCategoryChange(event: React.ChangeEvent<HTMLSelectElement>) {
    fetcher.submit(
      { intent: "assignCategory", documentId: doc.id, categoryId: event.target.value },
      { method: "post" },
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/70 p-3 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)]">
      <DocumentThumbnail />
      <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">{doc.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>
          {t(language, STATUS_LABEL_KEY[doc.status])}
        </span>
      </div>
      {doc.status === "error" && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{doc.errorMessage}</p>
      )}

      <select
        value={doc.categoryId ?? ""}
        onChange={handleCategoryChange}
        aria-label={t(language, "adminList.assignCategoryAriaLabel")}
        className="mt-2 rounded-lg border border-black/10 bg-black/[0.03] p-1.5 text-xs outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]"
      >
        <option value="">{t(language, "upload.noCategory")}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <div className="mt-auto flex items-center justify-between pt-2">
        <p className="text-xs text-black/40 dark:text-white/30">
          {doc.pageCount}{" "}
          {doc.pageCount === 1 ? t(language, "common.pageSingular") : t(language, "common.pagePlural")}
        </p>
        <Link
          to={`/admin/documentos/${doc.id}`}
          className="text-xs text-accent-600 hover:underline dark:text-accent-400"
        >
          {t(language, "adminList.editDocument")}
        </Link>
      </div>
    </div>
  );
}

export default function AdminDocumentsList({ loaderData, actionData }: Route.ComponentProps) {
  const { user, documents, categories, language } = loaderData;
  const navigation = useNavigation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wasSubmitting = useRef(false);

  useEffect(() => {
    if (navigation.state !== "idle") {
      wasSubmitting.current = true;
    } else if (wasSubmitting.current) {
      wasSubmitting.current = false;
      if (!actionData?.error) {
        dialogRef.current?.close();
      }
    }
  }, [navigation.state, actionData]);

  const { sections, uncategorized } = groupByCategory(documents, categories);

  return (
    <AppShell user={user} language={language}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t(language, "adminList.pageTitle")}</h1>
        <Button type="button" onClick={() => dialogRef.current?.showModal()}>
          <Plus size={16} />
          {t(language, "adminList.addDocument")}
        </Button>
      </div>

      <NewCategoryForm language={language} />

      {sections.map(({ category, documents: categoryDocs }) => (
        <div key={category.id} className="mb-8">
          <CategorySectionHeader category={category} language={language} />
          {categoryDocs.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {categoryDocs.map((doc) => (
                <AdminDocumentCard key={doc.id} doc={doc} categories={categories} language={language} />
              ))}
            </div>
          )}
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{t(language, "upload.noCategory")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {uncategorized.map((doc) => (
              <AdminDocumentCard key={doc.id} doc={doc} categories={categories} language={language} />
            ))}
          </div>
        </div>
      )}

      <Dialog ref={dialogRef}>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">{t(language, "adminList.addDocument")}</h2>
        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}
        <DocumentUploadForm
          categories={categories}
          language={language}
          onCancel={() => dialogRef.current?.close()}
        />
      </Dialog>
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: the same three pre-existing errors (admin-upload.tsx, admin-categorias.tsx, AppShell.tsx), nothing new — this file itself should be clean

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-documents-list.tsx
git commit -m "feat: unify admin document/category management into admin/documentos"
```

---

### Task 8: Remove the old nav links from `AppShell.tsx`

**Files:**
- Modify: `app/components/AppShell.tsx`

- [ ] **Step 1: Remove the now-unused icon imports**

Replace:
```tsx
import {
  FileText,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Upload,
} from "lucide-react";
```
with:
```tsx
import {
  FileText,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
```

- [ ] **Step 2: Remove the "Subir documento" and "Categorías" links**

Replace:
```tsx
                <Link
                  to="/admin/upload"
                  className={NAV_LINK_CLASSES}
                  title={t(language, "nav.upload")}
                >
                  <Upload size={18} />
                  {!collapsed && <span>{t(language, "nav.upload")}</span>}
                </Link>
                <Link
                  to="/admin/documentos"
                  className={NAV_LINK_CLASSES}
                  title={t(language, "nav.manage")}
                >
                  <FolderOpen size={18} />
                  {!collapsed && <span>{t(language, "nav.manage")}</span>}
                </Link>
                <Link
                  to="/admin/categorias"
                  className={NAV_LINK_CLASSES}
                  title={t(language, "nav.categories")}
                >
                  <Tags size={18} />
                  {!collapsed && <span>{t(language, "nav.categories")}</span>}
                </Link>
```
with:
```tsx
                <Link
                  to="/admin/documentos"
                  className={NAV_LINK_CLASSES}
                  title={t(language, "nav.manage")}
                >
                  <FolderOpen size={18} />
                  {!collapsed && <span>{t(language, "nav.manage")}</span>}
                </Link>
```

- [ ] **Step 3: Typecheck**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: only the two remaining pre-existing errors (admin-upload.tsx, admin-categorias.tsx) — AppShell.tsx is now clean

- [ ] **Step 4: Commit**

```bash
git add app/components/AppShell.tsx
git commit -m "feat: remove Subir documento and Categorías from the sidebar nav"
```

---

### Task 9: Delete the old routes

**Files:**
- Delete: `app/routes/admin-upload.tsx`
- Delete: `app/routes/admin-categorias.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Delete the two route files**

```bash
git rm app/routes/admin-upload.tsx app/routes/admin-categorias.tsx
```

- [ ] **Step 2: Remove their registrations from `routes.ts`**

Replace:
```ts
  route("admin/upload", "routes/admin-upload.tsx"),
  route("admin/documentos", "routes/admin-documents-list.tsx"),
  route("admin/categorias", "routes/admin-categorias.tsx"),
  route("admin/documentos/:id", "routes/admin-document-edit.tsx"),
```
with:
```ts
  route("admin/documentos", "routes/admin-documents-list.tsx"),
  route("admin/documentos/:id", "routes/admin-document-edit.tsx"),
```

- [ ] **Step 3: Typecheck — should now be fully clean**

Run: `npx react-router typegen && npx tsc --noEmit`
Expected: no errors anywhere in the project

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus Task 1's new one

- [ ] **Step 5: Commit**

```bash
git add app/routes.ts
git commit -m "chore: remove admin/upload and admin/categorias routes"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Seed a scratch environment**

Reuse the pattern from earlier sessions: an isolated `DATABASE_PATH`/`DOCUMENTS_DIR` (never the real `data/app.db`), a script seeding an admin user, two categories, and a few documents (some categorized, some not), plus a signed session cookie via `sessionStorage.commitSession`.

- [ ] **Step 2: Verify the hub page**

`GET /admin/documentos` with the seeded cookie: confirm the response has no `/admin/upload` or `/admin/categorias` links, shows category section headings, an "Agregar documento" button, and a `<dialog>` containing the upload form markup (filesInput/folderInput/submitInput, category select, language select).

- [ ] **Step 3: Verify unified upload — single file**

`POST /admin/documentos` with `intent=upload`, one file named `prueba.pdf`, `title=Prueba Manual`, a `categoryId`, and `language=ja`. Confirm (via direct DB query, since `pdftoppm` isn't installed on this dev machine — same limitation noted in the language-toggle plan) that a document was created with `title="Prueba Manual"`, the given `categoryId`, and `language="ja"`.

- [ ] **Step 4: Verify unified upload — simulated folder**

`POST /admin/documentos` with `intent=upload` and two files named `CarpetaPrueba/uno.pdf` and `CarpetaPrueba/dos.pdf` (simulating what the client-side folder walk produces — this is the same multipart shape as the old folder-upload feature, so it's exercising the exact same server code path). Confirm a category named `CarpetaPrueba` was created (or reused) and both documents were tagged with it.

- [ ] **Step 5: Verify inline category actions**

`POST /admin/documentos` with `intent=createCategory` and a `name` — confirm it appears in a subsequent `GET /admin/documentos`. `POST` with `intent=assignCategory`, a `documentId`, and that new category's id — confirm the document moved to that section. `POST` with `intent=deleteCategory` and that category's id — confirm the document falls back to the "Sin categoría" section.

- [ ] **Step 6: Clean up**

Stop the scratch dev server process; the real `data/app.db` was never touched (isolated `DATABASE_PATH` throughout), so no cleanup needed there.

**Note on drag-and-drop:** the `webkitGetAsEntry`/`FileSystemDirectoryReader` walk in `DocumentUploadForm` can't be exercised via `curl`/`fetch` scripts — it requires a real browser `DragEvent` with a populated `DataTransfer`, which jsdom doesn't implement either. Steps 3–4 above verify the server-side handling (which drag-and-drop and click-to-browse both funnel into identically) is correct; the drag interaction itself should be spot-checked once by hand in an actual browser if one becomes available, but is not a blocker for this plan's completion given the rest of the project's existing "no route tests, manual browser verification" convention.

---

## Self-Review Notes

- **Spec coverage:** every "Incluido" bullet in the spec maps to a task — route/page consolidation (Tasks 8–9), unified form with drag-and-drop (Task 6), dialog (Task 5, wired in Task 7), category sections + inline create/delete/assign (Task 7), `upload-document.server.ts` extraction (Task 2), `updateDocumentCategory` (Task 1), `DocumentThumbnail` reuse (Task 4). The "fuera de alcance" bullets (bulk assignment, category rename, changes to the edit page or to `/documentos` behavior beyond the thumbnail extraction) are respected — no task touches `admin-document-edit.tsx` or changes `/documentos`' filtering/search logic.
- **Type consistency:** `CategoryRecord`/`DocumentRecord` imported from `~/lib/db.server` consistently; `Language`/`t`/`LANGUAGE_LABELS` imported from `~/lib/i18n` consistently; `storeAndConvertPdf`'s signature in Task 2 matches its call site in Task 7 exactly (6 positional args ending in `language: Language`).
- **No placeholders:** every step shows literal before/after code or complete new-file content, not descriptions of changes.
- **Intermediate broken states are intentional and called out**: Tasks 3–6 each explicitly list the three expected pre-existing typecheck errors so whoever executes the plan doesn't mistake them for new bugs; Task 9 is where they finally clear.
