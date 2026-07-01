import { Form, redirect } from "react-router";
import { destroyUserSession, requireUser } from "~/lib/auth.server";
import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const setCookieHeader = await destroyUserSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LogoutRoute() {
  return (
    <main className="mx-auto max-w-md p-8">
      <p className="mb-4">¿Seguro que quieres cerrar sesión?</p>
      <Form method="post">
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
          Cerrar sesión
        </button>
      </Form>
    </main>
  );
}
