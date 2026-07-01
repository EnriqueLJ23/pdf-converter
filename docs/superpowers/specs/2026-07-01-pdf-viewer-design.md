# Visor de PDFs de solo lectura (read-only PDF viewer)

**Fecha:** 2026-07-01
**Estado:** Aprobado, listo para plan de implementación

## Contexto y objetivo

Un usuario interno de la empresa quiere compartir documentos PDF con otros
usuarios de la organización sin que puedan descargarlos, editarlos, ni
imprimirlos. El usuario final no tiene conocimientos técnicos, por lo que las
medidas de protección se enfocan en un usuario normal (sin botones de
descarga/impresión, sin texto seleccionable, sin clic derecho) y **no**
intentan ser una protección criptográfica a prueba de un usuario técnico
(capturas de pantalla, interceptación de tráfico, DevTools). Ese riesgo
residual es aceptado explícitamente por el negocio.

Cada página del PDF se renderiza como imagen (mismo enfoque que usa
Archive.org), de modo que no existe texto real en el DOM que copiar ni un
archivo PDF descargable en ningún momento del flujo del visor.

## Alcance de esta fase

Incluido:
- Login vía SSO con Azure AD / Microsoft Entra ID (OIDC).
- Rol admin (puede subir documentos) determinado por pertenencia a un grupo
  de Entra ID; cualquier otro usuario autenticado tiene rol de solo lectura.
- Acceso a documentos a nivel de organización completa: cualquier usuario
  autenticado puede ver cualquier documento subido (sin listas de permisos
  por documento).
- Panel de administración para subir un PDF (título + descripción).
- Conversión síncrona del PDF a imágenes PNG por página (Poppler /
  `pdftoppm`).
- Almacenamiento en disco local (volumen Docker) tanto para el PDF original
  como para las imágenes generadas.
- Metadatos de documentos y usuarios en SQLite (`better-sqlite3`).
- Visor de solo lectura con medidas anti-copia básicas (sin descarga, sin
  impresión, sin selección de texto, sin clic derecho).

