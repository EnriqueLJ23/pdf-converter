import { describe, expect, it, beforeEach } from "vitest";
import { db, upsertUser } from "./db.server";
import { requireAdmin, requireUser, sessionStorage } from "./auth.server";

async function cookieHeaderFor(userId: string): Promise<string> {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  const setCookie = await sessionStorage.commitSession(session);
  return setCookie.split(";")[0];
}

describe("requireUser / requireAdmin", () => {
  beforeEach(() => {
    db.exec("DELETE FROM documents; DELETE FROM users;");
  });

  it("redirects to /login when there is no session cookie", async () => {
    const request = new Request("https://app.example.com/documentos");

    await expect(requireUser(request)).rejects.toMatchObject({ status: 302 });
  });

  it("returns the user when the session cookie is valid", async () => {
    upsertUser(db, { id: "user-1", email: "a@b.com", name: "Ana", isAdmin: false });
    const cookie = await cookieHeaderFor("user-1");

    const request = new Request("https://app.example.com/documentos", {
      headers: { Cookie: cookie },
    });

    const result = await requireUser(request);
    expect(result.id).toBe("user-1");
  });

  it("throws a 403 from requireAdmin when the user is not an admin", async () => {
    upsertUser(db, { id: "user-2", email: "c@d.com", name: "Beto", isAdmin: false });
    const cookie = await cookieHeaderFor("user-2");

    const request = new Request("https://app.example.com/admin/upload", {
      headers: { Cookie: cookie },
    });

    await expect(requireAdmin(request)).rejects.toMatchObject({ init: { status: 403 } });
  });

  it("allows requireAdmin through when the user is an admin", async () => {
    upsertUser(db, { id: "user-3", email: "e@f.com", name: "Cami", isAdmin: true });
    const cookie = await cookieHeaderFor("user-3");

    const request = new Request("https://app.example.com/admin/upload", {
      headers: { Cookie: cookie },
    });

    const result = await requireAdmin(request);
    expect(result.isAdmin).toBe(true);
  });
});
