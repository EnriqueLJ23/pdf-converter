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
