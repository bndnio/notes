import { handleMcp } from "./mcp";
import { handleRegistration } from "./registration";
import { handleIntegration } from "./integration/index";
import { html, renderTemplate, text, css } from "../../lib/responses";
import indexHtml from "../../templates/index.html";
import installMcpHtml from "../../templates/install-mcp.html";
import installMcpScript from "../../templates/install-mcp.sh";
import baseCss from "../../templates/base.css";
import type { Env } from "../../lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/") return html(renderTemplate(indexHtml, { emailDomain: env.EMAIL_DOMAIN }));
  if (pathname === "/styles.css") return css(baseCss);
  if (pathname === "/mcp") return handleMcp(request, env);
  if (pathname.startsWith("/register")) return handleRegistration(request, env);
  if (pathname.startsWith("/integration")) return handleIntegration(request, env);
  if (pathname === "/install-mcp") return html(installMcpHtml.replaceAll("{{appUrl}}", env.APP_URL));
  if (pathname === "/install-mcp/claude-code") return text(renderTemplate(installMcpScript, { appUrl: env.APP_URL }));
  return new Response("Not found", { status: 404 });
}
