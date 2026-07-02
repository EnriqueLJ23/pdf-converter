import { useEffect, useState } from "react";
import {
  FileText,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINK_CLASSES =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-black/70 transition-colors hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5";

export function AppShell({
  user,
  children,
}: {
  user?: { name: string; isAdmin: boolean };
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebarCollapsed", String(next));
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={`flex shrink-0 flex-col justify-between border-r border-black/5 bg-white/70 backdrop-blur-xl transition-[width] dark:border-white/10 dark:bg-black/50 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div>
          <div className="flex items-center justify-between px-3 py-4">
            {!collapsed && (
              <span className="text-lg font-semibold tracking-tight">
                Documentos
              </span>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black/60 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          </div>

          <nav className="flex flex-col gap-1 px-2">
            <Link
              to="/documentos"
              className={NAV_LINK_CLASSES}
              title="Documentos"
            >
              <FileText size={18} />
              {!collapsed && <span>Documentos</span>}
            </Link>

            {user?.isAdmin && (
              <>
                <div className="my-2 border-t border-black/5 dark:border-white/10" />
                {!collapsed && (
                  <span className="px-3 text-xs font-medium tracking-wide text-black/40 uppercase dark:text-white/30">
                    Admin
                  </span>
                )}
                <Link
                  to="/admin/upload"
                  className={NAV_LINK_CLASSES}
                  title="Subir documento"
                >
                  <Upload size={18} />
                  {!collapsed && <span>Subir documento</span>}
                </Link>
                <Link
                  to="/admin/documentos"
                  className={NAV_LINK_CLASSES}
                  title="Administrar documentos"
                >
                  <FolderOpen size={18} />
                  {!collapsed && <span>Administrar documentos</span>}
                </Link>
                <Link
                  to="/admin/categorias"
                  className={NAV_LINK_CLASSES}
                  title="Categorías"
                >
                  <Tags size={18} />
                  {!collapsed && <span>Categorías</span>}
                </Link>
              </>
            )}
          </nav>
        </div>

        {user && (
          <div className="flex flex-col gap-2 border-t border-black/5 p-3 dark:border-white/10">
            {!collapsed && (
              <span className="truncate px-1 text-sm text-black/60 dark:text-white/50">
                {user.name}
              </span>
            )}
            <div
              className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}
            >
              <ThemeToggle />
              <Link
                to="/logout"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/70 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
              >
                <LogOut size={16} />
              </Link>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
