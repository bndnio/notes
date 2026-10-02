import indexHtml from "@/templates/index.html";
import { html, renderTemplate, pageVars } from "@/lib/responses";
import type { Env } from "@/lib/types";

export function handleHome(request: Request, env: Env): Response {
  return html(renderTemplate(indexHtml, pageVars(request, { emailDomain: env.EMAIL_DOMAIN })));
}