Explícitamente fuera de alcance en esta fase (anotado para una fase 2 si el
requisito de seguridad sube de nivel):
- Watermark dinámico (nombre/fecha del usuario sobre cada página).
- URLs de imagen con token firmado de expiración corta.
- Permisos por documento (compartir solo con ciertos usuarios/grupos).
- Conversión en background/cola (el volumen esperado es bajo: "pocos
  documentos, uso interno moderado").
- Integración con SharePoint/OneDrive como origen de los PDFs.

## Arquitectura

```
Usuario ──HTTPS──▶ React Router 8 (SSR, Node 24/Alpine, Docker)
                        │
                        ├─▶ /login, /auth/callback  → openid-client contra Entra ID
                        │                              (Authorization Code + PKCE)
                        │
                        ├─▶ /admin/upload (solo rol admin)
                        │        │
                        │        ▼
                        │   guarda PDF original en /data/documents/<id>/original.pdf
                        │        │
                        │        ▼
                        │   pdftoppm (Poppler, child_process) → PNG por página
                        │        │
                        │        ▼
                        │   /data/documents/<id>/pages/page-0001.png ...
                        │        │
                        │        ▼
                        │   INSERT/UPDATE en SQLite (documents)
                        │
                        ├─▶ /documentos          → lista (cualquier usuario autenticado)
                        │
                        └─▶ /documentos/:id      → visor (imágenes por página, sin descarga)
                                 │
                                 ▼
                         GET /documentos/:id/pagina/:n → sirve el PNG (requiere sesión)
```

Todo corre en un solo contenedor: el proceso SSR de React Router, el binario
`pdftoppm` invocado como subproceso, el volumen de disco (`/data`) y el
archivo SQLite (`/data/app.db`). El `Dockerfile` existente necesita una
línea adicional: `RUN apk add --no-cache poppler-utils`.

## Modelo de datos (SQLite)

```sql
users (
  id            TEXT PRIMARY KEY,   -- oid (object id) del token de Entra ID
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_admin      INTEGER NOT NULL,   -- recalculado en cada login desde el claim de grupo
  last_login_at TEXT NOT NULL
)

documents (
  id            TEXT PRIMARY KEY,   -- uuid, también nombre de carpeta en /data/documents
  title         TEXT NOT NULL,
  description   TEXT,
  page_count    INTEGER NOT NULL,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL,      -- 'processing' | 'ready' | 'error'
  error_message TEXT                -- solo si status = 'error'
)
```

No existe tabla de permisos por documento: el acceso es "cualquier usuario
autenticado de la empresa ve cualquier documento en estado `ready`".
`is_admin` se recalcula en cada login leyendo el claim de grupo del token de
Entra ID, así que si a un usuario le quitan el grupo, pierde el rol admin en
su siguiente login sin sincronización manual.

## Autenticación (Azure AD / Entra ID vía OIDC)

1. `GET /login` redirige al endpoint de autorización de Entra ID
   (`response_type=code`, PKCE, `scope=openid profile email`, con el claim
   de grupos habilitado en el App Registration).
2. Entra ID autentica y redirige a `GET /auth/callback?code=...`.
3. El callback intercambia el código por tokens, valida el ID token y
   extrae `oid`, `email`, `name` y el claim `groups`.
4. `is_admin = groups.includes(ENTRA_ADMIN_GROUP_ID)` (el GUID del grupo
   admin vive en una variable de entorno).
5. Upsert del usuario en `users`, y creación de una cookie de sesión
   httpOnly, firmada y `Secure` (vía `createCookieSessionStorage` de React
   Router) con `{ userId, email, name, isAdmin }`. No hay JWT propio ni
   refresh tokens gestionados a mano: la cookie de sesión de React Router
   es la única fuente de verdad de sesión.
6. Helpers `requireUser()` / `requireAdmin()` se usan en cada loader/action
   protegido: redirigen a `/login` si no hay sesión válida, o responden 403
   si se requiere admin y el usuario no lo es.

Variables de entorno: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`,
`ENTRA_CLIENT_SECRET`, `ENTRA_ADMIN_GROUP_ID`, `SESSION_SECRET`,
`APP_BASE_URL`.

## Estructura de rutas (React Router 8, framework mode)

```
app/routes/
  login.tsx                    # GET → redirect a Entra ID
  auth.callback.tsx            # GET → intercambia code, crea sesión, redirect a /documentos
  logout.tsx                   # POST → destruye sesión

  documentos._index.tsx        # lista de documentos (requireUser)
  documentos.$id.tsx           # visor (requireUser) — solo shell + <img> por página
  documentos.$id.pagina.$n.tsx # loader que sirve el binario PNG (requireUser), sin caché

  admin.upload.tsx             # form de subida + dispara conversión (requireAdmin)
  admin.documentos._index.tsx  # lista/administración de docs propios (requireAdmin)

app/lib/
  auth.server.ts               # openid-client, requireUser, requireAdmin, session storage
  db.server.ts                 # conexión better-sqlite3 + queries
  pdf-convert.server.ts        # invoca pdftoppm, guarda páginas, actualiza status
  storage.server.ts            # rutas de disco (/data/documents/<id>/...)
```

Los archivos `.server.ts` siguen la convención de React Router para código
que nunca se incluye en el bundle de cliente (DB, filesystem,
`child_process`, secretos de OIDC).

## Flujo de subida y conversión

1. El admin llena un formulario (`title`, `description`, archivo PDF) vía
   `multipart/form-data` en `admin.upload.tsx`.
2. La action valida que sea un PDF real (magic bytes `%PDF-`) y que no
   exceda un tamaño máximo configurable (por defecto 50MB).
3. Se genera un `uuid`, se crea `/data/documents/<uuid>/original.pdf`, y se
   inserta en `documents` con `status='processing'`.
4. La conversión corre **síncronamente dentro de la misma action** (sin
   cola, dado el volumen bajo esperado):
   ```
   pdftoppm -png -r 150 original.pdf pages/page
   ```
5. Se cuentan las páginas generadas, se actualiza `page_count` y
   `status='ready'`.
6. Si `pdftoppm` falla o excede un timeout (30s), `status='error'` y
   `error_message` guarda el detalle; el documento no aparece en
   `/documentos` para usuarios normales, solo en el panel admin.
7. Redirect a `/admin/documentos` con mensaje de éxito.

Si el volumen crece en el futuro, este es el único punto que habría que
mover a un worker/cola en background — ya está aislado en
`pdf-convert.server.ts`.

## El visor

- `documentos.$id.tsx` renderiza solo la página actual: cada `<img>` apunta
  a `/documentos/:id/pagina/:n`.
- El loader de `documentos.$id.pagina.$n.tsx` verifica sesión, verifica que
  el documento existe y está `ready`, y transmite el PNG desde disco con:
  ```
  Content-Type: image/png
  Cache-Control: private, no-store
  Content-Disposition: inline
  ```
- Navegación: botones anterior/siguiente + input de número de página.
  Precarga solo de la página `n+1` (no se descarga el documento completo de
  una vez).

### Medidas anti-copia (nivel básico)

- `onContextMenu` bloqueado en el contenedor del visor (sin "Guardar imagen
  como" del menú de clic derecho).
- `user-select: none` vía CSS en todo el visor.
- `draggable={false}` en cada `<img>`.
- Listener de `keydown` que bloquea `Ctrl+P` y `Ctrl+S` mientras el visor
  está montado, con un aviso de "documento de solo lectura".
- `@media print { body { display: none } }` como respaldo ante impresión
  forzada.
- Ningún botón de descarga en la UI del visor.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Login falla / callback inválido | Redirect a `/login` con mensaje de error. |
| Sesión ausente en ruta protegida | Redirect 302 a `/login`, preservando la URL destino. |
| No-admin en `/admin/*` | 403. |
| Archivo subido no es PDF válido | Error de validación en el form, sin tocar disco/DB. |
| `pdftoppm` falla o timeout | `status='error'` + `error_message`; oculto para usuarios normales. |
| Página fuera de rango | 404. |
| Documento en `processing`/`error` pedido por usuario normal | 404 (no se revela su existencia hasta `ready`). |
| Disco lleno / error de escritura | Se captura, `status='error'`, rollback del insert si aplica, log en consola del servidor. |

## Estrategia de pruebas

- **Unitarias** (Vitest): `pdf-convert.server.ts` (parseo del output de
  `pdftoppm`, conteo de páginas), `auth.server.ts` (`requireUser`/
  `requireAdmin` con sesiones mockeadas), queries de `db.server.ts` contra
  SQLite en memoria.
- **Integración**: rutas de React Router con un PDF fixture real (2-3
  páginas) ejecutando `pdftoppm` de verdad, cubriendo el pipeline completo
  subida → conversión → listado → visor.
- **Manual/exploratoria** antes de cerrar la implementación: login con
  cuenta de prueba de Entra ID, subida como admin, verificar que un usuario
  no-admin ve el documento sin botones de descarga/impresión, confirmar
  que clic derecho y Ctrl+P están bloqueados, y confirmar que
  `/documentos/:id/pagina/:n` responde 401/302 sin sesión.

Fuera de alcance: pruebas de carga/performance (volumen bajo esperado) y
pentesting formal (la protección es disuasoria para usuarios sin
conocimientos técnicos, no criptográfica — riesgo aceptado por el negocio).

## Decisiones técnicas y alternativas consideradas

- **Conversión PDF→imagen:** Poppler (`pdftoppm`) sobre Ghostscript o
  `pdfjs-dist` + `node-canvas`. Razón: una sola línea en el Dockerfile
  (`apk add poppler-utils`), rápido, y es el mismo enfoque que usa
  Archive.org. `node-canvas` requeriría compilar dependencias nativas
  (cairo) igualmente, sin ganar portabilidad real.
- **Metadatos:** SQLite (`better-sqlite3`) sobre archivos JSON sueltos o
  Postgres/MySQL. Razón: coherente con "todo en disco local", cero
  infraestructura adicional, consultas y transacciones reales; JSON
  sueltos tendrían condiciones de carrera al escribir concurrentemente, y
  Postgres es infraestructura injustificada para el volumen esperado.
- **Sesión/auth:** `openid-client` + cookie de sesión firmada de React
  Router, sobre `@azure/msal-node`. Razón: Entra ID expone un endpoint OIDC
  estándar, así que no se pierde compatibilidad, y se evita la gestión de
  cache de tokens propia de MSAL que hay que integrar a mano en SSR.
