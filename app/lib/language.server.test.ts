import { describe, expect, it } from "vitest";
import { getLanguage, languageCookie, serializeLanguage } from "./language.server";

function requestWithCookie(cookieHeader: string | null): Request {
  const headers = new Headers();
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  return new Request("http://localhost/", { headers });
}

describe("language.server", () => {
  it("defaults to Spanish when there's no cookie", async () => {
    expect(await getLanguage(requestWithCookie(null))).toBe("es");
  });

  it("defaults to Spanish on a garbage cookie value", async () => {
    const bad = await languageCookie.serialize("not-a-real-language");
    const cookieHeader = bad.split(";")[0];
    expect(await getLanguage(requestWithCookie(cookieHeader))).toBe("es");
  });

  it("reads back a valid ja cookie", async () => {
    const set = await serializeLanguage("ja");
    const cookieHeader = set.split(";")[0];
    expect(await getLanguage(requestWithCookie(cookieHeader))).toBe("ja");
  });
});
