import { FileText } from "lucide-react";

export function DocumentThumbnail() {
  return (
    <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-500/[0.03] dark:from-accent-400/10 dark:to-transparent">
      <FileText
        size={36}
        strokeWidth={1.5}
        className="text-accent-500/60 transition-transform group-hover:scale-110 dark:text-accent-400/60"
      />
      <span className="absolute right-0 top-0 h-0 w-0 border-b-[16px] border-l-[16px] border-b-transparent border-l-black/[0.06] dark:border-l-white/[0.08]" />
      <span className="absolute bottom-2 right-2 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
        PDF
      </span>
    </div>
  );
}
