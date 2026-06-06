// Rotate a Notion token: re-encrypts and overwrites the token in NOTION_TOKEN_KV.
// Usage: SEC_ENCRYPTION_KEY=<key> bun run rotate-notion-token <username> <notion-token>

import { encrypt } from "../lib/crypto";
import { execSync } from "child_process";

const USER_INDEX_KV_ID = "3bc2721c49b44e21bc5e028c7cef54c3";
const NOTION_TOKEN_KV_ID = "9bb4ca36b284453b8899d8068f30837d";

const [, , username, notionToken] = process.argv;

if (!username || !notionToken) {
  console.error("Usage: SEC_ENCRYPTION_KEY=<key> bun run rotate-notion-token <username> <notion-token>");
  process.exit(1);
}

const encryptionKey = process.env.SEC_ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("SEC_ENCRYPTION_KEY env var is required");
  process.exit(1);
}

const userId = execSync(
  `bunx wrangler kv key get --namespace-id=${USER_INDEX_KV_ID} "${username}" --remote`
).toString().trim();

if (!userId) {
  console.error(`No userId found for username: ${username}`);
  process.exit(1);
}

const encrypted = await encrypt(notionToken, encryptionKey);
execSync(`bunx wrangler kv key put --namespace-id=${NOTION_TOKEN_KV_ID} "${userId}" "${encrypted}" --remote`, { stdio: "inherit" });
console.log(`Rotated Notion token for ${username} (${userId})`);
