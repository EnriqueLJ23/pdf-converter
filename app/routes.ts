import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("logout", "routes/logout.tsx"),
  route("admin/upload", "routes/admin-upload.tsx"),
  route("admin/documentos", "routes/admin-documents-list.tsx"),
  route("documentos", "routes/documents-list.tsx"),
  route("documentos/:id", "routes/document-viewer.tsx"),
] satisfies RouteConfig;
