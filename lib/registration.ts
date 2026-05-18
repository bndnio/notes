import { hmacToken, generateRandomHex } from "./crypto";
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
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved.";
  return null;
}

async function generateUniqueUserId(profileKv: KVNamespace): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = generateRandomHex(4);
    if (!(await profileKv.get(id))) return id;
  }
  throw new Error("Failed to generate unique userId after 5 attempts");
}

export async function register(
  env: Env,
  input: { email: string; username: string; requireSenderMatch: boolean },
): Promise<{ error: string } | { mcpToken: string; sessionToken: string }> {
  const { email, username, requireSenderMatch } = input;

  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  const [emailExists, usernameExists, encryptionKey] = await Promise.all([
    env.USER_INDEX_KV.get(email),
    env.USER_INDEX_KV.get(username),
    env.ENCRYPTION_KEY.get(),
  ]);
  if (emailExists) return { error: "Email already registered." };
  if (usernameExists) return { error: "Username already taken." };

  const userId = await generateUniqueUserId(env.PROFILE_KV);

  await Promise.all([
    env.USER_INDEX_KV.put(email, userId),
    env.USER_INDEX_KV.put(username, userId),
    env.PROFILE_KV.put(userId, JSON.stringify({ userId, username, requireSenderMatch })),
  ]);

  const mcpToken = generateRandomHex(32);
  const sessionToken = generateRandomHex(32);
  const [mcpTokenHash, sessionHash] = await Promise.all([
    hmacToken(mcpToken, encryptionKey),
    hmacToken(sessionToken, encryptionKey),
  ]);

  await Promise.all([
    env.MCP_TOKEN_KV.put(mcpTokenHash, userId),
    env.EPHEMERAL_KV.put(`session:${sessionHash}`, userId, { expirationTtl: 604800 }),
  ]);

  return { mcpToken, sessionToken };
}
