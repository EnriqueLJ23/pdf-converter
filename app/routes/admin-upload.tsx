import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { useRef, useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import {
  createDocument,
  db,
  findOrCreateCategoryByName,
  listCategories,
  markDocumentError,
  markDocumentReady,
  syncDocumentFts,
} from "~/lib/db.server";
import { indexDocumentText } from "~/lib/index-document.server";
import { PdfConversionError, convertPdfToPages } from "~/lib/pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "~/lib/storage.server";
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const language = await getLanguage(request);
  const categories = listCategories(db);
  return { user, categories, language };
}

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

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminUpload({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories, language } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderFileCount, setFolderFileCount] = useState(0);
  const [folderName, setFolderName] = useState("");

  function handleFolderChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files;
    if (!selected || selected.length === 0) {
      setFolderFileCount(0);
      setFolderName("");
      return;
    }

    // Browsers only send the bare filename in a multipart upload, dropping
    // the directory structure `webkitdirectory` exposes client-side. Renaming
    // each File to its `webkitRelativePath` bakes the folder name into the
    // filename so the server can recover it and use it as the category.
    const dataTransfer = new DataTransfer();
    let detectedFolderName = "";
    for (const file of Array.from(selected)) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!relativePath.toLowerCase().endsWith(".pdf")) continue;
      if (!detectedFolderName) {
        detectedFolderName = relativePath.split("/")[0] ?? "";
      }
      dataTransfer.items.add(new File([file], relativePath, { type: file.type }));
    }
    input.files = dataTransfer.files;
    setFolderFileCount(dataTransfer.files.length);
    setFolderName(detectedFolderName);
  }

  return (
    <AppShell user={user} language={language}>
      <GlassPanel className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">{t(language, "upload.pageTitle")}</h1>

        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

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
      </GlassPanel>

      <GlassPanel className="mx-auto mt-6 max-w-xl p-8">
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
      </GlassPanel>
    </AppShell>
  );
}
