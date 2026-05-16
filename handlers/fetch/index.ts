import { handleMcp } from "./mcp";
import { handleRegistration } from "./registration";
import indexHtml from "../../templates/index.html";
import installMcpHtml from "../../templates/install-mcp.html";
import installMcpScript from "../../templates/install-mcp.sh";
import type { Env } from "../../lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/") return new Response(indexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (pathname === "/mcp") return handleMcp(request, env);
  if (pathname.startsWith("/register")) return handleRegistration(request, env);
  if (pathname === "/install-mcp") return new Response(installMcpHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (pathname === "/install-mcp/script") return new Response(installMcpScript, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response("Not found", { status: 404 });
}
