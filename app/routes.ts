import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("logout", "routes/logout.tsx"),
  route("admin/documentos", "routes/admin-documents-list.tsx"),
  route("admin/documentos/:id", "routes/admin-document-edit.tsx"),
  route("documentos", "routes/documents-list.tsx"),
  route("documentos/sugerencias", "routes/documentos-sugerencias.tsx"),
  route("idioma", "routes/set-language.tsx"),
  route("documentos/:id", "routes/document-viewer.tsx"),
  route("documentos/:id/pagina/:n", "routes/document-page-image.tsx"),
] satisfies RouteConfig;
