import type { ReactNode, Ref } from "react";

export function Dialog({
  ref,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      className="w-full max-w-xl rounded-2xl border border-black/10 bg-white p-6 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#141414]"
    >
      {children}
    </dialog>
  );
}
