export type Language = "es" | "ja";

export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  ja: "日本語",
};

export const translations = {
  es: {
    "nav.documents": "Documentos",
    "nav.adminSection": "Admin",
    "nav.manage": "Administrar documentos",
    "nav.collapse": "Colapsar menú",
    "nav.expand": "Expandir menú",
    "nav.logout": "Cerrar sesión",
    "nav.themeToggle": "Cambiar tema",

    "common.back": "← Volver",
    "common.pageSingular": "página",
    "common.pagePlural": "páginas",
    "common.titleRequired": "El título es obligatorio.",

    "documents.title": "Documentos",
    "documents.searchPlaceholder":
      "Buscar por título, descripción o contenido...",
    "documents.emptyNoQuery": "Todavía no hay documentos disponibles.",
    "documents.emptyQuery": "No se encontraron documentos para «{query}».",

    "viewer.prevPage": "Página anterior",
    "viewer.nextPage": "Página siguiente",
    "viewer.pageIndicator": "Página {page} de {total}",
    "viewer.zoomOut": "Reducir zoom",
    "viewer.zoomIn": "Aumentar zoom",
    "viewer.resetZoom": "Restablecer zoom",
    "viewer.notFound": "Documento no encontrado",

    "upload.titleLabel": "Título",
    "upload.descriptionLabel": "Descripción (opcional)",
    "upload.categoryLabel": "Categoría (opcional)",
    "upload.noCategory": "Sin categoría",
    "upload.languageLabel": "Idioma",
    "upload.submitting": "Subiendo...",
    "upload.dropHint": "Arrastra un archivo o una carpeta aquí",
    "upload.orText": "o",
    "upload.chooseFiles": "Elegir archivo(s)",
    "upload.chooseFolder": "Elegir carpeta",
    "upload.filesSummary": "{count} archivo(s) PDF seleccionados.",
    "upload.filesSummaryFolder":
      "{count} archivo(s) PDF en la carpeta {folder}.",
    "upload.noFilesSelected": "Selecciona o arrastra al menos un PDF.",
    "upload.uploadAllFailed": "No se pudo subir ningún archivo PDF.",
    "upload.cancel": "Cancelar",

    "edit.pageTitle": "Editar documento",
    "edit.save": "Guardar cambios",
    "edit.saving": "Guardando...",
    "edit.deleteDocument": "Eliminar documento",
    "edit.deleteConfirm":
      '¿Borrar "{title}" permanentemente? Esta acción no se puede deshacer.',

    "categories.namePlaceholder": "Nombre de la categoría",
    "categories.create": "Crear",
    "categories.delete": "Eliminar",
    "categories.deleteConfirm":
      '¿Borrar la categoría "{name}"? Los documentos que la tengan quedarán sin categoría.',
    "categories.nameRequired": "El nombre es obligatorio.",

    "adminList.pageTitle": "Administrar documentos",
    "adminList.statusReady": "Listo",
    "adminList.statusProcessing": "Procesando",
    "adminList.statusError": "Error",
    "adminList.addDocument": "Agregar documento",
    "adminList.editDocument": "Editar",
    "adminList.assignCategoryAriaLabel": "Cambiar categoría",
    "adminList.deleteCategoryAriaLabel": "Eliminar categoría",

    "logout.confirm": "¿Seguro que quieres cerrar sesión?",
  },
  ja: {
    "nav.documents": "ドキュメント",
    "nav.adminSection": "管理者",
    "nav.manage": "文書を管理",
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

    "upload.titleLabel": "タイトル",
    "upload.descriptionLabel": "説明（任意）",
    "upload.categoryLabel": "カテゴリ（任意）",
    "upload.noCategory": "カテゴリなし",
    "upload.languageLabel": "言語",
    "upload.submitting": "アップロード中...",
    "upload.dropHint": "ファイルまたはフォルダをここにドラッグ",
    "upload.orText": "または",
    "upload.chooseFiles": "ファイルを選択",
    "upload.chooseFolder": "フォルダを選択",
    "upload.filesSummary": "{count}件のPDFファイルが選択されました。",
    "upload.filesSummaryFolder":
      "フォルダ「{folder}」内に{count}件のPDFファイル。",
    "upload.noFilesSelected":
      "少なくとも1つのPDFファイルを選択またはドラッグしてください。",
    "upload.uploadAllFailed":
      "PDFファイルを1つもアップロードできませんでした。",
    "upload.cancel": "キャンセル",

    "edit.pageTitle": "文書を編集",
    "edit.save": "変更を保存",
    "edit.saving": "保存中...",
    "edit.deleteDocument": "文書を削除",
    "edit.deleteConfirm":
      "「{title}」を完全に削除しますか？この操作は取り消せません。",

    "categories.namePlaceholder": "カテゴリ名",
    "categories.create": "作成",
    "categories.delete": "削除",
    "categories.deleteConfirm":
      "カテゴリ「{name}」を削除しますか？このカテゴリの文書はカテゴリなしになります。",
    "categories.nameRequired": "名前は必須です。",

    "adminList.pageTitle": "文書を管理",
    "adminList.statusReady": "準備完了",
    "adminList.statusProcessing": "処理中",
    "adminList.statusError": "エラー",
    "adminList.addDocument": "文書を追加",
    "adminList.editDocument": "編集",
    "adminList.assignCategoryAriaLabel": "カテゴリを変更",
    "adminList.deleteCategoryAriaLabel": "カテゴリを削除",

    "logout.confirm": "本当にログアウトしますか？",
  },
} as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)["es"];

export function t(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
