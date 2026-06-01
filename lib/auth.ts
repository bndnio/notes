import { hmacToken } from "./crypto";
import { getCookie } from "./cookies";
import { createDb } from "./db";
import * as usersRepo from "./db/repositories/users";
import { HttpError } from "./responses";
import type { Env, Profile } from "./types";

export function sessionCookieHeader(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`;
}

export function clearSessionCookieHeader(): string {
  return `session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}

export async function resolveProfile(token: string, env: Env): Promise<Profile | null> {
  const db = createDb(env.DB);
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const hash = await hmacToken(token, encryptionKey);
  return (await usersRepo.findByMcpTokenHash(db, hash)) ?? null;
}

export async function resolveSession(request: Request, env: Env, encryptionKey: string): Promise<string | null> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return null;
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  return env.EPHEMERAL_KV.get(`session:${sessionHash}`);
}

export async function resolveSessionWithHash(
  request: Request,
  env: Env,
  encryptionKey: string,
): Promise<{ userId: string; sessionHash: string } | null> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return null;
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const userId = await env.EPHEMERAL_KV.get(`session:${sessionHash}`);
  if (!userId) return null;
  return { userId, sessionHash };
}

export async function assertSession(
  request: Request,
  env: Env,
  encryptionKey: string,
): Promise<{ userId: string; sessionHash: string }> {
  const session = await resolveSessionWithHash(request, env, encryptionKey);
  if (!session) throw new HttpError(Response.redirect(`${env.APP_URL}/login`, 302));
  return session;
}

export async function assertUser(
  db: ReturnType<typeof createDb>,
  userId: string,
  appUrl: string,
): Promise<Profile> {
  const user = await usersRepo.findById(db, userId);
  if (!user) throw new HttpError(Response.redirect(`${appUrl}/login`, 302));
  return user;
}

// CSRF protection uses the Synchronizer Token Pattern: a token is embedded as a hidden
// field in every mutating form and validated on POST. This is the same approach used by
// Rails, Django, and Laravel.
//
// Rather than generating a random token and storing it server-side, we derive the token
// as HMAC-SHA256("csrf:<sessionHash>", encryptionKey). This is safe because:
//   1. An attacker cannot compute the token without the server's encryptionKey.
//   2. An attacker cannot read the token from the HTML because the browser's same-origin
//      policy blocks cross-origin reads — only the legitimate page can embed it in a form.
//   3. The token is implicitly scoped to the session (via sessionHash) and expires
//      automatically when the session expires — no extra KV entry needed.
//   4. The "csrf:" prefix ensures this hash is distinct from session hashes and MCP token
//      hashes, which both use the raw token as the HMAC message.
//
// SameSite=Lax on the session cookie already blocks cross-site POST in modern browsers.
// This token is a second layer that covers older WebViews and future code changes.
export async function getCsrfToken(sessionHash: string, encryptionKey: string): Promise<string> {
  return hmacToken(`csrf:${sessionHash}`, encryptionKey);
}

export async function validateCsrf(
  submitted: string,
  sessionHash: string,
  encryptionKey: string,
): Promise<boolean> {
  if (!submitted) return false;
  const expected = await getCsrfToken(sessionHash, encryptionKey);
  return submitted === expected;
}

export async function assertCsrf(
  form: FormData,
  sessionHash: string,
  encryptionKey: string,
): Promise<void> {
  const submitted = (form.get("_csrf") as string) ?? "";
  if (!await validateCsrf(submitted, sessionHash, encryptionKey)) {
    throw new HttpError(new Response("Invalid request", { status: 403 }));
  }
}
