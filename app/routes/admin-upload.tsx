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
