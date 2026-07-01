import { redirect } from "react-router";
import { getUserFromSession } from "~/lib/auth.server";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromSession(request);
  throw redirect(user ? "/documentos" : "/login");
}

export default function Home() {
  return null;
}
