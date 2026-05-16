// Generate a per-user MCP Bearer token and store its HMAC in MCP_TOKEN_KV.
// Usage: ENCRYPTION_KEY=<key> bun run generate-mcp-token <username>

import { hmacToken } from "../lib/crypto";
import { execSync } from "child_process";

const USER_INDEX_KV_ID = "3bc2721c49b44e21bc5e028c7cef54c3";
const MCP_TOKEN_KV_ID = "dfae73f4893d406095ebb95b26e30563";

const [, , username] = process.argv;

if (!username) {
  console.error("Usage: ENCRYPTION_KEY=<key> bun run generate-mcp-token <username>");
  process.exit(1);
}

const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error("ENCRYPTION_KEY env var is required");
  process.exit(1);
}

const userId = execSync(
  `bunx wrangler kv key get --namespace-id=${USER_INDEX_KV_ID} "${username}" --remote`
).toString().trim();

if (!userId) {
  console.error(`No userId found for username: ${username}`);
  process.exit(1);
}

const tokenBytes = new Uint8Array(32);
crypto.getRandomValues(tokenBytes);
const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

const hash = await hmacToken(token, encryptionKey);
execSync(`bunx wrangler kv key put --namespace-id=${MCP_TOKEN_KV_ID} "${hash}" "${userId}" --remote`, { stdio: "inherit" });

console.log(`\nMCP token for ${username}:`);
console.log(token);
console.log(`\nThis is the only time this token will be shown. Store it securely.`);
