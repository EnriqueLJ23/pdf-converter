# Selector de idioma (Español / Japonés) para documentos y UI

**Fecha:** 2026-07-02
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

La aplicación empezará a alojar documentos tanto en español como en
japonés. Se necesita un selector en el sidebar que, al elegir un idioma:

1. Cambie el idioma de **toda la interfaz** (textos, labels, botones —
   admin incluido) a español o japonés.
2. Filtre `/documentos` (y su autocompletado) para mostrar únicamente los
   documentos de ese idioma.

## Alcance

Incluido:
- Campo `language` (`"es" | "ja"`) por documento, elegido por el admin al
  subirlo (no auto-detección) — editable después desde
  `admin/documentos/:id`. El formulario de subida de carpeta (feature de
  categoría-por-carpeta) también gana un selector de idioma, aplicado a
  todos los PDF de ese lote.
- Cookie `lang` (no firmada — no es dato sensible) que persiste la
  elección entre recargas y pestañas nuevas, leída server-side en cada
  loader.
- Selector en el sidebar (`AppShell`), junto al `ThemeToggle`: dos
  botones, "Español" / "日本語", el activo resaltado. Estas dos etiquetas
  **nunca se traducen** — siempre se muestran en su propio idioma para que
  el usuario pueda encontrar el camino de vuelta sin importar en qué
  idioma esté la UI actualmente.
- Diccionario de traducción propio (`app/lib/i18n.ts`), sin librería
  externa, con claves con namespace (`"documents.title"`,
  `"viewer.zoomIn"`, `"admin.upload.title"`, etc.) y un helper
  `t(lang, key)`.
- Traducción de **todas** las páginas: `documentos`, visor de documentos,
  y todas las páginas de admin (subida, categorías, lista de admin,
  edición de documento).
- Filtrado por idioma en `/documentos` y en `/documentos/sugerencias`
  (autocompletado).
- Migración automática de la columna `language` en `documents`, con
  `DEFAULT 'es'` — los documentos ya existentes quedan en español sin
  intervención manual.

Explícitamente fuera de alcance:
- `admin/documentos` (lista de administración) **no se filtra** por
  idioma — el admin necesita ver todos los documentos para poder
  gestionarlos, sin importar el idioma seleccionado en el sidebar. Sólo
  se traduce su UI, igual que el resto de páginas de admin.
- Auto-detección del idioma de un documento a partir del texto
  extraído/OCR.
- Selección de idioma "ambos" o "ninguno" por documento — cada documento
  tiene exactamente un idioma.
- Persistir la preferencia de idioma en la cuenta del usuario (queda en
  cookie, por navegador).
- Pluralización, interpolación compleja u otras features de librerías de
  i18n — el diccionario es un mapa plano de string a string.

## Modelo de datos y migración

Nueva columna en `documents`, agregada por el mismo patrón de migración
automática ya usado para `category_id`/`extracted_text`/etc.:
```sql
ALTER TABLE documents ADD COLUMN language TEXT NOT NULL DEFAULT 'es'
```
Sin `CHECK` a nivel de base de datos (igual que `status`/`index_status`
hoy) — la validez del valor la garantiza la capa de aplicación, ya que el
`<select>` de subida sólo ofrece `es`/`ja`.

`DocumentRecord` gana `language: "es" | "ja"`. `createDocument` y
`updateDocumentMetadata` reciben `language` como parámetro obligatorio.
`listReadyDocuments`, `searchReadyDocuments` y `suggestReadyDocuments`
reciben un parámetro `language` y agregan `WHERE documents.language = ?`
a su query. `listAllDocuments` y `getDocumentById` (usadas por las
páginas de admin) **no** reciben ese filtro.

## Idioma: cookie y resolución

Nuevo `app/lib/language.server.ts`:
- `LANGUAGE_COOKIE = createCookie("lang", { path: "/", maxAge: 60*60*24*365, sameSite: "lax" })`
  (sin `secrets` — no protege nada sensible, un valor corrupto
  simplemente cae al default).
