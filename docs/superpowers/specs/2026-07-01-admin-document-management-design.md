# Administración completa de documentos (borrar, editar metadata, categorías)

**Fecha:** 2026-07-01
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

El admin necesita gestionar completamente los documentos ya subidos: poder
borrarlos, editar su título/descripción, y organizarlos en categorías para
facilitar su localización. Las categorías son puramente organizativas — no
cambian el modelo de acceso ya decidido (cualquier usuario autenticado ve
cualquier documento `ready`; no hay permisos por documento ni por grupo de
Entra ID sobre documentos individuales).

**Secuencia con el rediseño en curso:** el rediseño visual (glassmorphism,
`docs/superpowers/plans/2026-07-01-vercel-glassmorphism-redesign.md`) debe
terminarse **antes** de construir esta funcionalidad, para que las páginas
nuevas de esta feature (`admin-categorias.tsx`, `admin-document-edit.tsx`)
usen desde el inicio los componentes compartidos (`GlassPanel`, `Button`,
`AppShell`) en vez de tener que restilizarlas después.

## Alcance

Incluido:
- Borrado permanente de un documento: elimina el registro de la base de
  datos y los archivos de disco (`original.pdf` + carpeta `pages/`). Sin
  confirmación de servidor — un `confirm()` de navegador antes de enviar el
  formulario es suficiente para esta herramienta interna de admins.
- Edición de metadata: título, descripción, categoría.
- Categorías: lista predefinida, gestionada por el admin en su propia
  pantalla (crear / borrar). Un documento pertenece a **una sola categoría**
  o ninguna ("sin categoría").
- Borrar una categoría con documentos asignados no falla: esos documentos
  quedan sin categoría (`ON DELETE SET NULL` a nivel de base de datos).
- Los usuarios normales ven la categoría de cada documento y los documentos
  se agrupan por categoría en `/documentos`.
- Migración automática del esquema de SQLite al iniciar la app, para que
  la base de datos ya desplegada en producción reciba la columna nueva sin
  intervención manual.

Explícitamente fuera de alcance:
- Cualquier cambio al modelo de acceso (quién puede *ver* un documento
  sigue siendo "cualquier usuario autenticado", sin importar su categoría).
- Múltiples categorías por documento.
- Borrado suave/archivado (es borrado permanente, sin papelera de
  reciclaje ni posibilidad de deshacer).
- Renombrar/editar una categoría existente (por ahora solo crear/borrar;
  renombrar queda para una fase futura si hace falta).

## Modelo de datos y migración

Nueva tabla:
```sql
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
)
```

Nueva columna en `documents`, agregada por migración automática (ver
abajo):
```sql
category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
```

`createDb()` debe habilitar `PRAGMA foreign_keys = ON` (actualmente no
está activado) para que `ON DELETE SET NULL` se aplique de verdad.

**Migración automática:** en `createDb()`, después de los `CREATE TABLE IF
NOT EXISTS` existentes, se ejecuta `PRAGMA table_info(documents)`; si el
resultado no incluye una columna `category_id`, se corre:
```sql
ALTER TABLE documents ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
```
Esto corre en cada arranque del proceso Node (barato: una sola query de
metadata contra una tabla con pocas filas), así que el próximo redeploy en
producción trae la columna nueva automáticamente, sin tocar la base de
datos a mano en la VM.

## Rutas y componentes

**Nuevas rutas:**
- `admin/categorias` (`app/routes/admin-categorias.tsx`): lista de
  categorías existentes en un `GlassPanel`, formulario para crear una
  nueva, y un botón "Eliminar" por categoría (con `confirm()` del
  navegador). Un solo `action` distingue `intent: "create" | "delete"` vía
  un campo oculto del formulario.
- `admin/documentos/:id` (`app/routes/admin-document-edit.tsx`): formulario
  para editar título, descripción y categoría (`<select>` poblado con
  `listCategories()`), más un botón separado "Eliminar documento" (con su
  propio `confirm()`). Mismo patrón de `intent` oculto: `"update"` guarda
  metadata, `"delete"` borra el registro de la DB y los archivos de disco,
  luego redirige a `/admin/documentos`.

**Modificaciones a rutas existentes:**
- `app/routes/admin-documents-list.tsx`: cada fila se convierte en un link
  a `/admin/documentos/:id`; se muestra la categoría del documento si
  tiene.
- `app/routes/admin-upload.tsx`: se agrega un `<select>` opcional de
  categoría, poblado igual desde `listCategories()`, pasado a
  `createDocument`.
- `app/routes/documents-list.tsx`: los documentos se agrupan por categoría
  (una sección con encabezado por categoría, más una sección final "Sin
  categoría" si aplica).

**Nuevas funciones en `app/lib/db.server.ts`:**
- `createCategory(conn, { id, name }): CategoryRecord`
- `listCategories(conn): CategoryRecord[]`
- `deleteCategory(conn, id): void`
- `updateDocumentMetadata(conn, id, { title, description, categoryId }): void`
- `deleteDocumentRecord(conn, id): void` (solo el registro; borrar los
  archivos de disco es responsabilidad de la ruta, vía
  `storage.server.ts`)
- `DocumentRecord` gana `categoryId: string | null`; las funciones de
  lectura (`listReadyDocuments`, `listAllDocuments`, `getDocumentById`)
  hacen `LEFT JOIN categories` y agregan `categoryName: string | null`.

## Testing

- Unitarias (Vitest) en `db.server.test.ts`: crear/listar/borrar
  categorías; que borrar una categoría con documentos asignados deja
  `category_id = NULL` en esos documentos (verifica el `ON DELETE SET
  NULL`); `updateDocumentMetadata` actualiza los campos correctos;
  `deleteDocumentRecord` remueve la fila.
- Sin pruebas automatizadas para las rutas nuevas de edición/borrado/
  categorías — son glue code sobre funciones ya probadas en
  `db.server.ts`, igual que `admin-upload.tsx`. Verificación manual en el
  navegador: crear una categoría, subir un documento asignándola, editarla
  desde `/admin/documentos/:id`, borrar la categoría y confirmar que el
  documento queda "sin categoría", y borrar el documento y confirmar que
  desaparece de `/documentos` y que `/data/documents/<id>` ya no existe en
  disco.
