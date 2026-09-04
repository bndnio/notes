import { handleMcp } from "../sources/mcp/handler";
import { handleHome } from "./ui/home";
import { handleProfile } from "./ui/profile";
import { handleRegistration } from "./auth/registration";
import { handleLogin } from "./auth/login";
import { handleLogout } from "./auth/logout";
import { handleVerify } from "./auth/verify";
import { handleMcpSetup, handleMcpInstall } from "./api/mcp-setup";
import { handleEmailSettingsSave } from "./api/email-settings";
import { handleNotionRoutes } from "./api/notion";
import { handleHttpErrorResponse } from "../lib/responses";
import type { Env } from "../lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);

    // Website pages
    if (pathname === "/") return handleHome(env);
    if (pathname === "/profile") return handleProfile(request, env);

    // Login island
    if (pathname.startsWith("/register")) return handleRegistration(request, env);
    if (pathname.startsWith("/login")) return handleLogin(request, env);
    if (pathname.startsWith("/verify")) return handleVerify(request, env);
    if (pathname === "/logout" && request.method === "POST") return handleLogout(request, env);

    // Pipeline ingest — the only route that reaches into a source
    if (pathname === "/mcp") return handleMcp(request, env);

    // Integration config
    if (pathname.startsWith("/setup-mcp/")) return handleMcpSetup(request, env);
    if (pathname === "/install-mcp/claude-code") return handleMcpInstall(env);
    if (pathname === "/settings/email" && request.method === "POST") return handleEmailSettingsSave(request, env);
    if (pathname.startsWith("/integration/notion")) return handleNotionRoutes(request, env);

    return new Response("Not found", { status: 404 });
  } catch (e) {
    const response = handleHttpErrorResponse(e);
    if (response) return response;
    throw e;
  }
}
