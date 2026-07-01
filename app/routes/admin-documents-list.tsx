import { Link } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const documents = listAllDocuments(db);
  return { documents };
}

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { documents } = loaderData;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administrar documentos</h1>
        <Link to="/admin/upload" className="rounded bg-gray-900 px-4 py-2 text-white">
          Subir nuevo
        </Link>
      </div>

      <ul className="divide-y divide-gray-200">
        {documents.map((doc) => (
          <li key={doc.id} className="py-4">
            <p className="font-medium">{doc.title}</p>
            <p className="text-sm text-gray-500">
              Estado: {doc.status}
              {doc.status === "ready" && ` · ${doc.pageCount} páginas`}
            </p>
            {doc.status === "error" && <p className="text-sm text-red-600">{doc.errorMessage}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
