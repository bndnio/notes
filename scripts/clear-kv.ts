// Delete all keys from project KV namespaces (remote).
// Usage: bun run clear-kv
// Does not touch R2 — clear the bndnio-notes bucket separately in the dashboard or with aws/rclone.

import { execSync, spawnSync } from "child_process";

const KV_NAMESPACES: Record<string, string> = {
  MCP_TOKEN_KV: "dfae73f4893d406095ebb95b26e30563",
  USER_INDEX_KV: "3bc2721c49b44e21bc5e028c7cef54c3",
  PROFILE_KV: "6efa814a66e041008f334fd9b83ca30f",
  NOTION_TOKEN_KV: "9bb4ca36b284453b8899d8068f30837d",
  EPHEMERAL_KV: "da30844449de47bbb874342583c9c485",
};

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

function clearKvNamespace(name: string, namespaceId: string): void {
  const keys = listKvKeys(namespaceId);
  console.log(`${name}: deleting ${keys.length} key(s)`);
  for (const key of keys) {
    deleteKey(namespaceId, key);
  }
}

console.log("Clearing remote KV namespaces…\n");
for (const [name, id] of Object.entries(KV_NAMESPACES)) {
  clearKvNamespace(name, id);
}
console.log("\nDone.");
