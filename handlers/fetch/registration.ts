import type { Env } from "../../lib/types";

export async function handleRegistration(_request: Request, _env: Env): Promise<Response> {
  return new Response("Not found", { status: 404 });
}
