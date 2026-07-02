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
      // Tailwind's Preflight zeroes `margin` on every element (including
      // `<dialog>`), which clobbers the browser's own `dialog:modal { margin:
      // auto }` centering rule — an author-origin reset always wins over a
      // user-agent one regardless of selector specificity. `m-auto` restores it.
      className="m-auto w-full max-w-xl rounded-2xl border border-black/10 bg-white p-6 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#141414]"
    >
      {children}
    </dialog>
  );
}
