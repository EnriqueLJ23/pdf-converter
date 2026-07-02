# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-02T04:08:13.148Z
> Files: 65 tracked | Anatomy hits: 0 | Misses: 0

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
- `root.tsx` — links (~626 tok)
- `routes.ts` — Declares RouteConfig (~201 tok)

## app/components/

- `AppShell.tsx` — NAV_LINK_CLASSES (~1206 tok)
- `Button.tsx` — VARIANT_CLASSES (~316 tok)
- `GlassPanel.tsx` — GlassPanel (~149 tok)
- `ThemeToggle.tsx` — ThemeToggle (~243 tok)

## app/lib/

- `auth.server.test.ts` — Declares cookieHeaderFor (~596 tok)
- `auth.server.ts` — API routes: GET (4 endpoints) (~1605 tok)
- `db.server.test.ts` — Declares db (~1864 tok)
- `db.server.ts` — Exports DocumentStatus, IndexStatus, UserRecord, CategoryRecord + 19 more (~2981 tok)
- `index-document.server.ts` — Exports indexDocumentText (~335 tok)
- `keywords.server.test.ts` — Declares text (~246 tok)
- `keywords.server.ts` — Exports extractKeywords (~429 tok)
- `pdf-convert.server.test.ts` — Declares poppler (~528 tok)
- `pdf-convert.server.ts` — Exports PdfConversionError, isPdftoppmAvailable, convertPdfToPages (~567 tok)
- `sanity.test.ts` (~46 tok)
- `storage.server.test.ts` (~199 tok)
- `storage.server.ts` — Exports documentDir, originalPdfPath, pagesDir, pageImagePath, ensureDocumentDirs (~207 tok)
- `text-extract.server.test.ts` — Declares pdfDoc (~975 tok)
- `text-extract.server.ts` — Exports isTessdataAvailable, extractTextFromPdf, extractTextViaOcr, extractDocumentText (~495 tok)

## app/routes/

- `admin-categorias.tsx` — loader — renders form (~994 tok)
- `admin-document-edit.tsx` — loader — renders form (~1274 tok)
- `admin-documents-list.tsx` — loader (~639 tok)
- `admin-upload.tsx` — MAX_UPLOAD_BYTES — renders form (~1495 tok)
- `auth-callback.tsx` — loader (~158 tok)
- `document-page-image.tsx` — loader (~316 tok)
- `document-viewer.tsx` — loader (~1621 tok)
- `documents-list.tsx` — loader — renders form (~883 tok)
- `home.tsx` — loader (~103 tok)
- `login.tsx` — loader (~113 tok)
- `logout.tsx` — loader — renders form (~301 tok)

## app/welcome/

- `welcome.tsx` — Welcome (~1200 tok)

## docs/superpowers/plans/

- `2026-07-01-admin-document-management.md` — Administración completa de documentos (borrar, editar, categorías) Implementation Plan (~10838 tok)
- `2026-07-01-pdf-search-ocr.md` — Búsqueda de documentos por contenido (OCR + palabras clave) Implementation Plan (~11492 tok)
- `2026-07-01-pdf-viewer-implementation.md` — Visor de PDFs de solo lectura — Implementation Plan (~14105 tok)
- `2026-07-01-vercel-glassmorphism-redesign.md` — Vercel-style Glassmorphism Redesign Implementation Plan (~8458 tok)

## docs/superpowers/specs/

- `2026-07-01-admin-document-management-design.md` — Administración completa de documentos (borrar, editar metadata, categorías) (~1560 tok)
- `2026-07-01-pdf-search-ocr-design.md` — Búsqueda de documentos por contenido (OCR + palabras clave) (~2347 tok)
- `2026-07-01-pdf-viewer-design.md` — Visor de PDFs de solo lectura (read-only PDF viewer) (~3067 tok)
- `2026-07-01-vercel-glassmorphism-redesign-design.md` — Rediseño visual: SaaS glassmorphism estilo Vercel (~1825 tok)
