# Rediseño visual: SaaS glassmorphism estilo Vercel

**Fecha:** 2026-07-01
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

La interfaz actual (Tailwind v4 con clases utilitarias mínimas, sin sistema de
diseño) se ve genérica y sin personalidad. El objetivo es aplicar un
lenguaje visual consistente, sutil y moderno inspirado en Vercel/Linear:
glassmorphism discreto, alto contraste, tipografía apretada, y un acento de
color morado/índigo. El rediseño cubre **toda la app**, incluido el visor de
PDF, sin modificar ninguna medida anti-copia ya implementada (sin
selección de texto, sin botón de descarga, bloqueo de clic derecho y
Ctrl+P/Ctrl+S, `Cache-Control: private, no-store` en las imágenes de
página).

## Alcance

Incluido:
- Modo oscuro (por defecto, casi negro) y modo claro, con toggle manual
  persistido en `localStorage` (sin cookie, sin lógica de servidor).
- Paleta y tokens de tema en `app.css` (`@theme`), acento morado/índigo.
- Componentes compartidos: `GlassPanel`, `Button`, `ThemeToggle`, `AppShell`.
- Aplicación del nuevo estilo en las 5 páginas con UI: `documents-list.tsx`,
  `admin-documents-list.tsx`, `admin-upload.tsx`, `logout.tsx`,
  `document-viewer.tsx`.
- Nueva dependencia: `lucide-react` (íconos: sol/luna para el toggle,
  flecha, etc.).

Explícitamente fuera de alcance:
- Cualquier cambio a rutas, loaders, actions, autenticación, conversión de
  PDF, o modelo de datos — este rediseño es solo de presentación (CSS/JSX),
  cero cambios de comportamiento/lógica de negocio.
- Pruebas automatizadas nuevas — no hay lógica que probar; la verificación
  es visual en el navegador (claro y oscuro) antes de dar por terminado.
- Rediseño de `login.tsx` / `auth-callback.tsx` / `home.tsx`: son rutas que
  solo redirigen (no renderizan UI visible más que un instante), no hay
  nada que rediseñar ahí.

## Mecanismo de tema claro/oscuro

Tailwind v4 usa `prefers-color-scheme` por defecto para el modificador
`dark:`. Como se requiere un toggle manual, se cambia a modo "por clase"
agregando en `app.css`:
```css
@custom-variant dark (&:is(.dark *));
```
Con esto, `dark:` reacciona a una clase `.dark` presente en `<html>`, no al
sistema operativo.

Para evitar el parpadeo de tema incorrecto en el primer render (SSR), se
agrega un `<script>` inline en el `<head>` de `app/root.tsx`, ejecutado
antes de la hidratación de React, que:
1. Lee `localStorage.theme` (`"dark"` | `"light"`).
2. Si no existe, usa `window.matchMedia("(prefers-color-scheme: dark)")`
   como default.
3. Aplica o quita la clase `dark` en `document.documentElement`
   inmediatamente.

El componente `ThemeToggle` alterna la clase y actualiza `localStorage` en
cada click. Es puramente client-side — no hay cookie ni cambio en el
servidor, así que no hay riesgo de desincronizar con la sesión de auth
(`__session`) ni con el flujo OIDC.

## Paleta y tokens visuales

En `app/app.css`, dentro de `@theme`, se agregan tokens de color (Tailwind
v4 los expone automáticamente como utilidades `bg-accent-500`,
`text-accent-600`, etc.):
```css
@theme {
  --color-accent-50: #f5f3ff;
  --color-accent-400: #a78bfa;
  --color-accent-500: #8b5cf6;
  --color-accent-600: #7c3aed;
}
```

**Fondos:**
- Oscuro: `#0a0a0a` con un gradiente radial fijo, acento índigo a ~6% de
  opacidad, detrás de todo el contenido.
- Claro: `#fafafa` con el mismo gradiente a opacidad aún menor (~3%).

