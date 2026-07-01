import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments } from "~/lib/db.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const documents = listReadyDocuments(db);
  return { user, documents };
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents } = loaderData;

  return (
    <AppShell title="Documentos" user={user}>
      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">Todavía no hay documentos disponibles.</p>
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
