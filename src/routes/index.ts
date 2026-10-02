import { handleMcp } from "@/pipeline/sources/mcp/handler";
import { handleHome } from "./ui/home";
import { handleProfile } from "./ui/profile";
import { handleRegistration } from "./auth/register";
import { handleLogin } from "./auth/login";
import { handleLogout } from "./auth/logout";
import { handleVerify } from "./auth/verify";
import { handleMcpSetup } from "./api/mcp/setup";
import { handleMcpInstall } from "./api/mcp/install";
import { handleEmailRoutes } from "./api/email";
import { handleNotionRoutes } from "./api/notion";
import { handleStorageSettingsSave } from "./api/storage";
import { handleHttpErrorResponse } from "@/lib/responses";
import type { Env } from "@/lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  // Handlers are awaited so a thrown HttpError (e.g. assertSession's login
  // redirect) is caught below; returning the bare promise would skip the catch.
  try {
    const { pathname } = new URL(request.url);

    // Website pages
    if (pathname === "/") return await handleHome(request, env);
    if (pathname === "/profile") return await handleProfile(request, env);

    // Login island
    if (pathname.startsWith("/auth/register")) return await handleRegistration(request, env);
    if (pathname.startsWith("/auth/login")) return await handleLogin(request, env);
    if (pathname.startsWith("/auth/verify")) return await handleVerify(request, env);
    if (pathname === "/auth/logout" && request.method === "POST") return await handleLogout(request, env);

    // Pipeline ingest — the only route that reaches into a source
    if (pathname === "/api/mcp") return await handleMcp(request, env);

    // Integration config
    if (pathname.startsWith("/api/mcp/setup/")) return await handleMcpSetup(request, env);
    if (pathname === "/api/mcp/install/claude-code") return await handleMcpInstall(env);
    if (pathname.startsWith("/api/email")) return await handleEmailRoutes(request, env);
    if (pathname.startsWith("/api/notion/")) return await handleNotionRoutes(request, env);
    if (pathname === "/api/storage" && request.method === "POST") return await handleStorageSettingsSave(request, env);

    return new Response("Not found", { status: 404 });
  } catch (e) {
    const response = handleHttpErrorResponse(e);
    if (response) return response;
    throw e;
  }
}
