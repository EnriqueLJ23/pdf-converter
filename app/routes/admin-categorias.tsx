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
