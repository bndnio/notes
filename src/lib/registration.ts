import { hmacToken, generateRandomHex } from "./crypto";
import { generatePin, storePin } from "./pin";
import { createDb } from "./db";
import { users, userEmails } from "./db/schema";
import * as usersRepo from "./db/repositories/users";
import * as userEmailsRepo from "./db/repositories/user-emails";
import type { Env } from "./types";

const RESERVED_USERNAMES = new Set([
  "abuse", "admin", "administrator", "api", "auth", "billing", "bounce", "bounces",
  "contact", "email", "help", "hello", "hostmaster", "info", "legal", "login",
  "mail", "mailer", "marketing", "noc", "no-reply", "noreply", "notes", "oauth",
  "owner", "postmaster", "privacy", "register", "root", "sales", "security",
  "signup", "support", "terms", "webmaster",
]);

function validateUsername(username: string): string | null {
  if (username.length < 6) return "Username must be at least 6 characters.";
  if (!/^[a-z0-9_-]+$/.test(username)) return "Username may only contain lowercase letters, numbers, hyphens, and underscores.";
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved.";
  return null;
}

export async function stageRegistration(
  env: Env,
  input: { email: string; username: string; requireSenderMatch: boolean },
): Promise<{ pin: string } | { error: string }> {
  const { email, username, requireSenderMatch } = input;

  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  const db = createDb(env.DB);
  const [emailTaken, existingUser] = await Promise.all([
    userEmailsRepo.emailExists(db, email),
    usersRepo.findByUsername(db, username),
  ]);
  if (emailTaken) return { error: "Email already registered." };
  if (existingUser) return { error: "Username already taken." };

  const pin = generatePin();
  const stagedData = { type: "register", username, requireSenderMatch };
  await storePin(email, pin, stagedData, env);

  return { pin };
}

export async function completeRegistration(
  env: Env,
  email: string,
  pending: { username: string; requireSenderMatch: boolean },
): Promise<{ sessionToken: string }> {
  const { username, requireSenderMatch } = pending;

  const db = createDb(env.DB);
  const userId = generateRandomHex(6);
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const sessionToken = generateRandomHex(32);
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const now = Date.now();

  await db.batch([
    db.insert(users).values({ id: userId, username, requireSenderMatch, createdAt: now }),
    db.insert(userEmails).values({ email, userId, createdAt: now }),
  ]);

  await env.EPHEMERAL_KV.put(`session:${sessionHash}`, userId, { expirationTtl: 604800 });

  return { sessionToken };
}
