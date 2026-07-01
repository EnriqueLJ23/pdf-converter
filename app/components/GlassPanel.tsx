import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-black/5 bg-white/70 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_30px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </div>
  );
}
