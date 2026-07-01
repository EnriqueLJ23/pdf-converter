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
    <AppShell user={user}>
      <Link
        to="/admin/documentos"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        ← Volver
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Editar documento</h1>

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
