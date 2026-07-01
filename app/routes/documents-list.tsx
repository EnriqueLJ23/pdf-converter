import { ChevronRight } from "lucide-react";
import { Form, Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments, searchReadyDocuments } from "~/lib/db.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query) : listReadyDocuments(db);
  return { user, documents, query };
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents, query } = loaderData;

  return (
    <AppShell title="Documentos" user={user}>
      <Form method="get" className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por título, descripción o contenido..."
          className="w-full rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]"
        />
      </Form>

      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">
          {query ? `No se encontraron documentos para «${query}».` : "Todavía no hay documentos disponibles."}
        </p>
      ) : (
        <GlassPanel className="divide-y divide-black/5 dark:divide-white/10">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              to={`/documentos/${doc.id}`}
              className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <div>
                <p className="font-medium tracking-tight">{doc.title}</p>
                {doc.description && (
                  <p className="text-sm text-black/60 dark:text-white/50">{doc.description}</p>
                )}
                <p className="text-xs text-black/40 dark:text-white/30">{doc.pageCount} páginas</p>
                {doc.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.keywords.slice(0, 6).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs text-accent-600 dark:text-accent-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight
                size={18}
                className="text-black/30 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/30"
              />
            </Link>
          ))}
        </GlassPanel>
      )}
    </AppShell>
  );
}
