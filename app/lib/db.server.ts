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

export interface DocumentRecord {
  id: string;
  title: string;
  description: string | null;
  pageCount: number;
  uploadedBy: string;
  createdAt: string;
  status: DocumentStatus;
  errorMessage: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  last_login_at: string;
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
}

export function createDb(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const conn = new Database(filePath);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      page_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT
    );
  `);
  return conn;
}

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
export const db = createDb(DATABASE_PATH);

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: !!row.is_admin,
    lastLoginAt: row.last_login_at,
  };
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

export function createDocument(
  conn: Database.Database,
  doc: { id: string; title: string; description: string | null; uploadedBy: string },
): DocumentRecord {
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO documents (id, title, description, page_count, uploaded_by, created_at, status, error_message)
       VALUES (@id, @title, @description, 0, @uploadedBy, @createdAt, 'processing', NULL)`,
    )
    .run({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: doc.uploadedBy,
      createdAt: now,
    });

  return rowToDocument(
    conn.prepare("SELECT * FROM documents WHERE id = ?").get(doc.id) as DocumentRow,
  );
}

export function markDocumentReady(conn: Database.Database, id: string, pageCount: number): void {
  conn.prepare("UPDATE documents SET status = 'ready', page_count = ? WHERE id = ?").run(pageCount, id);
}

export function markDocumentError(conn: Database.Database, id: string, errorMessage: string): void {
  conn.prepare("UPDATE documents SET status = 'error', error_message = ? WHERE id = ?").run(errorMessage, id);
}

export function listReadyDocuments(conn: Database.Database): DocumentRecord[] {
  return (conn.prepare("SELECT * FROM documents WHERE status = 'ready' ORDER BY created_at DESC").all() as DocumentRow[]).map(
    rowToDocument,
  );
}

export function listAllDocuments(conn: Database.Database): DocumentRecord[] {
  return (conn.prepare("SELECT * FROM documents ORDER BY created_at DESC").all() as DocumentRow[]).map(rowToDocument);
}

export function getDocumentById(conn: Database.Database, id: string): DocumentRecord | undefined {
  const row = conn.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}
