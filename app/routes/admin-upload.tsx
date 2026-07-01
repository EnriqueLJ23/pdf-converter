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

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminUpload({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell user={user}>
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
