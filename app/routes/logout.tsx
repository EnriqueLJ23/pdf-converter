import { Form, redirect } from "react-router";
import { Button } from "~/components/Button";
import { GlassPanel } from "~/components/GlassPanel";
import { destroyUserSession, requireUser } from "~/lib/auth.server";
import { t } from "~/lib/i18n";
import { getLanguage } from "~/lib/language.server";
import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const language = await getLanguage(request);
  return { language };
}

export async function action({ request }: Route.ActionArgs) {
  const setCookieHeader = await destroyUserSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": setCookieHeader },
  });
}

export default function LogoutRoute({ loaderData }: Route.ComponentProps) {
  const { language } = loaderData;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <GlassPanel className="w-full max-w-sm p-8 text-center">
        <p className="mb-6 text-black/70 dark:text-white/70">{t(language, "logout.confirm")}</p>
        <Form method="post">
          <Button type="submit" className="w-full">
            {t(language, "nav.logout")}
          </Button>
        </Form>
      </GlassPanel>
    </div>
  );
}
