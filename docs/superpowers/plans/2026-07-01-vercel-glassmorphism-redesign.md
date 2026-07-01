# Vercel-style Glassmorphism Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app (documents list, admin pages, logout, PDF viewer) with a subtle glassmorphism/SaaS visual language inspired by Vercel — dark/light toggle, purple/indigo accent, glass panels — with zero changes to routing, auth, data, or the viewer's anti-copy behavior.

**Architecture:** Pure presentation-layer change. A small shared component library (`GlassPanel`, `Button`/`ButtonLink`, `ThemeToggle`, `AppShell`) is built once and then wired into each existing route's JSX. Dark mode is a client-only class toggle (`.dark` on `<html>`) driven by an anti-flash inline script in `root.tsx`, with Tailwind v4's `@custom-variant` reconfigured to react to that class instead of `prefers-color-scheme`.

**Tech Stack:** React Router 8 (framework mode), Tailwind v4, `lucide-react` (new dependency, icons only).

## Global Constraints

- Zero changes to loaders/actions business logic, routing, auth, PDF conversion, or the data model — this is CSS/JSX only. The only loader changes allowed are capturing an already-available `user` (from `requireUser`/`requireAdmin`, which already return the full `UserRecord`) so `AppShell` can render nav/logout consistently.
- The document viewer (`document-viewer.tsx`) must keep every anti-copy behavior exactly as-is: `select-none`, `draggable={false}` on the page `<img>`, the `onContextMenu` handler that blocks the right-click menu, the `useEffect` keydown listener blocking `Ctrl+P`/`Ctrl+S`, the hidden prefetch `<img>` for the next page, and the `print:hidden` class (on top of the existing global `@media print { body { display: none } }` in `app.css`).
- Dark mode: Tailwind v4's `dark:` variant is switched from `prefers-color-scheme` to class-based via `@custom-variant dark (&:is(.dark *));` in `app.css`. No cookie, no server-side theme logic — `localStorage` + an inline anti-flash `<script>` in `root.tsx`'s `<head>` only.
- Accent color: purple/indigo (`--color-accent-50` through `--color-accent-600`, `#8b5cf6` as the primary `500` shade), defined once in `app.css`'s `@theme` block and reused via Tailwind's auto-generated `accent-*` utilities (`bg-accent-500`, `focus:ring-accent-500`, etc.).
- No new automated tests: this task adds no business logic. The existing suite (`db.server`, `storage.server`, `pdf-convert.server`, `auth.server`) must still pass unmodified after every task.
- `login.tsx`, `auth-callback.tsx`, and `home.tsx` are out of scope — they only redirect and render `null`, there's nothing to restyle.
- Verification for this plan is `npm run typecheck`, `npm run build`, `npm run test` (existing suite), and a visual pass via `openwolf designqc` (captures screenshots this session can read directly) in the final task — not new unit tests.

---

### Task 1: Tailwind foundations — class-based dark mode, accent tokens, background

