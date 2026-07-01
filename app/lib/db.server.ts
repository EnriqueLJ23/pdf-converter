import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DocumentStatus = "processing" | "ready" | "error";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  lastLoginAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  description: string | null;
  pageCount: number;
  uploadedBy: string;
  createdAt: string;
  status: DocumentStatus;
  errorMessage: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  last_login_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
}

interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  page_count: number;
  uploaded_by: string;
  created_at: string;
  status: DocumentStatus;
  error_message: string | null;
  category_id: string | null;
  category_name: string | null;
}

export function createDb(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const conn = new Database(filePath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  const documentColumns = conn.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!documentColumns.some((col) => col.name === "category_id")) {
    conn.exec(
      "ALTER TABLE documents ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL",
    );
  }

  return conn;
}

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
export const db = createDb(DATABASE_PATH);

const DOCUMENT_SELECT = `
  SELECT documents.*, categories.name AS category_name
  FROM documents
  LEFT JOIN categories ON categories.id = documents.category_id
`;

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
}

function rowToCategory(row: CategoryRow): CategoryRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function rowToDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    pageCount: row.page_count,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    status: row.status,
    errorMessage: row.error_message,
    categoryId: row.category_id,
    categoryName: row.category_name,
  };
}

export function upsertUser(
  conn: Database.Database,
  user: { id: string; email: string; name: string; isAdmin: boolean },
): UserRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO users (id, email, name, is_admin, last_login_at)
       VALUES (@id, @email, @name, @isAdmin, @lastLoginAt)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         is_admin = excluded.is_admin,
         last_login_at = excluded.last_login_at`,
    )
    .run({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin ? 1 : 0,
      lastLoginAt: now,
    });

  return rowToUser(conn.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow);
}

export function createCategory(
  conn: Database.Database,
  category: { id: string; name: string },
): CategoryRecord {
  const now = new Date().toISOString();
  conn
    .prepare("INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)")
    .run(category.id, category.name, now);
  return rowToCategory(conn.prepare("SELECT * FROM categories WHERE id = ?").get(category.id) as CategoryRow);
}

export function listCategories(conn: Database.Database): CategoryRecord[] {
  return (conn.prepare("SELECT * FROM categories ORDER BY name ASC").all() as CategoryRow[]).map(rowToCategory);
}

export function deleteCategory(conn: Database.Database, id: string): void {
  conn.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function createDocument(
  conn: Database.Database,
  doc: {
    id: string;
    title: string;
    description: string | null;
    uploadedBy: string;
    categoryId?: string | null;
  },
): DocumentRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO documents (id, title, description, page_count, uploaded_by, created_at, status, error_message, category_id)
       VALUES (@id, @title, @description, 0, @uploadedBy, @createdAt, 'processing', NULL, @categoryId)`,
    )
    .run({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: doc.uploadedBy,
      createdAt: now,
      categoryId: doc.categoryId ?? null,
    });

  return rowToDocument(
    conn.prepare(`${DOCUMENT_SELECT} WHERE documents.id = ?`).get(doc.id) as DocumentRow,
  );
}

export function markDocumentReady(conn: Database.Database, id: string, pageCount: number): void {
  conn.prepare("UPDATE documents SET status = 'ready', page_count = ? WHERE id = ?").run(pageCount, id);
}

export function markDocumentError(conn: Database.Database, id: string, errorMessage: string): void {
  conn.prepare("UPDATE documents SET status = 'error', error_message = ? WHERE id = ?").run(errorMessage, id);
}

export function updateDocumentMetadata(
  conn: Database.Database,
  id: string,
  metadata: { title: string; description: string | null; categoryId: string | null },
): void {
  conn
    .prepare("UPDATE documents SET title = ?, description = ?, category_id = ? WHERE id = ?")
    .run(metadata.title, metadata.description, metadata.categoryId, id);
}

export function deleteDocumentRecord(conn: Database.Database, id: string): void {
  conn.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

export function listReadyDocuments(conn: Database.Database): DocumentRecord[] {
  return (
    conn
      .prepare(`${DOCUMENT_SELECT} WHERE documents.status = 'ready' ORDER BY documents.created_at DESC`)
      .all() as DocumentRow[]
  ).map(rowToDocument);
}

export function listAllDocuments(conn: Database.Database): DocumentRecord[] {
  return (
    conn.prepare(`${DOCUMENT_SELECT} ORDER BY documents.created_at DESC`).all() as DocumentRow[]
  ).map(rowToDocument);
}

export function getDocumentById(conn: Database.Database, id: string): DocumentRecord | undefined {
  const row = conn.prepare(`${DOCUMENT_SELECT} WHERE documents.id = ?`).get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}
