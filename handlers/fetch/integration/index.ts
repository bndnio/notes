import { handleNotionIntegration } from "./notion";
import type { Env } from "../../../lib/types";

export async function handleIntegration(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/integration/notion")) return handleNotionIntegration(request, env);
  return new Response("Not found", { status: 404 });
}
