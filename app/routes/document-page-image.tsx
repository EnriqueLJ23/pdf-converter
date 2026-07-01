import fs from "node:fs";
import { data } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db, getDocumentById } from "~/lib/db.server";
import { pageImagePath } from "~/lib/storage.server";
import type { Route } from "./+types/document-page-image";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);

  const doc = getDocumentById(db, params.id);
  if (!doc || doc.status !== "ready") {
    throw data("Documento no encontrado", { status: 404 });
  }

  const pageNumber = Number(params.n);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.pageCount) {
    throw data("Página no encontrada", { status: 404 });
  }

  const filePath = pageImagePath(doc.id, pageNumber);
  if (!fs.existsSync(filePath)) {
    throw data("Página no encontrada", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