**Files:**
- Modify: `app/app.css`
- Modify: `package.json` (add `lucide-react` dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `dark:` variant now reacts to an `.dark` class on `<html>` (consumed by every later task's `dark:` utility classes); Tailwind utilities `bg-accent-50` … `bg-accent-600` / `text-accent-*` / `ring-accent-*` become available (consumed by Task 4's `Button`, Task 8's focus rings); `<body>` has the near-black/near-white background with a subtle radial accent gradient (consumed visually by every later page).

- [ ] **Step 1: Rewrite `app/app.css`**

Replace the entire file:
```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";

  --color-accent-50: #f5f3ff;
  --color-accent-400: #a78bfa;
  --color-accent-500: #8b5cf6;
  --color-accent-600: #7c3aed;
}

html.dark {
  color-scheme: dark;
}

body {
  @apply bg-[#fafafa] text-black dark:bg-[#0a0a0a] dark:text-white;
  background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139, 92, 246, 0.05), transparent);
  background-attachment: fixed;
  min-height: 100vh;
}

html.dark body {
  background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139, 92, 246, 0.08), transparent);
}

@media print {
  body {
    display: none;
  }
}
```

- [ ] **Step 2: Add the `lucide-react` dependency**

Edit `package.json` dependencies (add next to `react-router`):
```json
"lucide-react": "^1.23.0",
```

Run: `npm install`

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run typecheck`
Expected: no errors (only the pre-existing Node-version warning).

Run: `npm run build`
Expected: build succeeds; `build/client/assets/root-*.css` is produced.

- [ ] **Step 4: Commit**

```bash
git add app/app.css package.json package-lock.json
git commit -m "style: add class-based dark mode, accent tokens, and lucide-react"
```

---

### Task 2: Anti-flash theme script in `root.tsx`

**Files:**
- Modify: `app/root.tsx`

**Interfaces:**
- Consumes: the `.dark` class contract from Task 1 (this script is what sets that class before first paint).
- Produces: on every page load, `<html>` already has (or doesn't have) `class="dark"` before React hydrates, based on `localStorage.theme` or the OS preference — consumed by Task 5's `ThemeToggle`, which reads/writes the same `localStorage` key and toggles the same class at runtime.

- [ ] **Step 1: Add the inline script to the document `<head>`**

Edit `app/root.tsx`, inside the `Layout` function's `<head>` (right after the two `<meta>` tags, before `<Meta />`):
```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          // Runs before hydration to avoid a flash of the wrong theme.
          dangerouslySetInnerHTML={{
            __html: `(function () {
  var stored = localStorage.getItem("theme");
  var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", isDark);
})();`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

Leave every other export in `root.tsx` (`links`, `App`, `ErrorBoundary`) untouched.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/root.tsx
git commit -m "style: add anti-flash theme init script"
```

---

### Task 3: `GlassPanel` component

**Files:**
- Create: `app/components/GlassPanel.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure presentational component; relies on the `dark:` variant from Task 1 being active).
- Produces: `GlassPanel({ children: ReactNode, className?: string })` — consumed by Tasks 6–10 as the shared "glass card" wrapper.

- [ ] **Step 1: Create the component**

Create `app/components/GlassPanel.tsx`:
```tsx
import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-black/5 bg-white/70 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/GlassPanel.tsx
git commit -m "feat: add GlassPanel component"
```

---

### Task 4: `Button` / `ButtonLink` components

**Files:**
- Create: `app/components/Button.tsx`

**Interfaces:**
- Consumes: `Link` from `react-router`; the `accent-*` Tailwind utilities from Task 1.
- Produces: `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" })` and `ButtonLink({ to: string, variant?: "primary" | "secondary", className?: string, children: ReactNode })` — consumed by Tasks 7, 8, 9.

- [ ] **Step 1: Create the component**

Create `app/components/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

type Variant = "primary" | "secondary";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50",
  secondary:
    "border border-black/10 bg-transparent hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/Button.tsx
git commit -m "feat: add Button and ButtonLink components"
```

---

### Task 5: `ThemeToggle` and `AppShell` components

**Files:**
- Create: `app/components/ThemeToggle.tsx`
- Create: `app/components/AppShell.tsx`

**Interfaces:**
- Consumes: the `.dark`/`localStorage.theme` contract from Task 2; `Link` from `react-router`; `Sun`/`Moon`/icons from `lucide-react` (Task 1's dependency).
- Produces: `ThemeToggle()` (no props) — consumed internally by `AppShell`. `AppShell({ title: string, user?: { name: string; isAdmin: boolean }, backTo?: string, children: ReactNode })` — consumed by Tasks 6–10 as the shared page shell/nav.

- [ ] **Step 1: Create `ThemeToggle`**

Create `app/components/ThemeToggle.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/70 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
```

- [ ] **Step 2: Create `AppShell`**

Create `app/components/AppShell.tsx`:
```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({
  title,
  user,
  backTo,
  children,
}: {
  title: string;
  user?: { name: string; isAdmin: boolean };
  backTo?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-black/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {backTo ? (
            <Link
              to={backTo}
              className="text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              ← Volver
            </Link>
          ) : (
            <span className="text-lg font-semibold tracking-tight">{title}</span>
          )}

          <div className="flex items-center gap-4">
            {user && (
              <>
                <span className="hidden text-sm text-black/60 sm:inline dark:text-white/50">
                  {user.name}
                </span>
                {user.isAdmin && (
                  <Link
                    to="/admin/documentos"
                    className="text-sm underline decoration-black/20 underline-offset-4 hover:decoration-black dark:decoration-white/20 dark:hover:decoration-white"
                  >
                    Panel admin
                  </Link>
                )}
                <Link
                  to="/logout"
                  className="text-sm underline decoration-black/20 underline-offset-4 hover:decoration-black dark:decoration-white/20 dark:hover:decoration-white"
                >
                  Cerrar sesión
                </Link>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/ThemeToggle.tsx app/components/AppShell.tsx
git commit -m "feat: add ThemeToggle and AppShell components"
```

---

### Task 6: Apply redesign to `documents-list.tsx`

**Files:**
- Modify: `app/routes/documents-list.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 5), `GlassPanel` (Task 3), `ChevronRight` from `lucide-react`. No loader signature change — it already returns `{ user, documents }`.
- Produces: nothing new for later tasks (leaf page).

- [ ] **Step 1: Rewrite the route**

Replace `app/routes/documents-list.tsx` entirely:
```tsx
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
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
    <AppShell title="Documentos" user={user}>
      {documents.length === 0 ? (
        <p className="text-black/60 dark:text-white/50">Todavía no hay documentos disponibles.</p>
      ) : (
        <GlassPanel className="divide-y divide-black/5 dark:divide-white/10">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              to={`/documentos/${doc.id}`}
              className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <div>
                <p className="font-medium tracking-tight">{doc.title}</p>
                {doc.description && (
                  <p className="text-sm text-black/60 dark:text-white/50">{doc.description}</p>
                )}
                <p className="text-xs text-black/40 dark:text-white/30">{doc.pageCount} páginas</p>
              </div>
              <ChevronRight
                size={18}
                className="text-black/30 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/30"
              />
            </Link>
          ))}
        </GlassPanel>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/documents-list.tsx
git commit -m "style: restyle documents list with AppShell and GlassPanel"
```

---

### Task 7: Apply redesign to `admin-documents-list.tsx`

**Files:**
- Modify: `app/routes/admin-documents-list.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 5), `GlassPanel` (Task 3), `ButtonLink` (Task 4).
- Produces: loader now returns `{ user, documents }` instead of just `{ documents }` — `requireAdmin` already returns the full `UserRecord`, so this only requires capturing its return value.

- [ ] **Step 1: Rewrite the route**

Replace `app/routes/admin-documents-list.tsx` entirely:
```tsx
import { ButtonLink } from "~/components/Button";
import { AppShell } from "~/components/AppShell";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { db, listAllDocuments } from "~/lib/db.server";
import type { Route } from "./+types/admin-documents-list";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const documents = listAllDocuments(db);
  return { user, documents };
}

const STATUS_BADGE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function AdminDocumentsList({ loaderData }: Route.ComponentProps) {
  const { user, documents } = loaderData;

  return (
    <AppShell title="Administrar documentos" user={user}>
      <div className="mb-6 flex justify-end">
        <ButtonLink to="/admin/upload">Subir nuevo</ButtonLink>
      </div>

      <GlassPanel className="divide-y divide-black/5 dark:divide-white/10">
        {documents.map((doc) => (
          <div key={doc.id} className="px-6 py-4">
            <div className="flex items-center gap-3">
              <p className="font-medium tracking-tight">{doc.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>
                {doc.status}
              </span>
            </div>
            {doc.status === "ready" && (
              <p className="text-sm text-black/60 dark:text-white/50">{doc.pageCount} páginas</p>
            )}
            {doc.status === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">{doc.errorMessage}</p>
            )}
          </div>
        ))}
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-documents-list.tsx
git commit -m "style: restyle admin documents list with status badges"
```

---

### Task 8: Apply redesign to `admin-upload.tsx`

**Files:**
- Modify: `app/routes/admin-upload.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 5), `GlassPanel` (Task 3), `Button` (Task 4).
- Produces: loader now returns `{ user }` instead of `null` — `requireAdmin` already returns the full `UserRecord`. The `action` function is untouched (same validation, same `PdfConversionError` handling, same redirects).

- [ ] **Step 1: Rewrite the route**

Replace `app/routes/admin-upload.tsx` entirely:
```tsx
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Form, data, redirect, useNavigation } from "react-router";
import { AppShell } from "~/components/AppShell";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { requireAdmin } from "~/lib/auth.server";
import { createDocument, db, markDocumentError, markDocumentReady } from "~/lib/db.server";
import { PdfConversionError, convertPdfToPages } from "~/lib/pdf-convert.server";
import { ensureDocumentDirs, originalPdfPath } from "~/lib/storage.server";
import type { Route } from "./+types/admin-upload";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024);

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const file = formData.get("file");

  if (!title) {
    return data({ error: "El título es obligatorio." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return data({ error: "Selecciona un archivo PDF." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return data({ error: "El archivo excede el tamaño máximo permitido." }, { status: 400 });
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());
  if (fileBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return data({ error: "El archivo no es un PDF válido." }, { status: 400 });
  }

  const documentId = randomUUID();
  ensureDocumentDirs(documentId);
  fs.writeFileSync(originalPdfPath(documentId), fileBytes);
  createDocument(db, { id: documentId, title, description, uploadedBy: user.id });

  try {
    const pageCount = await convertPdfToPages(documentId);
    markDocumentReady(db, documentId, pageCount);
  } catch (error) {
    const message =
      error instanceof PdfConversionError ? error.message : "Error desconocido al convertir el PDF.";
    markDocumentError(db, documentId, message);
    return redirect("/admin/documentos?error=conversion");
  }

  return redirect("/admin/documentos?success=1");
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export default function AdminUpload({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell title="Subir documento" user={user}>
      <GlassPanel className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Subir documento</h1>

        {actionData?.error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {actionData.error}
          </p>
        )}

        <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Título
            <input type="text" name="title" required className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Descripción (opcional)
            <textarea name="description" className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Archivo PDF
            <input type="file" name="file" accept="application/pdf" required className={inputClasses} />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Subiendo..." : "Subir"}
          </Button>
        </Form>
      </GlassPanel>
    </AppShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin-upload.tsx
git commit -m "style: restyle admin upload form with GlassPanel"
```

---

### Task 9: Apply redesign to `logout.tsx`

**Files:**
- Modify: `app/routes/logout.tsx`

**Interfaces:**
- Consumes: `GlassPanel` (Task 3), `Button` (Task 4). No `AppShell` here (per spec: "GlassPanel centrado, simple" — a confirmation dialog, not a full nav page).
- Produces: nothing new (leaf page).

- [ ] **Step 1: Rewrite the route**

Replace `app/routes/logout.tsx` entirely:
```tsx
import { Form, redirect } from "react-router";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { destroyUserSession, requireUser } from "~/lib/auth.server";
import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const setCookieHeader = await destroyUserSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LogoutRoute() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <GlassPanel className="w-full max-w-sm p-8 text-center">
        <p className="mb-6 text-black/70 dark:text-white/70">¿Seguro que quieres cerrar sesión?</p>
        <Form method="post">
          <Button type="submit" className="w-full">
            Cerrar sesión
          </Button>
        </Form>
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/logout.tsx
git commit -m "style: restyle logout confirmation with GlassPanel"
```

---

### Task 10: Apply redesign to `document-viewer.tsx` (preserve anti-copy exactly)

**Files:**
- Modify: `app/routes/document-viewer.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 5, `backTo` mode), `GlassPanel` (Task 3), `ChevronLeft`/`ChevronRight` from `lucide-react`.
- Produces: loader now returns `{ user, document }` instead of `{ document }` — `requireUser` already returns the full `UserRecord`.

- [ ] **Step 1: Rewrite the route**

Replace `app/routes/document-viewer.tsx` entirely:
```tsx
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { data } from "react-router";
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

const navButtonClasses =
  "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black/70 backdrop-blur-md transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 dark:border-white/10 dark:bg-black/60 dark:text-white/70 dark:hover:bg-black/80";

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  // Renamed to `pdfDocument`: destructuring as `document` would shadow the
  // global `document` object needed below for the keydown listener.
  const { user, document: pdfDocument } = loaderData;
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
    <AppShell title={pdfDocument.title} user={user} backTo="/documentos">
      <div className="select-none print:hidden" onContextMenu={(event) => event.preventDefault()}>
        <GlassPanel className="p-8">
          <h1 className="mb-4 text-xl font-semibold tracking-tight">{pdfDocument.title}</h1>

          <div className="relative">
            <img
              src={`/documentos/${pdfDocument.id}/pagina/${page}`}
              alt={`Página ${page} de ${pdfDocument.title}`}
              draggable={false}
              className="w-full select-none rounded-lg border border-black/5 dark:border-white/10"
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

            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
              className={`${navButtonClasses} left-2`}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              disabled={page >= pdfDocument.pageCount}
              onClick={() => setPage((p) => Math.min(pdfDocument.pageCount, p + 1))}
              aria-label="Página siguiente"
              className={`${navButtonClasses} right-2`}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <span className="text-sm text-black/60 dark:text-white/50">
              Página {page} de {pdfDocument.pageCount}
            </span>
          </div>

          <p className="mt-4 text-center text-xs text-black/40 dark:text-white/30">
            Este documento es de solo lectura. La descarga y la impresión están deshabilitadas.
          </p>
        </GlassPanel>
      </div>
    </AppShell>
  );
}
```

**Preserved exactly (do not change):** `select-none`, `onContextMenu` handler, `draggable={false}`, the `useEffect` keydown blocker for `Ctrl+P`/`Ctrl+S`, the hidden prefetch `<img>`, `print:hidden`, and the `pdfDocument` rename (avoids shadowing the global `document`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/document-viewer.tsx
git commit -m "style: restyle document viewer, preserve anti-copy behavior"
```

---

### Task 11: Full verification — build, tests, and visual QC

**Files:** none (verification only).

**Interfaces:** none — this task only runs and inspects, using everything from Tasks 1–10.

- [ ] **Step 1: Run the existing automated test suite**

Run: `npm run test`
Expected: same result as before this plan started — 8 passed, 1 skipped (Poppler-dependent test, unaffected by this styling change).

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Capture screenshots for visual QC**

Run: `npm run dev` in the background, then:

Run: `openwolf designqc --routes /documentos /admin/documentos /admin/upload /logout`
Expected: JPEG screenshots saved to `.wolf/designqc-captures/`.

- [ ] **Step 4: Review the screenshots**

Read each captured screenshot with the Read tool. Check:
- Glass panels are visibly translucent with a soft blur and a subtle top highlight (not a flat opaque card).
- Text contrast is readable in both the default theme and after clicking `ThemeToggle` (re-run `designqc` after toggling if the tool captures state, or verify manually in a browser tab).
- No layout overflow/clipping on the admin upload form or the documents list on a typical viewport width.

If anything looks off (contrast too low, glass effect not visible, spacing cramped), fix the specific Tailwind classes in the affected component/route file and re-run Steps 1–4 for that file only.

- [ ] **Step 5: Manual check of the document viewer's anti-copy behavior**

In a browser tab open to a document's `/documentos/:id` page:
- Confirm right-click is still blocked (no context menu appears).
- Confirm `Ctrl+P` and `Ctrl+S` do nothing.
- Confirm the page image cannot be dragged out of the browser window.
- Confirm there is still no download button anywhere on the page.

- [ ] **Step 6: Commit any fixes made during review**

If Step 4 or 5 required changes:
```bash
git add <changed files>
git commit -m "style: fix visual QC issues found in glassmorphism redesign"
```

If no changes were needed, this task requires no commit — it was verification-only.

---

## Self-Review Notes

- **Spec coverage:** theme mechanism → Task 2; tokens/palette → Task 1; shared components (`GlassPanel`, `Button`/`ButtonLink`, `ThemeToggle`, `AppShell`) → Tasks 3–5; all 5 in-scope pages → Tasks 6–10; anti-copy preservation → explicitly called out and preserved verbatim in Task 10; testing section (no new automated tests, manual/visual verification) → Task 11.
- **Type consistency checked:** `AppShell`'s `user` prop shape (`{ name: string; isAdmin: boolean }`) matches the `UserRecord` fields actually used by every consumer (Tasks 6, 7, 8, 10); `Button`/`ButtonLink` names and props are used identically wherever imported; `GlassPanel`'s `className` prop is always optional and merged the same way in every task.
- **No placeholders:** every step has literal file contents or exact commands; Task 11's "fix if needed" step intentionally has no diff to show upfront since its content depends on what visual QC finds — this is verification, not implementation, so it's exempt from the "no placeholders" rule for code steps.
