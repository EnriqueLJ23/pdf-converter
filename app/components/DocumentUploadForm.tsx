import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { Button } from "./Button";
import { LANGUAGE_LABELS, t } from "~/lib/i18n";
import type { Language } from "~/lib/i18n";
import type { CategoryRecord } from "~/lib/db.server";

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
  createReader(): FileSystemDirectoryReaderLike;
}

interface FileSystemDirectoryReaderLike {
  readEntries(
    success: (entries: FileSystemEntryLike[]) => void,
    error?: (err: unknown) => void,
  ): void;
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
    if (relativePath.toLowerCase().endsWith(".pdf")) {
      out.push(new File([file], relativePath, { type: file.type }));
    }
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    let batch: FileSystemEntryLike[];
    do {
      batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of batch) {
        await walkEntry(child, newPrefix, out);
      }
    } while (batch.length > 0);
  }
}

async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items);
  // Entries/files must be captured synchronously, before any `await` — browsers
  // invalidate the DataTransfer as soon as the drop handler yields control, so
  // resolving them lazily inside the loop below would silently return nothing
  // for every item after the first. Cast past lib.dom's FileSystemEntry (which
  // lacks .file()/.createReader() on the base type) to our narrower interface.
  const entries = items.map(
    (item) => (item.webkitGetAsEntry?.() ?? null) as FileSystemEntryLike | null,
  );
  const fallbackFiles = items.map((item, i) => (entries[i] ? null : item.getAsFile()));

  const out: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = entries[i];
    if (entry) {
      await walkEntry(entry, "", out);
    } else {
      const file = fallbackFiles[i];
      if (file && file.name.toLowerCase().endsWith(".pdf")) out.push(file);
    }
  }
  return out;
}

const inputClasses =
  "rounded-lg border border-black/10 bg-black/[0.03] p-2 text-sm outline-none focus:ring-2 focus:ring-accent-500 dark:border-white/10 dark:bg-white/[0.05]";

export function DocumentUploadForm({
  categories,
  language,
  onCancel,
}: {
  categories: CategoryRecord[];
  language: Language;
  onCancel: () => void;
}) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const submitInputRef = useRef<HTMLInputElement>(null);

  const fileCount = selectedNames.length;
  const folderName = selectedNames.find((name) => name.includes("/"))?.split("/")[0] ?? "";
  const isSingleFile = fileCount === 1 && !folderName;
  const singleFileTitle = isSingleFile ? selectedNames[0].replace(/\.pdf$/i, "") : "";

  function applyFiles(files: File[]) {
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    const dataTransfer = new DataTransfer();
    for (const file of pdfFiles) {
      dataTransfer.items.add(file);
    }
    if (submitInputRef.current) submitInputRef.current.files = dataTransfer.files;
    setSelectedNames(pdfFiles.map((file) => file.name));
  }

  function handlePickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    applyFiles(Array.from(event.currentTarget.files ?? []));
  }

  function handlePickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    const renamed = selected.map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return new File([file], relativePath, { type: file.type });
    });
    applyFiles(renamed);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const files = await collectFilesFromDataTransfer(event.dataTransfer);
    applyFiles(files);
  }

  return (
    <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="upload" />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-accent-500 bg-accent-500/5" : "border-black/10 dark:border-white/10"
        }`}
      >
        <UploadCloud size={28} className="text-black/40 dark:text-white/30" />
        <p className="text-sm text-black/60 dark:text-white/50">{t(language, "upload.dropHint")}</p>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => filesInputRef.current?.click()}
            className="text-accent-600 underline dark:text-accent-400"
          >
            {t(language, "upload.chooseFiles")}
          </button>
          <span className="text-black/30 dark:text-white/20">{t(language, "upload.orText")}</span>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="text-accent-600 underline dark:text-accent-400"
          >
            {t(language, "upload.chooseFolder")}
          </button>
        </div>
        <input
          ref={filesInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={handlePickFiles}
        />
        <input
          ref={folderInputRef}
          type="file"
          hidden
          onChange={handlePickFolder}
          {...{ webkitdirectory: "", directory: "" }}
        />
        <input ref={submitInputRef} type="file" name="files" hidden />
      </div>

      {fileCount > 0 && (
        <p className="text-sm text-black/60 dark:text-white/50">
          {folderName
            ? t(language, "upload.filesSummaryFolder")
                .replace("{count}", String(fileCount))
                .replace("{folder}", folderName)
            : t(language, "upload.filesSummary").replace("{count}", String(fileCount))}
        </p>
      )}

      {isSingleFile && (
        <>
          <label className="flex flex-col gap-1 text-sm" key={`title-${singleFileTitle}`}>
            {t(language, "upload.titleLabel")}
            <input type="text" name="title" defaultValue={singleFileTitle} className={inputClasses} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t(language, "upload.descriptionLabel")}
            <textarea name="description" className={inputClasses} />
          </label>
        </>
      )}

      {!folderName && (
        <label className="flex flex-col gap-1 text-sm">
          {t(language, "upload.categoryLabel")}
          <select name="categoryId" defaultValue="" className={inputClasses}>
            <option value="">{t(language, "upload.noCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t(language, "upload.languageLabel")}
        <select name="language" defaultValue="es" className={inputClasses}>
          <option value="es">{LANGUAGE_LABELS.es}</option>
          <option value="ja">{LANGUAGE_LABELS.ja}</option>
        </select>
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t(language, "upload.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting || fileCount === 0}>
          {isSubmitting ? t(language, "upload.submitting") : t(language, "adminList.addDocument")}
        </Button>
      </div>
    </Form>
  );
}
