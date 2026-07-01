# Búsqueda de documentos por contenido (OCR + palabras clave)

**Fecha:** 2026-07-01
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

Los usuarios necesitan encontrar documentos por su contenido, no solo por
título. Como el visor ya muestra los PDFs como imágenes (convertidas con
Poppler), muchos documentos subidos son escaneos sin capa de texto real, por
lo que la extracción de texto necesita un fallback de OCR. El texto
extraído se reduce a un conjunto de palabras clave (quitando stopwords) y se
indexa en SQLite (FTS5) para que un buscador simple en `/documentos` filtre
por título, descripción o contenido.

Es explícitamente la "opción intermedia" (frecuencia de términos +
stopwords), sin TF-IDF real contra el corpus completo ni ningún componente
de IA/embeddings.

## Alcance

Incluido:
- Extracción de texto híbrida: `pdf-parse` primero (rápido, para PDFs con
  texto real); si el resultado es insuficiente (~<50 caracteres), fallback
  a OCR con `tesseract.js` (idiomas español + inglés) sobre las imágenes de
  página ya generadas por el pipeline de conversión existente.
- Extracción de palabras clave con `natural`: tokenización, remoción de
  stopwords (español e inglés), y las 15 palabras más frecuentes por
  documento.
- Indexado en segundo plano ("fire and forget" dentro del mismo proceso
  Node, sin cola/broker externo), para no bloquear la respuesta HTTP de
  subida con el tiempo de OCR.
- Buscador en `/documentos` (`<Form method="get">` con parámetro `q`),
  usando una tabla virtual FTS5 de SQLite contra título, descripción,
  texto extraído y palabras clave.
- Palabras clave mostradas como tags visuales junto a cada documento en la
  lista.

Explícitamente fuera de alcance:
- Buscador en el panel de admin (`/admin/documentos`) — solo en la vista
  pública `/documentos`, según lo decidido.
- TF-IDF real calculado contra todo el corpus de documentos (queda como
  posible mejora futura si la extracción por frecuencia simple resulta
  insuficiente).
- Cola de trabajos formal (Redis/BullMQ) para el indexado en background —
  el volumen esperado no lo justifica; si el proceso se reinicia a medio
  indexar, ese documento queda en `index_status='pending'` sin reintento
  automático.
- Reintentar indexado desde la UI (podría añadirse después en el panel de
  administración de documentos ya especificado en
  `2026-07-01-admin-document-management-design.md`).
- Cualquier componente de IA/embeddings/similaridad semántica.

## Arquitectura — pipeline de extracción e indexado

```
Upload (ya existe) → convertPdfToPages() → status='ready' → responde al admin
                                                    │
                                                    ▼ (sin await, en background)
                                          indexDocumentText(documentId)
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               │
                          pdf-parse sobre el PDF original           │
                          ¿texto suficiente (>~50 caracteres)?      │
                     sí ───────────┘                    no ────────┘
                     │                                    │
                     ▼                                    ▼
              texto = resultado de pdf-parse      Tesseract OCR (spa+eng) sobre
                                                   cada pages/page-N.png ya
                                                   generado, concatenando texto
                                                   │
                                                   ▼
                          extractKeywords(texto): top 15 sin stopwords
                                                   │
                                                   ▼
              markDocumentIndexed(id, { extractedText, keywords })
              (o markDocumentIndexFailed(id) si todo falla)
                                                   │
                                                   ▼
                          syncDocumentFts(id) → documents_fts
```

No se usa una cola con broker externo porque el volumen esperado es bajo
(ya establecido en el spec original del visor); el indexado corre en el
mismo proceso Node de larga duración sin bloquear la respuesta HTTP de
subida.

**Nuevos módulos:**
- `app/lib/text-extract.server.ts`: `extractTextFromPdf(pdfPath):
  Promise<string>` (usa `pdf-parse`); `extractTextViaOcr(documentId,
  pageCount): Promise<string>` (usa `tesseract.js` con `lang: "spa+eng"`
  sobre los PNG ya generados).
- `app/lib/keywords.server.ts`: `extractKeywords(text: string): string[]`
  (usa `natural`: tokenizador + stopwords español/inglés + conteo de
  frecuencia, retorna top 15).

## Modelo de datos

