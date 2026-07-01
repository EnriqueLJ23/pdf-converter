import { describe, expect, it, beforeEach } from "vitest";
import {
  createDb,
  createDocument,
  getDocumentById,
  listAllDocuments,
  listReadyDocuments,
  markDocumentError,
  markDocumentReady,
  upsertUser,
} from "./db.server";

describe("db.server", () => {
  const db = createDb(":memory:");

  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users;");
  });

  it("upserts a user, updating fields on repeat login", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: false });
    const updated = upsertUser(db, {
      id: "u1",
      email: "a@x.com",
      name: "Ana Updated",
      isAdmin: true,
    });

    expect(updated.name).toBe("Ana Updated");
    expect(updated.isAdmin).toBe(true);
  });

  it("creates a document in processing status and only lists it after marking ready", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    const doc = createDocument(db, {
      id: "d1",
      title: "Manual",
      description: null,
      uploadedBy: "u1",
    });

    expect(doc.status).toBe("processing");
    expect(listReadyDocuments(db)).toHaveLength(0);

    markDocumentReady(db, "d1", 5);
    const ready = listReadyDocuments(db);

    expect(ready).toHaveLength(1);
    expect(ready[0].pageCount).toBe(5);
    expect(ready[0].status).toBe("ready");
  });

  it("records an error message and keeps the document out of the ready list", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d2", title: "Roto", description: null, uploadedBy: "u1" });

    markDocumentError(db, "d2", "pdftoppm failed: corrupt file");
    const doc = getDocumentById(db, "d2");

    expect(doc?.status).toBe("error");
    expect(doc?.errorMessage).toBe("pdftoppm failed: corrupt file");
    expect(listReadyDocuments(db)).toHaveLength(0);
    expect(listAllDocuments(db)).toHaveLength(1);
  });
});
