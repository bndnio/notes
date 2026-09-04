import indexHtml from "@/templates/index.html";
import { html, renderTemplate, pageVars } from "@/lib/responses";
import type { Env } from "@/lib/types";

export function handleHome(env: Env): Response {
  return html(renderTemplate(indexHtml, pageVars({ emailDomain: env.EMAIL_DOMAIN })));
}
