# Unificación de la UI de administración

**Fecha:** 2026-07-02
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

Hoy el área de admin tiene tres pantallas separadas (`admin/upload`,
`admin/categorias`, `admin/documentos`) con dos formularios de subida
distintos. El objetivo es unificar todo en una sola pantalla,
`admin/documentos`, que se vea como un explorador de archivos (misma
tarjeta con ícono de PDF que ya usa `/documentos`), agrupado por
categoría, con un único formulario de subida simplificado accesible
desde un diálogo y soporte de drag-and-drop de archivos o carpetas.

## Alcance

Incluido:
- Eliminar `admin/upload` y `admin/categorias` como páginas y enlaces
  de navegación independientes. `admin/documentos` pasa a ser la única
  pantalla de administración de documentos y categorías.
- Botón "Agregar documento" en `admin/documentos` que abre un diálogo
  (`<dialog>` nativo) con el formulario de subida unificado.
- Un solo formulario de subida (reemplaza los dos formularios actuales
  de "archivo único" y "carpeta como categoría"):
  - Un único dropzone acepta drag-and-drop de un archivo, varios
    archivos, o una carpeta completa (incluyendo subcarpetas
    anidadas), además de dos enlaces de selección por click ("Elegir
    archivo(s)" / "Elegir carpeta").
  - Exactamente un archivo suelto (no proveniente de una carpeta):
    muestra Título (default: nombre del archivo, editable),
    Descripción opcional, y un `<select>` de categoría.
  - Varios archivos o una carpeta: esos campos se ocultan; el título
    de cada documento se deriva de su nombre de archivo; la categoría
    se deriva del nombre de la carpeta si vino de una carpeta, o del
    `<select>` manual si son archivos sueltos.
  - Selector de idioma (`es`/`ja`), igual que hoy, aplicado a todo el
    lote subido.
- Al enviar el formulario con éxito, el `redirect` existente hacia
  `/admin/documentos` cierra el diálogo y refresca la lista (no se
  necesita revalidación manual vía fetcher).
- `admin/documentos` muestra los documentos como tarjetas con ícono de
  PDF (mismo estilo visual que `/documentos`), agrupados en secciones
  por categoría (orden alfabético) más una sección final "Sin
  categoría".
- Cada sección de categoría tiene un botón de borrar (con
  confirmación), igual que la pantalla de categorías actual.
- Un formulario inline persistente en la parte superior de la página
  para crear una categoría nueva (nombre + botón "Crear").
- Cada tarjeta de documento en admin gana un `<select>` de categoría
  que reasigna el documento inmediatamente al cambiar de valor (sin
  navegar), y un enlace "Editar" hacia `/admin/documentos/:id` (la
  página de edición completa, sin cambios) para título/descripción/
  idioma/borrado.
- `app/lib/upload-document.server.ts` nuevo: mueve `storeAndConvertPdf`
  fuera de la ruta, ya que la ruta ahora también maneja categorías.
- `updateDocumentCategory(conn, id, categoryId)` nuevo en
  `db.server.ts`: reasignación de categoría sin tener que reenviar
  título/descripción/idioma.
- `DocumentThumbnail` nuevo (`app/components/DocumentThumbnail.tsx`):
  el ícono de PDF con la esquina doblada y el badge "PDF", extraído
  para que `/documentos` y `admin/documentos` no dupliquen ese
  bloque de estilos. El resto de la tarjeta (el contenedor, si es o no
  un `<Link>` completo) se queda específico de cada página.

Explícitamente fuera de alcance:
- Selección múltiple / asignación de categoría en lote (la asignación
  es un documento a la vez, vía el `<select>` de su tarjeta).
- Renombrar una categoría existente (sigue sin existir, igual que
  hoy).
- Cambiar `/admin/documentos/:id` (la página de edición completa) —
  sigue existiendo tal cual, sólo deja de ser la única forma de
  cambiar la categoría de un documento.
- Cambiar el comportamiento de `/documentos` (la vista de usuarios no
  admin) más allá de extraer `DocumentThumbnail` para reutilizarlo.

## Formulario de subida: drag-and-drop de carpetas

El drop de una carpeta se resuelve client-side con
`DataTransferItem.webkitGetAsEntry()` y una caminata recursiva del
árbol de directorios vía `FileSystemDirectoryReader.readEntries()`
(debe llamarse repetidamente hasta que devuelva un arreglo vacío, ya
que no garantiza devolver todas las entradas en una sola llamada).
Cada archivo encontrado se envuelve en un `File` nuevo cuyo `.name` es
la ruta relativa completa dentro de la carpeta soltada (p.ej.
`"Facturas/2024/enero.pdf"`) — exactamente el mismo formato que ya
produce el input `webkitdirectory` de selección por click. Esto
significa que el parseo server-side (que día ya distingue "vino de una
carpeta" por la presencia de `/` en el nombre) no cambia en absoluto:
drag-and-drop y click-to-browse convergen en el mismo `File[]` antes de
enviarse.

## Acción unificada de `admin/documentos`

Un solo `action` en `admin-documents-list.tsx`, con un campo oculto
`intent` que distingue:
- `upload`: la lógica que hoy vive en el branch `"folder"` de
  `admin-upload.tsx`, generalizada — un archivo suelto es simplemente
  el caso `segments.length === 1`. Cuando `files.length === 1` y el
  archivo no vino de una carpeta, usa el Título/Descripción del
  formulario en vez de derivarlos del nombre de archivo, y usa el
  `<select>` de categoría manual en vez de `findOrCreateCategoryByName`.
- `createCategory`: igual que hoy en `admin-categorias.tsx`.
- `deleteCategory`: igual que hoy en `admin-categorias.tsx`.
- `assignCategory`: nuevo — recibe `documentId` y `categoryId` (puede
  ser cadena vacía = sin categoría), llama a
  `updateDocumentCategory(db, documentId, categoryId || null)`.

## Testing

- Unitarias (Vitest) en `db.server.test.ts`: `updateDocumentCategory`
  cambia sólo `category_id` y deja el resto de los campos intactos.
- Sin pruebas automatizadas para el drag-and-drop (requiere un DOM real
  con `DataTransfer`/`FileSystemEntry`, que jsdom no implementa) — se
  verifica manualmente en navegador. El resto de las rutas sigue el
  mismo criterio que el resto del proyecto (sin tests de rutas, sólo
  verificación manual): crear una categoría desde el formulario
  inline, subir un archivo suelto con Título editado, arrastrar una
  carpeta con subcarpetas y confirmar que todos los PDFs aparecen bajo
  la categoría correcta, reasignar un documento con el `<select>` de su
  tarjeta y confirmar que se mueve de sección sin recargar la página,
  borrar una categoría y confirmar que sus documentos quedan en "Sin
  categoría".
