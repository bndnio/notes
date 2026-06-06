// Sync secrets from .dev.vars into the local Secrets Store used by `wrangler dev`.
// Usage: bun run setup-dev

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const STORE_ID = "065d291326ea4a1d8181859d83f313be";
const SECRET_NAMES = ["ENCRYPTION_KEY", "RESEND_API_KEY", "NOTION_CLIENT_SECRET"] as const;

function generateEncryptionKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...key));
}

function isPlaceholderEncryptionKey(value: string): boolean {
  return !value || value.includes("replace-with-output-of-bun-run-gen-key");
}

function parseDevVars(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function upsertLocalSecret(name: string, value: string): void {
  const result = spawnSync(
    "bunx",
    [
      "wrangler", "secrets-store", "secret", "create", STORE_ID,
      "--name", name,
      "--scopes", "workers",
      "--value", value,
      "--remote=false",
    ],
    { stdio: "inherit", cwd: resolve(import.meta.dir, "..") },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const devVarsPath = resolve(import.meta.dir, "../.dev.vars");
if (!existsSync(devVarsPath)) {
  console.error("Missing .dev.vars — copy .dev.vars.example to .dev.vars first.");
  process.exit(1);
}

const vars = parseDevVars(devVarsPath);

if (isPlaceholderEncryptionKey(vars.ENCRYPTION_KEY ?? "")) {
  vars.ENCRYPTION_KEY = generateEncryptionKey();
  console.log("Generated ENCRYPTION_KEY for local dev (bun run gen-key). Add it to .dev.vars to persist.");
}

const missing = SECRET_NAMES.filter((name) => !vars[name]);
if (missing.length > 0) {
  console.error(`Missing in .dev.vars: ${missing.join(", ")}`);
  process.exit(1);
}

for (const name of SECRET_NAMES) {
  console.log(`Syncing local secret ${name}...`);
  upsertLocalSecret(name, vars[name]!);
}

console.log("Local dev secrets ready.");
