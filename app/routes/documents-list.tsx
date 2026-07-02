import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Form, Link, useFetcher } from "react-router";
import { AppShell } from "~/components/AppShell";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments, searchReadyDocuments } from "~/lib/db.server";
import type { DocumentSuggestion } from "~/lib/db.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query) : listReadyDocuments(db);
  return { user, documents, query };
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents, query } = loaderData;
  const [inputValue, setInputValue] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsFetcher = useFetcher<{ suggestions: DocumentSuggestion[] }>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setInputValue(value);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = setTimeout(() => {
      suggestionsFetcher.load(`/documentos/sugerencias?q=${encodeURIComponent(value)}`);
    }, 200);
  }

  const suggestions = inputValue.trim() ? (suggestionsFetcher.data?.suggestions ?? []) : [];

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Documentos</h1>

      <div ref={searchBoxRef} className="relative mb-8">
        <Form method="get" onSubmit={() => setShowSuggestions(false)}>
          <input
            type="search"
            name="q"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setShowSuggestions(true)}
            autoComplete="off"
            placeholder="Buscar por título, descripción o contenido..."
            className="w-full rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]"
          />
        </Form>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-[#141414]/95">
            {suggestions.map((suggestion) => (
              <Link
                key={suggestion.id}
                to={`/documentos/${suggestion.id}`}
                onClick={() => setShowSuggestions(false)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="truncate">{suggestion.title}</span>
                {suggestion.categoryName && (
                  <span className="shrink-0 text-xs text-black/40 dark:text-white/30">
                    {suggestion.categoryName}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">
          {query ? `No se encontraron documentos para «${query}».` : "Todavía no hay documentos disponibles."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              to={`/documentos/${doc.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/70 p-3 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_16px_40px_rgba(0,0,0,0.1)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-500/[0.03] dark:from-accent-400/10 dark:to-transparent">
                <FileText
                  size={36}
                  strokeWidth={1.5}
                  className="text-accent-500/60 transition-transform group-hover:scale-110 dark:text-accent-400/60"
                />
                <span className="absolute right-0 top-0 h-0 w-0 border-b-[16px] border-l-[16px] border-b-transparent border-l-black/[0.06] dark:border-l-white/[0.08]" />
                <span className="absolute bottom-2 right-2 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                  PDF
                </span>
              </div>

              <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">{doc.title}</p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {doc.categoryName && (
                  <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-600 dark:text-accent-400">
                    {doc.categoryName}
                  </span>
                )}
              </div>

              <p className="mt-auto pt-2 text-xs text-black/40 dark:text-white/30">
                {doc.pageCount} página{doc.pageCount === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
