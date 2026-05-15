// Rotate a Notion token: re-encrypts and overwrites the token in NOTION_TOKEN_KV.
// Usage: ENCRYPTION_KEY=<key> bun run rotate-notion-token <username> <notion-token>

import { encrypt } from "../lib/crypto";
import { execSync } from "child_process";

const NOTION_TOKEN_KV_ID = "9bb4ca36b284453b8899d8068f30837d";

const [, , username, notionToken] = process.argv;

if (!username || !notionToken) {
  console.error("Usage: ENCRYPTION_KEY=<key> bun run rotate-notion-token <username> <notion-token>");
  process.exit(1);
}

const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("ENCRYPTION_KEY env var is required");
  process.exit(1);
}

const encrypted = await encrypt(notionToken, encryptionKey);
execSync(`bunx wrangler kv key put --namespace-id=${NOTION_TOKEN_KV_ID} "${username}" "${encrypted}" --remote`, { stdio: "inherit" });
console.log(`Stored encrypted token for ${username}`);
