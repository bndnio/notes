import indexHtml from "@/templates/index.html";
import { html, renderTemplate } from "@/lib/responses";
import { pageVars } from "@/lib/page";
import type { Env } from "@/lib/types";

export async function handleHome(request: Request, env: Env): Promise<Response> {
  return html(renderTemplate(indexHtml, await pageVars(request, env, { emailDomain: env.EMAIL_DOMAIN })));
}
