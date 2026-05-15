// Add a new user: registers email → username, stores profile, and encrypts + stores Notion token.
// Usage: ENCRYPTION_KEY=<key> bun run add-user <email> <username> <notionDbId> <notionToken>

import { encrypt } from "../lib/crypto";
import { execSync } from "child_process";

const SENDER_KV_ID = "3bc2721c49b44e21bc5e028c7cef54c3";
const NOTION_DB_KV_ID = "6efa814a66e041008f334fd9b83ca30f";
const NOTION_TOKEN_KV_ID = "9bb4ca36b284453b8899d8068f30837d";

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

kv(SENDER_KV_ID, email, username);
console.log(`Mapped email: ${email} → ${username}`);

kv(NOTION_DB_KV_ID, username, JSON.stringify({ username, notionDbId }));
console.log(`Stored profile for ${username}`);

const encrypted = await encrypt(notionToken, encryptionKey);
kv(NOTION_TOKEN_KV_ID, username, encrypted);
console.log(`Stored encrypted Notion token for ${username}`);
