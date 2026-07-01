import { useEffect, useState } from "react";
import { data } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db, getDocumentById } from "~/lib/db.server";
import type { Route } from "./+types/document-viewer";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  return { document: doc };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  // Renamed to `pdfDocument`: destructuring as `document` would shadow the
  // global `document` object needed below for the keydown listener.
  const { document: pdfDocument } = loaderData;
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
    <main
      className="mx-auto max-w-4xl select-none p-8 print:hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <h1 className="mb-4 text-xl font-semibold">{pdfDocument.title}</h1>

      <div className="mb-4 flex items-center gap-4">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <span>
          Página {page} de {pdfDocument.pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pdfDocument.pageCount}
          onClick={() => setPage((p) => Math.min(pdfDocument.pageCount, p + 1))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>

      <img
        src={`/documentos/${pdfDocument.id}/pagina/${page}`}
        alt={`Página ${page} de ${pdfDocument.title}`}
        draggable={false}
        className="w-full select-none border"
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

      <p className="mt-4 text-xs text-gray-400">
        Este documento es de solo lectura. La descarga y la impresión están deshabilitadas.
      </p>
    </main>
  );
}
