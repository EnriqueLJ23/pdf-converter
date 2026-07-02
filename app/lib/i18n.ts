export type Language = "es" | "ja";

export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  ja: "日本語",
};

export const translations = {
  es: {
    "nav.documents": "Documentos",
    "nav.adminSection": "Admin",
    "nav.upload": "Subir documento",
    "nav.manage": "Administrar documentos",
    "nav.categories": "Categorías",
    "nav.collapse": "Colapsar menú",
    "nav.expand": "Expandir menú",
    "nav.logout": "Cerrar sesión",
    "nav.themeToggle": "Cambiar tema",

    "common.back": "← Volver",
    "common.pageSingular": "página",
    "common.pagePlural": "páginas",
    "common.titleRequired": "El título es obligatorio.",

    "documents.title": "Documentos",
    "documents.searchPlaceholder": "Buscar por título, descripción o contenido...",
    "documents.emptyNoQuery": "Todavía no hay documentos disponibles.",
    "documents.emptyQuery": "No se encontraron documentos para «{query}».",

    "viewer.prevPage": "Página anterior",
    "viewer.nextPage": "Página siguiente",
    "viewer.pageIndicator": "Página {page} de {total}",
    "viewer.zoomOut": "Reducir zoom",
    "viewer.zoomIn": "Aumentar zoom",
    "viewer.resetZoom": "Restablecer zoom",
    "viewer.notFound": "Documento no encontrado",

    "upload.pageTitle": "Subir documento",
    "upload.titleLabel": "Título",
    "upload.descriptionLabel": "Descripción (opcional)",
    "upload.categoryLabel": "Categoría (opcional)",
    "upload.noCategory": "Sin categoría",
    "upload.languageLabel": "Idioma",
    "upload.fileLabel": "Archivo PDF",
    "upload.submit": "Subir",
    "upload.submitting": "Subiendo...",
    "upload.fileRequired": "Selecciona un archivo PDF.",
    "upload.fileTooLarge": "El archivo excede el tamaño máximo permitido.",
    "upload.invalidPdf": "El archivo no es un PDF válido.",
    "upload.folderTitle": "Subir carpeta como categoría",
    "upload.folderDescription":
      "Selecciona una carpeta con archivos PDF. El nombre de la carpeta se usará como categoría y cada PDF dentro se subirá con esa categoría automáticamente.",
    "upload.folderLabel": "Carpeta",
    "upload.folderSummary": "{count} archivo(s) PDF en la carpeta {folder}.",
    "upload.folderSubmit": "Subir carpeta",
    "upload.folderRequired": "Selecciona una carpeta con al menos un archivo PDF.",
    "upload.folderAllFailed": "No se pudo subir ningún archivo PDF de la carpeta.",

    "edit.pageTitle": "Editar documento",
    "edit.save": "Guardar cambios",
    "edit.saving": "Guardando...",
    "edit.deleteDocument": "Eliminar documento",
    "edit.deleteConfirm": '¿Borrar "{title}" permanentemente? Esta acción no se puede deshacer.',

    "categories.pageTitle": "Categorías",
    "categories.namePlaceholder": "Nombre de la categoría",
    "categories.create": "Crear",
    "categories.empty": "Todavía no hay categorías.",
    "categories.delete": "Eliminar",
    "categories.deleteConfirm":
      '¿Borrar la categoría "{name}"? Los documentos que la tengan quedarán sin categoría.',
    "categories.nameRequired": "El nombre es obligatorio.",

    "adminList.pageTitle": "Administrar documentos",
    "adminList.statusReady": "Listo",
    "adminList.statusProcessing": "Procesando",
    "adminList.statusError": "Error",

    "logout.confirm": "¿Seguro que quieres cerrar sesión?",
  },
  ja: {
    "nav.documents": "ドキュメント",
    "nav.adminSection": "管理者",
    "nav.upload": "文書をアップロード",
    "nav.manage": "文書を管理",
    "nav.categories": "カテゴリ",
    "nav.collapse": "メニューを折りたたむ",
    "nav.expand": "メニューを展開",
    "nav.logout": "ログアウト",
    "nav.themeToggle": "テーマを切り替える",

    "common.back": "← 戻る",
    "common.pageSingular": "ページ",
    "common.pagePlural": "ページ",
    "common.titleRequired": "タイトルは必須です。",

    "documents.title": "ドキュメント",
    "documents.searchPlaceholder": "タイトル、説明、内容で検索...",
    "documents.emptyNoQuery": "まだ利用可能な文書はありません。",
    "documents.emptyQuery": "「{query}」に一致する文書が見つかりませんでした。",

    "viewer.prevPage": "前のページ",
    "viewer.nextPage": "次のページ",
    "viewer.pageIndicator": "ページ {page} / {total}",
    "viewer.zoomOut": "縮小",
    "viewer.zoomIn": "拡大",
    "viewer.resetZoom": "ズームをリセット",
    "viewer.notFound": "文書が見つかりません",

    "upload.pageTitle": "文書をアップロード",
    "upload.titleLabel": "タイトル",
    "upload.descriptionLabel": "説明（任意）",
    "upload.categoryLabel": "カテゴリ（任意）",
    "upload.noCategory": "カテゴリなし",
    "upload.languageLabel": "言語",
    "upload.fileLabel": "PDFファイル",
    "upload.submit": "アップロード",
    "upload.submitting": "アップロード中...",
    "upload.fileRequired": "PDFファイルを選択してください。",
    "upload.fileTooLarge": "ファイルが許容される最大サイズを超えています。",
    "upload.invalidPdf": "ファイルは有効なPDFではありません。",
    "upload.folderTitle": "フォルダをカテゴリとしてアップロード",
    "upload.folderDescription":
      "PDFファイルが入ったフォルダを選択してください。フォルダ名がカテゴリとして使用され、中の各PDFに自動的にそのカテゴリが設定されます。",
    "upload.folderLabel": "フォルダ",
    "upload.folderSummary": "フォルダ「{folder}」内に{count}件のPDFファイル。",
    "upload.folderSubmit": "フォルダをアップロード",
    "upload.folderRequired": "少なくとも1つのPDFファイルを含むフォルダを選択してください。",
    "upload.folderAllFailed": "フォルダ内のPDFファイルを1つもアップロードできませんでした。",

    "edit.pageTitle": "文書を編集",
    "edit.save": "変更を保存",
    "edit.saving": "保存中...",
    "edit.deleteDocument": "文書を削除",
    "edit.deleteConfirm": "「{title}」を完全に削除しますか？この操作は取り消せません。",

    "categories.pageTitle": "カテゴリ",
    "categories.namePlaceholder": "カテゴリ名",
    "categories.create": "作成",
    "categories.empty": "まだカテゴリがありません。",
    "categories.delete": "削除",
    "categories.deleteConfirm": "カテゴリ「{name}」を削除しますか？このカテゴリの文書はカテゴリなしになります。",
    "categories.nameRequired": "名前は必須です。",

    "adminList.pageTitle": "文書を管理",
    "adminList.statusReady": "準備完了",
    "adminList.statusProcessing": "処理中",
    "adminList.statusError": "エラー",

    "logout.confirm": "本当にログアウトしますか？",
  },
} as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)["es"];

export function t(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
