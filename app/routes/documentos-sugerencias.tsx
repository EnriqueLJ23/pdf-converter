import { requireUser } from "~/lib/auth.server";
import { db, suggestReadyDocuments } from "~/lib/db.server";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/documentos-sugerencias";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const language = await getLanguage(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return { suggestions: [] };
  return { suggestions: suggestReadyDocuments(db, query, 8, language) };
}
