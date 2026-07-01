import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { data } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireUser } from "~/lib/auth.server";
import { db, getDocumentById } from "~/lib/db.server";
import type { Route } from "./+types/document-viewer";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  return { user, document: doc };
}

const navButtonClasses =
  "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black/70 backdrop-blur-md transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 dark:border-white/10 dark:bg-black/60 dark:text-white/70 dark:hover:bg-black/80";

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  // Renamed to `pdfDocument`: destructuring as `document` would shadow the
  // global `document` object needed below for the keydown listener.
  const { user, document: pdfDocument } = loaderData;
  const [page, setPage] = useState(1);

  useEffect(() => {
    function blockShortcuts(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && (event.key === "p" || event.key === "s")) {
        event.preventDefault();
      }
    }
    document.addEventListener("keydown", blockShortcuts);
    return () => document.removeEventListener("keydown", blockShortcuts);
  }, []);

  return (
    <AppShell title={pdfDocument.title} user={user} backTo="/documentos">
      <div className="select-none print:hidden" onContextMenu={(event) => event.preventDefault()}>
        <GlassPanel className="p-8">
          <h1 className="mb-4 text-xl font-semibold tracking-tight">{pdfDocument.title}</h1>

          <div className="relative">
            <img
              src={`/documentos/${pdfDocument.id}/pagina/${page}`}
              alt={`Página ${page} de ${pdfDocument.title}`}
              draggable={false}
              className="w-full select-none rounded-lg border border-black/5 dark:border-white/10"
            />

            {page < pdfDocument.pageCount && (
              // Hidden prefetch: even with Cache-Control: no-store (required so
              // pages aren't left in a shared computer's disk cache), starting the
              // fetch for the next page ahead of time still shaves latency off the
              // "Siguiente" click, because it warms the in-flight/decoded-image
              // memory cache rather than the HTTP disk cache.
              <img
                src={`/documentos/${pdfDocument.id}/pagina/${page + 1}`}
                alt=""
                aria-hidden="true"
                className="hidden"
              />
            )}

            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
              className={`${navButtonClasses} left-2`}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              disabled={page >= pdfDocument.pageCount}
              onClick={() => setPage((p) => Math.min(pdfDocument.pageCount, p + 1))}
              aria-label="Página siguiente"
              className={`${navButtonClasses} right-2`}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <span className="text-sm text-black/60 dark:text-white/50">
              Página {page} de {pdfDocument.pageCount}
            </span>
          </div>

          <p className="mt-4 text-center text-xs text-black/40 dark:text-white/30">
            Este documento es de solo lectura. La descarga y la impresión están deshabilitadas.
          </p>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
