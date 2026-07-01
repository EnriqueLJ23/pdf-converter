import { Link } from "react-router";
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
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <div className="flex items-center gap-4 text-sm">
          <span>{user.name}</span>
          {user.isAdmin && (
            <Link to="/admin/documentos" className="underline">
              Panel admin
            </Link>
          )}
          <Link to="/logout" className="underline">
            Cerrar sesión
          </Link>
        </div>
      </div>

      {documents.length === 0 ? (
        <p>Todavía no hay documentos disponibles.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {documents.map((doc) => (
            <li key={doc.id} className="py-4">
              <Link to={`/documentos/${doc.id}`} className="text-lg font-medium underline">
                {doc.title}
              </Link>
              {doc.description && <p className="text-sm text-gray-600">{doc.description}</p>}
              <p className="text-xs text-gray-400">{doc.pageCount} páginas</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
