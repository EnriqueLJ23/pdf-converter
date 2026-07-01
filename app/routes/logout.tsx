import { Form, redirect } from "react-router";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
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
    <div className="flex min-h-screen items-center justify-center px-6">
      <GlassPanel className="w-full max-w-sm p-8 text-center">
        <p className="mb-6 text-black/70 dark:text-white/70">¿Seguro que quieres cerrar sesión?</p>
        <Form method="post">
          <Button type="submit" className="w-full">
            Cerrar sesión
          </Button>
        </Form>
      </GlassPanel>
    </div>
  );
}
