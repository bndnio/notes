import { assertCsrf, clearSessionCookieHeader, resolveSessionWithHash } from "../../lib/auth";
import type { Env } from "../../lib/types";

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const session = await resolveSessionWithHash(request, env, encryptionKey);
  if (session) {
    const form = await request.formData();
    await assertCsrf(form, session.sessionHash, encryptionKey);
    await env.EPHEMERAL_KV.delete(`session:${session.sessionHash}`);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.APP_URL}/login`,
      "Set-Cookie": clearSessionCookieHeader(),
    },
  });
}
