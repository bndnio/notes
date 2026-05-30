import { handleMcp } from "./mcp";
import { handleRegistration } from "./registration";
import { handleLogin } from "./login";
import { handleVerify } from "./verify";
import { handleProfile } from "./profile";
import { handleGenerateMcpToken, handleMcpDone } from "./setup-mcp";
import { handleIntegration } from "./integration/index";
import { html, renderTemplate, pageVars, text, css } from "../../lib/responses";
import indexHtml from "../../templates/index.html";
import installMcpScript from "../../templates/install-mcp.sh";
import baseCss from "../../templates/base.css";
import type { Env } from "../../lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/") return html(renderTemplate(indexHtml, pageVars({ emailDomain: env.EMAIL_DOMAIN })));
  if (pathname === "/styles.css") return css(baseCss);
  if (pathname === "/mcp") return handleMcp(request, env);
  if (pathname.startsWith("/register")) return handleRegistration(request, env);
  if (pathname.startsWith("/login")) return handleLogin(request, env);
  if (pathname.startsWith("/verify")) return handleVerify(request, env);
  if (pathname === "/profile") return handleProfile(request, env);
  if (pathname === "/setup-mcp/generate" && request.method === "POST") return handleGenerateMcpToken(request, env);
  if (pathname === "/setup-mcp/done") return handleMcpDone(request, env);
  if (pathname.startsWith("/integration")) return handleIntegration(request, env);
  if (pathname === "/install-mcp/claude-code") return text(renderTemplate(installMcpScript, { appUrl: env.APP_URL }));
  return new Response("Not found", { status: 404 });
}
