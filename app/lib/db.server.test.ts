import { describe, expect, it, beforeEach } from "vitest";
import {
  createCategory,
  createDb,
  createDocument,
  deleteCategory,
  deleteDocumentRecord,
  getDocumentById,
  listAllDocuments,
  listCategories,
  listReadyDocuments,
  markDocumentError,
  markDocumentReady,
  updateDocumentMetadata,
  upsertUser,
} from "./db.server";

describe("db.server", () => {
  const db = createDb(":memory:");

  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users; DELETE FROM categories;");
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

  it("creates and lists categories alphabetically", () => {
    createCategory(db, { id: "c2", name: "Recursos Humanos" });
    createCategory(db, { id: "c1", name: "Finanzas" });

    const categories = listCategories(db);

    expect(categories.map((c) => c.name)).toEqual(["Finanzas", "Recursos Humanos"]);
  });

  it("deletes a category", () => {
    createCategory(db, { id: "c1", name: "Finanzas" });
    deleteCategory(db, "c1");

    expect(listCategories(db)).toHaveLength(0);
  });

  it("stores a document's category and updates metadata", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createCategory(db, { id: "c1", name: "Finanzas" });
    createDocument(db, {
      id: "d1",
      title: "Nomina",
      description: null,
      uploadedBy: "u1",
      categoryId: "c1",
    });

    const doc = getDocumentById(db, "d1");
    expect(doc?.categoryId).toBe("c1");
    expect(doc?.categoryName).toBe("Finanzas");

    updateDocumentMetadata(db, "d1", {
      title: "Nomina 2026",
      description: "Actualizado",
      categoryId: null,
    });

    const updated = getDocumentById(db, "d1");
    expect(updated?.title).toBe("Nomina 2026");
    expect(updated?.description).toBe("Actualizado");
    expect(updated?.categoryId).toBeNull();
  });

  it("deletes a document record", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createDocument(db, { id: "d1", title: "Temporal", description: null, uploadedBy: "u1" });

    deleteDocumentRecord(db, "d1");

    expect(getDocumentById(db, "d1")).toBeUndefined();
  });

  it("leaves a document without a category when its category is deleted", () => {
    upsertUser(db, { id: "u1", email: "a@x.com", name: "Ana", isAdmin: true });
    createCategory(db, { id: "c1", name: "Finanzas" });
    createDocument(db, {
      id: "d1",
      title: "Nomina",
      description: null,
      uploadedBy: "u1",
      categoryId: "c1",
    });

    deleteCategory(db, "c1");

    expect(getDocumentById(db, "d1")?.categoryId).toBeNull();
  });
});
