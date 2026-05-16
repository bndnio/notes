// Add a new user: registers email → userId, stores profile, encrypts + stores Notion token, and generates an MCP token.
// Usage: ENCRYPTION_KEY=<key> bun run add-user <email> <username> <notionDbId> <notionToken>

import { encrypt, hmacToken } from "../lib/crypto";
import { execSync } from "child_process";

const USER_INDEX_KV_ID = "3bc2721c49b44e21bc5e028c7cef54c3";
const PROFILE_KV_ID = "6efa814a66e041008f334fd9b83ca30f";
const NOTION_TOKEN_KV_ID = "9bb4ca36b284453b8899d8068f30837d";
const MCP_TOKEN_KV_ID = "dfae73f4893d406095ebb95b26e30563";

function generateUserId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateUniqueUserId(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = generateUserId();
    const existing = execSync(
      `bunx wrangler kv key get --namespace-id=${PROFILE_KV_ID} "${id}" --remote 2>/dev/null || true`
    ).toString().trim();
    if (!existing) return id;
  }
  throw new Error("Failed to generate a unique userId after 5 attempts");
}

const [, , email, username, notionDbId, notionToken] = process.argv;

if (!email || !username || !notionDbId || !notionToken) {
  console.error("Usage: ENCRYPTION_KEY=<key> bun run add-user <email> <username> <notionDbId> <notionToken>");
  process.exit(1);
}

const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("ENCRYPTION_KEY env var is required");
  process.exit(1);
}

const kv = (id: string, key: string, value: string) =>
  execSync(`bunx wrangler kv key put --namespace-id=${id} "${key}" "${value}" --remote`, { stdio: "inherit" });

const userId = await generateUniqueUserId();
console.log(`Generated userId: ${userId}`);

kv(USER_INDEX_KV_ID, email, userId);
console.log(`Mapped email: ${email} → ${userId}`);

kv(USER_INDEX_KV_ID, username, userId);
console.log(`Mapped username: ${username} → ${userId}`);

kv(PROFILE_KV_ID, userId, JSON.stringify({ userId, username, notionDbId }));
console.log(`Stored profile for ${username} (${userId})`);

const encrypted = await encrypt(notionToken, encryptionKey);
kv(NOTION_TOKEN_KV_ID, userId, encrypted);
console.log(`Stored encrypted Notion token for ${username} (${userId})`);

const tokenBytes = new Uint8Array(32);
crypto.getRandomValues(tokenBytes);
const mcpToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
kv(MCP_TOKEN_KV_ID, mcpTokenHash, userId);
console.log(`\nMCP token for ${username}:`);
console.log(mcpToken);
console.log(`\nThis is the only time this token will be shown. Store it securely.`);