**Vidrio (glassmorphism):** implementado como componente React
(`GlassPanel`), no como clase CSS global, para controlar por instancia:
```
rounded-2xl border border-black/5 dark:border-white/10
bg-white/70 dark:bg-white/[0.04] backdrop-blur-xl
shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)]
dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)]
```
La línea de luz superior (`inset` shadow) es lo que da el acabado
"esmerilado premium" en vez de un panel plano semitransparente.

**Tipografía:** se mantiene Inter (ya cargada vía Google Fonts en
`root.tsx`, sin cambios ahí). Títulos con `font-semibold tracking-tight`;
texto secundario con `text-sm text-black/60 dark:text-white/50`.

**Botones:** primario sólido con el acento (`bg-accent-500
hover:bg-accent-600 text-white`); secundario con borde sutil y fondo
transparente (`border border-black/10 dark:border-white/10 hover:bg-black/5
dark:hover:bg-white/5`).

## Componentes compartidos (`app/components/`)

- **`GlassPanel.tsx`** — `<div>` con el estilo de vidrio de arriba. Props:
  `children`, `className?` (para extender/sobreescribir vía merge simple de
  strings, sin librería de merge de clases dado el alcance acotado).
- **`Button.tsx`** — Props: `variant: "primary" | "secondary"`, `as?: "button"
  | typeof Link` para reusar el estilo tanto en botones de submit como en
  links con apariencia de botón (ej. "Subir nuevo" en el panel admin).
- **`ThemeToggle.tsx`** — botón circular con ícono sol/luna
  (`lucide-react`), alterna `.dark` en `<html>` y persiste en
  `localStorage`.
- **`AppShell.tsx`** — barra superior compartida: título/logo a la
  izquierda (o un link "← Volver" en el visor), y a la derecha: nombre de
  usuario, link "Panel admin" (solo si `isAdmin`), `ThemeToggle`, botón
  "Cerrar sesión". Envuelve el contenido en un `<div>` con el fondo con
  gradiente. Props: `title: string`, `user?: { name: string; isAdmin:
  boolean }`, `backTo?: string` (para el modo "← Volver" del visor),
  `children`.

## Aplicación por página

- **`documents-list.tsx`**: usa `AppShell`; cada documento es una fila
  dentro de un `GlassPanel`, con `hover:bg-black/[0.02]
  dark:hover:bg-white/[0.02]` y una flecha (`ChevronRight` de lucide) que
  aparece al hacer hover.
- **`admin-documents-list.tsx`**: mismo patrón de lista en `GlassPanel`, con
  badges de estado con fondo translúcido según `status`: `ready` →
  esmeralda, `processing` → ámbar, `error` → rojo (ej. `bg-emerald-500/10
  text-emerald-600 dark:text-emerald-400`).
- **`admin-upload.tsx`**: formulario dentro de un `GlassPanel` centrado,
  inputs con `bg-black/[0.03] dark:bg-white/[0.05] border
  border-black/10 dark:border-white/10 rounded-lg focus:ring-2
  focus:ring-accent-500`.
- **`logout.tsx`**: `GlassPanel` centrado, simple.
- **`document-viewer.tsx`**: usa `AppShell` en modo "← Volver" (sin logo,
  con link a `/documentos`); el área de la página se envuelve en un
  `GlassPanel` con más padding; los botones "Anterior"/"Siguiente" se
  convierten en botones circulares flotantes sobre los bordes de la
  imagen. **Ningún cambio funcional**: se preserva exactamente el mismo
  `<img>` con `draggable={false}`, `user-select: none`, el
  `onContextMenu` que bloquea clic derecho, el `useEffect` que bloquea
  `Ctrl+P`/`Ctrl+S`, el `<img>` oculto de prefetch, y el fallback
  `@media print` en `app.css`.

## Testing

No se agregan pruebas automatizadas — es un cambio puramente de
presentación (CSS/JSX) sin lógica nueva que probar; los tests existentes
(`db.server`, `storage.server`, `pdf-convert.server`, `auth.server`) no se
tocan y deben seguir pasando sin cambios. La verificación es manual: correr
`npm run dev`, revisar cada página en modo claro y oscuro, confirmar que el
toggle funciona y persiste al recargar, y confirmar que el visor conserva
todas sus medidas anti-copia.
