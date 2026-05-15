// Map an additional email address to an existing username.
// Usage: bun run add-email <email> <username>

import { execSync } from "child_process";

const SENDER_KV_ID = "3bc2721c49b44e21bc5e028c7cef54c3";

const [, , email, username] = process.argv;

if (!email || !username) {
  console.error("Usage: bun run add-email <email> <username>");
  process.exit(1);
}

execSync(`bunx wrangler kv key put --namespace-id=${SENDER_KV_ID} "${email}" "${username}" --remote`, { stdio: "inherit" });
console.log(`Mapped email: ${email} → ${username}`);
