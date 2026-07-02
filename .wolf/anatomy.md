# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-02T15:21:31.557Z
> Files: 83 tracked | Anatomy hits: 0 | Misses: 0

## ../../../../../JESSEN~1/AppData/Local/Temp/claude/C--Users-Jes-sEnriqueLunaJass-OneDrive---tq1-com-mx-Documents-DEV-pdf-converter/4a678a1d-35fe-47d7-863f-333f7942529c/scratchpad/

- `folder-upload-test.mjs` — API routes: GET (1 endpoints) (~207 tok)
- `seed.mts` — SCRATCH: makeReadyDoc (~764 tok)
- `seed.ts` — SCRATCH: makeReadyDoc (~743 tok)
- `upload-language-test.mjs` — API routes: GET (1 endpoints) (~184 tok)

## ./

- `.dockerignore` — Docker ignore rules (~12 tok)
- `.gitignore` — Git ignore rules (~91 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `docker-compose.yml` — Docker Compose services (~144 tok)
- `Dockerfile` — Docker container definition (~356 tok)
- `package-lock.json` — npm lock file (~33618 tok)
- `package.json` — Node.js package manifest (~292 tok)
- `react-router.config.ts` (~59 tok)
- `README.md` — Project documentation (~447 tok)
- `tsconfig.json` — TypeScript configuration (~168 tok)
- `vite.config.ts` — Vite build configuration (~74 tok)
- `vitest.config.ts` — /*.test.ts"], (~56 tok)
- `vitest.setup.ts` (~98 tok)

## .agents/skills/react-router/

- `SKILL.md` — React Router (~1525 tok)

## .agents/skills/react-router/references/

- `data-mode.md` — Data Mode (~1200 tok)
- `declarative-mode.md` — Declarative Mode (~821 tok)
- `framework-mode.md` — Framework Mode (~1818 tok)
- `rsc.md` — React Server Components (RSC) (~862 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .react-router/types/

- `+routes.ts` — Declares Register (~145 tok)
- `+server-build.d.ts` — Exports assets, assetsBuildDirectory, basename, entry + 9 more (~243 tok)

## .react-router/types/app/+types/

- `root.ts` — Exports LinkDescriptors, LinksFunction, MetaArgs, MetaDescriptors + 15 more (~549 tok)

## .react-router/types/app/routes/+types/

- `home.ts` — Exports LinkDescriptors, LinksFunction, MetaArgs, MetaDescriptors + 15 more (~570 tok)

## app/

- `app.css` — Styles: 4 rules, 5 vars (~226 tok)
- `root.tsx` — loader (~714 tok)
- `routes.ts` — Declares RouteConfig (~202 tok)

## app/components/

- `AppShell.tsx` — NAV_LINK_CLASSES (~1537 tok)
- `Button.tsx` — VARIANT_CLASSES (~316 tok)
- `Dialog.tsx` — Dialog — renders modal (~210 tok)
- `DocumentThumbnail.tsx` — DocumentThumbnail (~231 tok)
- `DocumentUploadForm.tsx` — walkEntry — renders form (~2548 tok)
- `GlassPanel.tsx` — GlassPanel (~149 tok)
- `ThemeToggle.tsx` — ThemeToggle (~249 tok)

## app/lib/

- `auth.server.test.ts` — Declares cookieHeaderFor (~596 tok)
- `auth.server.ts` — API routes: GET (4 endpoints) (~1605 tok)
- `db.server.test.ts` — Declares db (~2647 tok)
- `db.server.ts` — Exports DocumentStatus, IndexStatus, UserRecord, CategoryRecord + 22 more (~3698 tok)
- `i18n.test.ts` — Declares esKeys (~200 tok)
- `i18n.ts` — Exports Language, LANGUAGE_LABELS, translations, TranslationKey, t (~1559 tok)
- `index-document.server.ts` — Exports indexDocumentText (~335 tok)
- `keywords.server.test.ts` — Declares text (~246 tok)
- `keywords.server.ts` — Exports extractKeywords (~429 tok)
- `language.server.test.ts` — Declares requestWithCookie (~290 tok)
- `language.server.ts` — API routes: GET (1 endpoints) (~150 tok)
- `pdf-convert.server.test.ts` — Declares poppler (~528 tok)
- `pdf-convert.server.ts` — Exports PdfConversionError, isPdftoppmAvailable, convertPdfToPages (~567 tok)
- `sanity.test.ts` (~46 tok)
- `storage.server.test.ts` (~199 tok)
- `storage.server.ts` — Exports documentDir, originalPdfPath, pagesDir, pageImagePath, ensureDocumentDirs (~207 tok)
- `text-extract.server.test.ts` — Declares pdfDoc (~975 tok)
- `text-extract.server.ts` — Exports isTessdataAvailable, extractTextFromPdf, extractTextViaOcr, extractDocumentText (~495 tok)
- `upload-document.server.ts` — Exports MAX_UPLOAD_BYTES, storeAndConvertPdf (~533 tok)

## app/routes/

- `admin-categorias.tsx` — loader — renders form (~1059 tok)
- `admin-document-edit.tsx` — loader — renders form (~1521 tok)
- `admin-documents-list.tsx` — loader — renders modal (~3466 tok)
- `admin-upload.tsx` — MAX_UPLOAD_BYTES — renders form (~3284 tok)
- `auth-callback.tsx` — loader (~158 tok)
- `document-page-image.tsx` — loader (~316 tok)
- `document-viewer.tsx` — loader (~1730 tok)
- `documentos-sugerencias.tsx` — loader (~159 tok)
- `documents-list.tsx` — loader — renders form (~2314 tok)
- `home.tsx` — loader (~103 tok)
- `login.tsx` — loader (~113 tok)
- `logout.tsx` — loader — renders form (~364 tok)
- `set-language.tsx` — action (~122 tok)

## app/welcome/

- `welcome.tsx` — Welcome (~1200 tok)

## docs/superpowers/plans/

- `2026-07-01-admin-document-management.md` — Administración completa de documentos (borrar, editar, categorías) Implementation Plan (~10838 tok)
- `2026-07-01-pdf-search-ocr.md` — Búsqueda de documentos por contenido (OCR + palabras clave) Implementation Plan (~11492 tok)
- `2026-07-01-pdf-viewer-implementation.md` — Visor de PDFs de solo lectura — Implementation Plan (~14105 tok)
- `2026-07-01-vercel-glassmorphism-redesign.md` — Vercel-style Glassmorphism Redesign Implementation Plan (~8458 tok)
- `2026-07-02-admin-ui-unification.md` — Unificación de la UI de administración Implementation Plan (~12336 tok)
- `2026-07-02-language-toggle.md` — Selector de idioma (Español / Japonés) Implementation Plan (~19166 tok)

## docs/superpowers/specs/

- `2026-07-01-admin-document-management-design.md` — Administración completa de documentos (borrar, editar metadata, categorías) (~1560 tok)
- `2026-07-01-pdf-search-ocr-design.md` — Búsqueda de documentos por contenido (OCR + palabras clave) (~2347 tok)
- `2026-07-01-pdf-viewer-design.md` — Visor de PDFs de solo lectura (read-only PDF viewer) (~3067 tok)
- `2026-07-01-vercel-glassmorphism-redesign-design.md` — Rediseño visual: SaaS glassmorphism estilo Vercel (~1825 tok)
- `2026-07-02-admin-ui-unification-design.md` — Unificación de la UI de administración (~1629 tok)
- `2026-07-02-language-toggle-design.md` — Selector de idioma (Español / Japonés) para documentos y UI (~1922 tok)
