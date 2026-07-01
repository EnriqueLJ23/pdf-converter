import { Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { ButtonLink } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const documents = listAllDocuments(db);
  return { user, documents };
}

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents } = loaderData;

  return (
    <AppShell title="Administrar documentos" user={user}>
      <div className="mb-6 flex justify-end gap-3">
        <ButtonLink to="/admin/categorias" variant="secondary">
          Categorías
        </ButtonLink>
        <ButtonLink to="/admin/upload">Subir nuevo</ButtonLink>
      </div>

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
                {doc.status}
              </span>
              {doc.categoryName && (
                <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs font-medium text-accent-600 dark:text-accent-400">
                  {doc.categoryName}
                </span>
              )}
            </div>
            {doc.status === "ready" && (
              <p className="text-sm text-black/60 dark:text-white/50">{doc.pageCount} páginas</p>
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
