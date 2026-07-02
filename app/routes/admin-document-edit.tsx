import fs from "node:fs";
import { Form, Link, data, redirect, useNavigation } from "react-router";
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
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/admin-document-edit";

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

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminDocumentEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { user, document, categories, language } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell user={user} language={language}>
      <Link
        to="/admin/documentos"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        {t(language, "common.back")}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "edit.pageTitle")}</h1>

      <GlassPanel className="mx-auto max-w-xl p-8">
        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

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
      </GlassPanel>
    </AppShell>
  );
}
