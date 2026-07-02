import { createCookie } from "react-router";
import type { Language } from "./i18n";

export const languageCookie = createCookie("lang", {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
});

export async function getLanguage(request: Request): Promise<Language> {
  const value = await languageCookie.parse(request.headers.get("Cookie"));
  return value === "ja" ? "ja" : "es";
}

export async function serializeLanguage(language: Language): Promise<string> {
  return languageCookie.serialize(language);
}
