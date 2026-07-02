import { data } from "react-router";
import { languageCookie } from "~/lib/language.server";
import type { Route } from "./+types/set-language";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const language = formData.get("language") === "ja" ? "ja" : "es";
  return data(null, {
    headers: { "Set-Cookie": await languageCookie.serialize(language) },
  });
}
