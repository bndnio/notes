import betaBannerHtml from "@/templates/partials/beta-banner.html";
import themeSwitcherHtml from "@/templates/partials/theme-switcher.html";
import toastHtml from "@/templates/partials/toast.html";
import { escHtml } from "./html";
import { renderTemplate } from "./responses";
import { resolveSession } from "./auth";
import { resolveTheme } from "./theme";
import type { Env } from "./types";

// Shared chrome for every full page: banner, theme switcher, theme, and
// homeHref, where "home" links (landing logo, back links) go: the in-app home
// (/profile) when signed in, otherwise the landing page. This only picks a
// link; it is not an auth check. Handlers still assert the session themselves.
export async function pageVars(
  request: Request,
  env: Env,
  vars: Record<string, string> = {},
): Promise<Record<string, string>> {
  const userId = await resolveSession(request, env, env.SEC_ENCRYPTION_KEY);
  const homeHref = userId ? "/profile" : "/";
  const toastMessage = new URL(request.url).searchParams.get("toast");
  return {
    betaBanner: betaBannerHtml,
    toast: toastMessage ? renderTemplate(toastHtml, { message: escHtml(toastMessage) }) : "",
    homeHref,
    themeSwitcher: themeSwitcherHtml,
    theme: resolveTheme(request),
    ...vars,
  };
}
