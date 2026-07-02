import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Link, data } from "react-router";
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

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

const toolbarButtonClasses =
  "flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/70 transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-30 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5";

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  // Renamed to `pdfDocument`: destructuring as `document` would shadow the
  // global `document` object needed below for the keydown listener.
  const { user, document: pdfDocument } = loaderData;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    function blockShortcuts(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "p" || event.key === "s")
      ) {
        event.preventDefault();
      }
    }
    document.addEventListener("keydown", blockShortcuts);
    return () => document.removeEventListener("keydown", blockShortcuts);
  }, []);

  return (
    <AppShell user={user}>
      <Link
        to="/documentos"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
      >
        ← Volver
      </Link>

      <div
        className="select-none print:hidden"
        onContextMenu={(event) => event.preventDefault()}
      >
        <GlassPanel className="p-8">
          <h1 className="mb-4 text-xl font-semibold tracking-tight">
            {pdfDocument.title}
          </h1>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                className={toolbarButtonClasses}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-black/60 dark:text-white/50">
                Página {page} de {pdfDocument.pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pdfDocument.pageCount}
                onClick={() =>
                  setPage((p) => Math.min(pdfDocument.pageCount, p + 1))
                }
                aria-label="Página siguiente"
                className={toolbarButtonClasses}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
                }
                aria-label="Reducir zoom"
                className={toolbarButtonClasses}
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title="Restablecer zoom"
                className="w-14 text-center text-sm text-black/60 hover:text-black dark:text-white/50 dark:hover:text-white"
              >
                {zoom}%
              </button>
              <button
                type="button"
                disabled={zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
                }
                aria-label="Aumentar zoom"
                className={toolbarButtonClasses}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="max-h-[75vh] overflow-auto rounded-lg border border-black/5 dark:border-white/10">
            <img
              src={`/documentos/${pdfDocument.id}/pagina/${page}`}
              alt={`Página ${page} de ${pdfDocument.title}`}
              draggable={false}
              className="max-w-none select-none"
              style={{ width: `${zoom}%` }}
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
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
