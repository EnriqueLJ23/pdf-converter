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
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const categories = listCategories(db);
  return { user, categories };
}

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
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "file");

  if (intent === "folder") {
    // Files come from the folder-picker input, whose onChange renames each
    // File to its full relative path ("CarpetaSeleccionada/sub/archivo.pdf")
    // so that path survives the multipart upload — browsers otherwise only
    // send the bare filename, dropping the directory structure.
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return data({ error: "Selecciona una carpeta con al menos un archivo PDF." }, { status: 400 });
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
      const result = await storeAndConvertPdf(user.id, fileBytes, title, null, categoryId);
      if (result.ok) {
        created++;
      } else {
        skipped++;
      }
    }

    if (created === 0) {
      return data({ error: "No se pudo subir ningún archivo PDF de la carpeta." }, { status: 400 });
    }
    return redirect(`/admin/documentos?success=1&count=${created}${skipped ? `&skipped=${skipped}` : ""}`);
  }

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

  const result = await storeAndConvertPdf(user.id, fileBytes, title, description, categoryId);
  if (!result.ok) {
    return redirect("/admin/documentos?error=conversion");
  }

  return redirect("/admin/documentos?success=1");
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminUpload({ loaderData, actionData }: Route.ComponentProps) {
  const { user, categories } = loaderData;
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
    <AppShell user={user}>
      <GlassPanel className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Subir documento</h1>

        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

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
      </GlassPanel>

      <GlassPanel className="mx-auto mt-6 max-w-xl p-8">
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
      </GlassPanel>
    </AppShell>
  );
}