- `getLanguage(request: Request): Promise<"es" | "ja">` — parsea la
  cookie; si no existe o el valor no es `"es"`/`"ja"`, devuelve `"es"`.

Cada loader que ya existe (documentos, visor, todas las páginas de admin,
`root.tsx`) llama a `getLanguage(request)` directamente, igual que ya
llaman a `requireUser(request)` — no se centraliza en un loader
compartido, para mantener el mismo patrón "cada ruta es dueña de sus
datos" que ya usa el proyecto.

`root.tsx` gana un `loader` mínimo (hoy no tiene ninguno) que devuelve
`{ language }`, leído en `Layout` vía `useRouteLoaderData("root")` para
poder setear `<html lang={language === "ja" ? "ja" : "es"}>` desde el
primer byte renderizado en servidor (sin flash del idioma incorrecto,
igual que ya se evita el flash de tema con el script inline).

## Cómo se aplica el cambio de idioma

Nueva ruta-recurso (sin loader ni componente, mismo patrón que
`documentos-sugerencias.tsx`): `app/routes/set-language.tsx` en
`POST /idioma`. Su `action` lee `language` del form data, valida que sea
`"es"` o `"ja"`, y responde con `Set-Cookie` (sin redirect — devuelve
`data(null)`).

El toggle del sidebar usa `useFetcher()` para enviar ese POST. React
Router revalida automáticamente todos los loaders de la página activa
después de que una action se resuelve, así que tanto la UI traducida
como el filtrado de `/documentos` se actualizan solos, sin recarga
manual de página.

## Diccionario de traducción

`app/lib/i18n.ts`:
```ts
export type Language = "es" | "ja";

export const translations = {
  es: { "documents.title": "Documentos", /* ... */ },
  ja: { "documents.title": "ドキュメント", /* ... */ },
} as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof typeof translations.es;

export function t(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
```
El `satisfies` obliga a que ambos idiomas tengan exactamente el mismo
conjunto de claves — un olvido de traducción es un error de compilación,
no un string faltante en producción.

Cada página pasa su `language` (ya resuelto en el loader) a `AppShell` y
lo usa para sus propios textos vía `t(language, "...")`. `AppShell`
también traduce sus propios labels (nav, sección "Admin",
aria-labels de colapsar/expandir, "Cerrar sesión").

## Rutas y componentes modificados

- `app/routes/document-viewer.tsx`: además de traducir sus textos, aquí
  también vive el fix ya aplicado de `max-w-none` en la imagen de página
  (el zoom-in no funcionaba porque el `max-width: 100%` del Preflight de
  Tailwind topaba el ancho inline del zoom).
- `app/routes/documents-list.tsx`: agrega filtrado por idioma; ya tiene
  el rediseño de tarjetas y el autocompletado de esta sesión.
- `app/routes/documentos-sugerencias.tsx`: agrega filtrado por idioma.
- `app/routes/admin-upload.tsx`: agrega `<select>` de idioma en ambos
  formularios (archivo único y carpeta).
- `app/routes/admin-document-edit.tsx`: agrega `<select>` de idioma.
- `app/routes/admin-documents-list.tsx`, `admin-categorias.tsx`: sólo
  traducción de UI, sin cambios de filtrado.
- `app/components/AppShell.tsx`: agrega el toggle de idioma y traduce sus
  propios textos.
- `app/root.tsx`: agrega `loader` y setea `<html lang>` dinámico.

## Testing

- Unitarias (Vitest) en `db.server.test.ts`: `createDocument` guarda
  `language`; `listReadyDocuments`/`searchReadyDocuments` filtran
  correctamente por idioma; la migración agrega la columna con default
  `'es'` en una base de datos existente sin la columna.
- Sin pruebas automatizadas para las rutas (mismo criterio que el resto
  del proyecto). Verificación manual: subir un documento en japonés,
  confirmar que sólo aparece en `/documentos` con el toggle en 日本語;
  cambiar el toggle y confirmar que toda la UI (incluidas páginas de
  admin) cambia de idioma; confirmar que `/admin/documentos` sigue
  mostrando documentos de ambos idiomas sin importar el toggle.
