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
