import { redirect } from "react-router";
import { completeLogin } from "~/lib/auth.server";
import type { Route } from "./+types/auth-callback";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const { setCookieHeader } = await completeLogin(request);
    return redirect("/documentos", {
      headers: { "Set-Cookie": setCookieHeader },
    });
  } catch (error) {
    console.error("Login callback failed", error);
    return redirect("/login?error=1");
  }
}

export default function AuthCallbackRoute() {
  return null;
}
