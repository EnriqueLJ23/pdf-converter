import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useSubmit } from "react-router";
import { AppShell } from "~/components/AppShell";
import { DocumentThumbnail } from "~/components/DocumentThumbnail";
import { requireUser } from "~/lib/auth.server";
import { db, listReadyDocuments, searchReadyDocuments } from "~/lib/db.server";
import type { DocumentRecord, DocumentSuggestion } from "~/lib/db.server";
import { t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const language = await getLanguage(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query, language) : listReadyDocuments(db, language);
  return { user, documents, query, language };
}

function groupByCategory(documents: DocumentRecord[]) {
  const byCategory = new Map<string, { name: string; documents: DocumentRecord[] }>();
  const uncategorized: DocumentRecord[] = [];

  for (const doc of documents) {
    if (!doc.categoryId || !doc.categoryName) {
      uncategorized.push(doc);
      continue;
    }
    if (!byCategory.has(doc.categoryId)) {
      byCategory.set(doc.categoryId, { name: doc.categoryName, documents: [] });
    }
    byCategory.get(doc.categoryId)!.documents.push(doc);
  }

  const sections = Array.from(byCategory.entries())
    .map(([id, group]) => ({ id, name: group.name, documents: group.documents }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { sections, uncategorized };
}

function DocumentCard({ doc, language }: { doc: DocumentRecord; language: Language }) {
  return (
    <Link
      to={`/documentos/${doc.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/70 p-3 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_16px_40px_rgba(0,0,0,0.1)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)]"
    >
      <DocumentThumbnail />

      <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">{doc.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {doc.categoryName && (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-600 dark:text-accent-400">
            {doc.categoryName}
          </span>
        )}
      </div>

      <p className="mt-auto pt-2 text-xs text-black/40 dark:text-white/30">
        {doc.pageCount}{" "}
        {doc.pageCount === 1 ? t(language, "common.pageSingular") : t(language, "common.pagePlural")}
      </p>
    </Link>
  );
}

export default function DocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents, query, language } = loaderData;
  const { sections, uncategorized } = groupByCategory(documents);
  const [inputValue, setInputValue] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsFetcher = useFetcher<{ suggestions: DocumentSuggestion[] }>();
  const submit = useSubmit();
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
    debounceRef.current = setTimeout(() => {
      submit({ q: value }, { method: "get", replace: true });
      if (value.trim()) {
        suggestionsFetcher.load(`/documentos/sugerencias?q=${encodeURIComponent(value)}`);
      }
    }, 300);
  }

  const suggestions = inputValue.trim() ? (suggestionsFetcher.data?.suggestions ?? []) : [];

  return (
    <AppShell user={user} language={language}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t(language, "documents.title")}</h1>

      <div ref={searchBoxRef} className="relative mb-8">
        <Form
          method="get"
          onSubmit={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setShowSuggestions(false);
          }}
        >
          <input
            type="search"
            name="q"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setShowSuggestions(true)}
            autoComplete="off"
            placeholder={t(language, "documents.searchPlaceholder")}
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
          {query
            ? t(language, "documents.emptyQuery").replace("{query}", query)
            : t(language, "documents.emptyNoQuery")}
        </p>
      ) : query ? (
        // Actively searching: a flat list ranked by relevance (bm25) reads
        // better than splitting the strongest matches across sections.
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} language={language} />
          ))}
        </div>
      ) : (
        <>
          {sections.map((section) => (
            <div key={section.id} className="mb-8">
              <h2 className="mb-3 text-lg font-semibold tracking-tight">{section.name}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.documents.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} language={language} />
                ))}
              </div>
            </div>
          ))}

          {uncategorized.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold tracking-tight">{t(language, "upload.noCategory")}</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {uncategorized.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} language={language} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
