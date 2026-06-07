// Delete all keys from EPHEMERAL_KV (remote).
// Usage: bun run clear-kv
// Does not touch R2 — clear the bndnio-notes bucket separately in the dashboard or with aws/rclone.

import { execSync, spawnSync } from "child_process";

const EPHEMERAL_KV_ID = "da30844449de47bbb874342583c9c485";

function listKvKeys(namespaceId: string): string[] {
  const out = execSync(`bunx wrangler kv key list --namespace-id=${namespaceId} --remote`, {
    encoding: "utf8",
  }).trim();
  const page = JSON.parse(out) as Array<{ name: string }>;
  return page.map((e) => e.name);
}

function deleteKey(namespaceId: string, key: string): void {
  spawnSync("bunx", ["wrangler", "kv", "key", "delete", `--namespace-id=${namespaceId}`, "--remote", key], {
    stdio: "inherit",
  });
}

const keys = listKvKeys(EPHEMERAL_KV_ID);
console.log(`EPHEMERAL_KV: deleting ${keys.length} key(s)`);
for (const key of keys) {
  deleteKey(EPHEMERAL_KV_ID, key);
}
console.log("\nDone.");
