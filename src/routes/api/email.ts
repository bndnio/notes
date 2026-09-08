import { assertSession, assertUser, assertCsrf } from "@/lib/auth";
import {
  checkEmailPinSendRate,
  checkIpPinSendRate,
  consumePin,
  discardPin,
  generatePin,
  sendPin,
  storePin,
} from "@/lib/pin";
import { createDb, type Db } from "@/db";
import * as usersRepo from "@/db/repositories/users";
import * as userEmailsRepo from "@/db/repositories/user-emails";
import type { Env } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches PIN_TTL in lib/pin.ts so the pointer and the PIN it points at expire together.
const PENDING_TTL = 600;

// Presence of this key IS the "an address is awaiting verification" state — there is no
// pending flag on the user record.
const pendingKey = (userId: string) => `email_add:${userId}`;

function toProfile(env: Env, message: string): Response {
  return Response.redirect(`${env.APP_URL}/profile?toast=${encodeURIComponent(message)}`, 302);
}

function toModal(env: Env, message: string): Response {
  return Response.redirect(
    `${env.APP_URL}/profile?modal=email-manage&toast=${encodeURIComponent(message)}`,
    302,
  );
}

// An address is only added after a PIN sent to it is returned.
async function stagePendingAddition(
  db: Db,
  email: string,
  userId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (await userEmailsRepo.emailExists(db, email)) {
    console.warn(`Rejected email addition — address already in use: ${email}`);
    return toModal(env, "That address is already in use");
  }

  // Rate limits stop an authenticated user from mailing PINs at an arbitrary address on repeat.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!await checkIpPinSendRate(ip, env)) {
    return toModal(env, "Too many requests. Please try again later.");
  }
  if (!await checkEmailPinSendRate(email, env)) {
    return toModal(env, "Too many verification emails sent to that address. Please try again later.");
  }

  const pin = generatePin();
  await Promise.all([
    storePin(email, pin, { type: "email_add", userId }, env),
    env.EPHEMERAL_KV.put(pendingKey(userId), email, { expirationTtl: PENDING_TTL }),
  ]);
  await sendPin(email, pin, env);

  console.log(`Staged email addition for user ${userId}`);
  return toModal(env, `Enter the PIN sent to ${email}`);
}

async function handleSave(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const submitted = (form.getAll("email") as string[])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const requireSenderMatch = form.get("requireSenderMatch") === "1";

  if (submitted.length === 0) {
    return toProfile(env, "At least one email is required");
  }

  if (!submitted.every((e) => EMAIL_RE.test(e))) {
    return toProfile(env, "Invalid email address");
  }

  if (new Set(submitted).size !== submitted.length) {
    return toProfile(env, "Duplicate email addresses");
  }

  const currentEmails = await userEmailsRepo.findAllByUserId(db, userId);
  const currentSet = new Set(currentEmails.map((e) => e.email));
  const primaryEmail = currentEmails[0]?.email;
  if (primaryEmail && !submitted.includes(primaryEmail)) {
    return toProfile(env, "Cannot remove primary email");
  }

  const additions = submitted.filter((e) => !currentSet.has(e));
  const retained = submitted.filter((e) => currentSet.has(e));

  // One pending addition at a time — the pointer key holds a single address.
  if (additions.length > 1) {
    return toProfile(env, "Add one address at a time");
  }

  // Removals and the sender-match toggle need no proof of control, so they apply now.
  // replaceEmails only deletes here: retained is a subset of the current set.
  await Promise.all([
    userEmailsRepo.replaceEmails(db, userId, retained),
    usersRepo.updateRequireSenderMatch(db, userId, requireSenderMatch),
  ]);

  if (additions.length === 0) {
    return toProfile(env, "Email settings saved");
  }

  return stagePendingAddition(db, additions[0], userId, request, env);
}

async function handleVerifyPin(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const pin = ((form.get("pin") as string) ?? "").trim();

  // The address comes from the session-keyed pointer, never from the form.
  const email = await env.EPHEMERAL_KV.get(pendingKey(userId));
  if (!email) {
    return toProfile(env, "No pending address to verify. Add it again.");
  }

  const payload = await consumePin(email, pin, env);
  if (payload === "locked") {
    return toModal(env, "Too many attempts. Try again in a few minutes.");
  }
  if (!payload) {
    return toModal(env, "Invalid or expired PIN");
  }

  // pin:<email> is shared with login/register. A PIN from another flow must not add this address.
  const issuedForThisAdd = payload.type === "email_add" && payload.userId === userId;
  if (!issuedForThisAdd) {
    console.warn(`Rejected email verification — PIN payload mismatch for user ${userId}`);
    return toProfile(env, "Invalid or expired PIN");
  }

  // The address may have been claimed by a registration during the PIN window.
  if (await userEmailsRepo.emailExists(db, email)) {
    await env.EPHEMERAL_KV.delete(pendingKey(userId));
    console.warn(`Rejected email addition — address claimed during verification: ${email}`);
    return toProfile(env, "That address is already in use");
  }

  await Promise.all([
    userEmailsRepo.create(db, { email, userId }),
    env.EPHEMERAL_KV.delete(pendingKey(userId)),
  ]);

  console.log(`Verified additional email for user ${userId}`);
  return toProfile(env, "Email address added");
}

async function handleCancel(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const email = await env.EPHEMERAL_KV.get(pendingKey(userId));
  await Promise.all([
    env.EPHEMERAL_KV.delete(pendingKey(userId)),
    email ? discardPin(email, env) : Promise.resolve(),
  ]);

  return toProfile(env, "Pending address discarded");
}

export async function handleEmailRoutes(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/email" && request.method === "POST") {
    return handleSave(request, env);
  }
  if (pathname === "/api/email/verify" && request.method === "POST") {
    return handleVerifyPin(request, env);
  }
  if (pathname === "/api/email/cancel" && request.method === "POST") {
    return handleCancel(request, env);
  }

  return new Response("Not found", { status: 404 });
}
