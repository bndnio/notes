import { handleMcp } from "@/pipeline/sources/mcp/handler";
import { handleHome } from "./ui/home";
import { handleProfile } from "./ui/profile";
import { handleRegistration } from "./auth/register";
import { handleLogin } from "./auth/login";
import { handleLogout } from "./auth/logout";
import { handleVerify } from "./auth/verify";
import { handleMcpSetup } from "./api/mcp/setup";
import { handleMcpInstall } from "./api/mcp/install";
import { handleEmailSettingsSave } from "./api/email";
import { handleNotionRoutes } from "./api/notion";
import { handleStorageSettingsSave } from "./api/storage";
import { handleHttpErrorResponse } from "@/lib/responses";
import type { Env } from "@/lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);

    // Website pages
    if (pathname === "/") return handleHome(env);
    if (pathname === "/profile") return handleProfile(request, env);

    // Login island
    if (pathname.startsWith("/auth/register")) return handleRegistration(request, env);
    if (pathname.startsWith("/auth/login")) return handleLogin(request, env);
    if (pathname.startsWith("/auth/verify")) return handleVerify(request, env);
    if (pathname === "/auth/logout" && request.method === "POST") return handleLogout(request, env);

    // Pipeline ingest — the only route that reaches into a source
    if (pathname === "/api/mcp") return handleMcp(request, env);

    // Integration config
    if (pathname.startsWith("/api/mcp/setup/")) return handleMcpSetup(request, env);
    if (pathname === "/api/mcp/install/claude-code") return handleMcpInstall(env);
    if (pathname === "/api/email" && request.method === "POST") return handleEmailSettingsSave(request, env);
    if (pathname.startsWith("/api/notion/")) return handleNotionRoutes(request, env);
    if (pathname === "/api/storage" && request.method === "POST") return handleStorageSettingsSave(request, env);

    return new Response("Not found", { status: 404 });
  } catch (e) {
    const response = handleHttpErrorResponse(e);
    if (response) return response;
    throw e;
  }
}
