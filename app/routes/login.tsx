import { redirect } from "react-router";
import { beginLogin } from "~/lib/auth.server";
import type { Route } from "./+types/login";

export async function loader(_args: Route.LoaderArgs) {
  const { url, setCookieHeader } = await beginLogin();
  return redirect(url.toString(), {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LoginRoute() {
  return null;
}
