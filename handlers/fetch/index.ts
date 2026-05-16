import { handleMcp } from "./mcp";
import { handleRegistration } from "./registration";
import type { Env } from "../../lib/types";

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/mcp") return handleMcp(request, env);
  if (pathname.startsWith("/register")) return handleRegistration(request, env);
  return new Response("Not found", { status: 404 });
}