Nuevas columnas en `documents`, agregadas por la misma migración
automática ya establecida en `createDb()` (revisa `PRAGMA table_info` y
agrega lo que falte en cada arranque):
```sql
ALTER TABLE documents ADD COLUMN extracted_text TEXT;
ALTER TABLE documents ADD COLUMN keywords TEXT;
ALTER TABLE documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending';
```
`index_status` (`'pending' | 'indexed' | 'failed'`) es independiente del
`status` existente (`processing`/`ready`/`error`, que trackea la
conversión a imágenes): un documento puede ser `status='ready'` (visible)
mientras su `index_status` sigue `'pending'` (aún no buscable).

Tabla virtual FTS5:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_id UNINDEXED,
  title,
  description,
  extracted_text,
  keywords
);
```
Sincronizada manualmente (sin triggers): `syncDocumentFts(conn, id)` hace
`DELETE FROM documents_fts WHERE document_id = ?` seguido de un `INSERT`
con los valores actuales de la fila `documents`. Se llama tanto al crear
el documento (título/descripción buscables de inmediato) como al terminar
el indexado de texto (agrega `extracted_text`/`keywords`).

**Nuevas funciones en `db.server.ts`:**
- `markDocumentIndexed(conn, id, { extractedText, keywords }): void`
- `markDocumentIndexFailed(conn, id): void`
- `syncDocumentFts(conn, id): void`
- `searchReadyDocuments(conn, query: string): DocumentRecord[]` — hace
  `SELECT documents.* FROM documents_fts JOIN documents ON documents.id =
  documents_fts.document_id WHERE documents_fts MATCH ? AND
  documents.status = 'ready' ORDER BY bm25(documents_fts)`, con el término
  saneado a sintaxis FTS5 antes de construir el `MATCH` (cada palabra
  envuelta en comillas dobles, comillas internas escapadas) para que el
  usuario nunca vea un error de sintaxis por escribir caracteres como `"`
  o `*`.

## Buscador en el frontend (`documents-list.tsx`)

Seguimos el patrón ya usado en el proyecto para filtros: `<Form
method="get">` que actualiza la URL, parseada en el loader:
```tsx
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const documents = query ? searchReadyDocuments(db, query) : listReadyDocuments(db);
  return { user, documents, query };
}
```
Un input de búsqueda arriba de la lista existente (dentro del mismo
`AppShell`/`GlassPanel` ya rediseñado), sin JavaScript adicional — React
Router maneja la navegación. Cada documento muestra sus `keywords` como
tags pequeños (mismo lenguaje visual que los badges de estado del panel
admin) para que el usuario entienda por qué apareció un resultado. Sin
resultados con `query` no vacío → "No se encontraron documentos para
«{query}»".

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| `pdf-parse` falla (PDF corrupto/protegido) | Se captura, se trata como "sin texto", cae al fallback de OCR. |
| Tesseract OCR falla en alguna página | Se captura por página; se concatena el texto de las páginas que sí funcionaron; si todas fallan, `index_status='failed'` y el documento no aparece en resultados de búsqueda pero sigue visible/legible normalmente. |
| Término de búsqueda con sintaxis especial de FTS5 (`"`, `*`, `AND`, etc.) | Saneado antes de construir el `MATCH` (ver arriba) — el usuario nunca ve un error de sintaxis. |
| Documento con `index_status='pending'` | Simplemente no aparece en resultados de búsqueda hasta terminar de indexarse; no es un error. |

## Testing

- Unitarias (Vitest): `text-extract.server.ts` (extracción con `pdf-parse`
  sobre un PDF de prueba con texto real generado con `pdf-lib`, igual
  patrón que el test de conversión existente); `keywords.server.ts` (quita
  stopwords y regresa las N palabras más frecuentes de un texto de prueba
  conocido); `db.server.ts` (`syncDocumentFts` + `searchReadyDocuments`
  contra SQLite en memoria, incluyendo el saneo de términos con sintaxis
  FTS5).
- La prueba de OCR real con Tesseract se salta si el idioma/binario no
  está disponible localmente (mismo patrón `describe.skipIf` ya usado en
  `pdf-convert.server.test.ts` para Poppler) y se verifica en Docker,
  donde los `.traineddata` de `spa`+`eng` se incluyen en build-time.
- Verificación manual: subir un PDF con texto real y confirmar que
  aparece en la búsqueda por una palabra de su contenido; subir un PDF
  escaneado (imagen sin texto) y confirmar que el OCR lo indexa
  correctamente en español e inglés mezclado.
