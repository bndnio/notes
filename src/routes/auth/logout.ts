import { assertCsrf, clearSessionCookieHeader, resolveSessionWithHash } from "@/lib/auth";
import * as sessionsKv from "@/kv/repositories/sessions";
import type { Env } from "@/lib/types";

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const session = await resolveSessionWithHash(request, env, encryptionKey);
  if (session) {
    const form = await request.formData();
    await assertCsrf(form, session.sessionHash, encryptionKey);
    await sessionsKv.remove(env.EPHEMERAL_KV, session.sessionHash);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.APP_URL}/auth/login`,
      "Set-Cookie": clearSessionCookieHeader(),
    },
  });
}
