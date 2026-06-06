# notes@bndn.io → R2 + Notion Setup Guide

## What this does
Notes can be captured two ways:
- **Email** — send to `notes@bndn.io` from your personal address
- **MCP** — AI agents (Claude Code) call the `save_note` tool directly

All notes are saved to R2 as `.md` and posted to a Notion database. Email notes also keep a raw `.eml` backup.

---

## Prerequisites
- Your domain `bndn.io` on Cloudflare (free plan is fine)
- Bun installed locally
- A Notion account

---

## Local development

`bun run dev` runs `wrangler dev --local-protocol https`, which starts a local Worker on **https://localhost:8787** and emulates your Cloudflare bindings from `wrangler.toml`:

| Binding | Local behavior |
|---------|----------------|
| D1 (`DB`) | SQLite under `.wrangler/` |
| KV (all namespaces) | Local KV under `.wrangler/` |
| R2 (`NOTES_BUCKET`) | Local R2 under `.wrangler/` |
| Vars & secrets | Loaded from `.dev.vars` (overrides `wrangler.toml` `[vars]`) |
| Static assets | Served from `./assets` |

That is enough to run the web app locally, but a few **one-time** steps are still required before register/login/profile will work.

### One-time setup

```bash
bun install
cp .dev.vars.example .dev.vars
bunx wrangler d1 migrations apply bndnio-notes --local
```

**`.dev.vars`** — gitignored local config. Wrangler loads it automatically during `wrangler dev`. Keys here override matching `[vars]` in `wrangler.toml`. Set `APP_URL=https://localhost:8787`, run `bun run gen-key` for `SEC_ENCRYPTION_KEY`, and use dummy values for `SEC_RESEND_API_KEY` / `SEC_NOTION_CLIENT_SECRET` if unused locally.

**D1 migrations** — not applied automatically by `wrangler dev`. Run the command above once (and again after new migrations land).

### Day-to-day

```bash
bun run dev
```

Open https://localhost:8787 (accept the browser warning for wrangler’s local certificate). Register a new account or log in with a user that exists in **local** D1 (local data starts empty and is separate from production).

Login/register PINs are logged in the **terminal running wrangler**, not the browser console, when `APP_URL` points at localhost (local dev).

### What works differently locally

- **Inbound email** — Cloudflare Email Routing only hits the deployed worker, not localhost.
- **Resend** — skipped when running on localhost; PINs go to the wrangler terminal instead.
- **Notion OAuth** — Notion requires HTTPS redirect URIs. Add `https://localhost:8787/integration/notion/callback` in your Notion integration settings. `APP_URL` in `.dev.vars` must use the same origin.

### Local vs remote dev

- **`bun run dev`** (default) — all bindings emulated locally; isolated from production data.
- **`wrangler dev --remote`** — uses remote KV/D1/R2/secrets on Cloudflare while serving on localhost; closer to production but touches real data.

---

## Production setup

The steps below are for deploying to Cloudflare. Skip this section if you only need local development.

---

## Step 1 — Install dependencies

```bash
bun install
bunx wrangler login
```

---

## Step 2 — Enable Cloudflare Email Routing

1. Cloudflare Dashboard → your domain → **Email** → **Email Routing**
2. Enable it and add your personal address as a destination (Cloudflare will send a verification email)
3. You don't need to add the route yet — do that after deploying the Worker

---

## Step 3 — Create the R2 bucket

```bash
bun run bucket
```

---

## Step 4 — Set up Notion

1. Go to https://www.notion.so/my-integrations → **New integration**
   - Name it "Notes Capture"
   - Select your workspace
   - Copy the **Internal Integration Secret** (starts with `secret_...`)

2. Create a new **full-page database** in Notion called "Notes"
   Add these properties:
   - `Name` — Title (already exists by default)
   - `Date` — Date
   - `From` — Text

3. Open the database → click `...` menu → **Add connections** → select "Notes Capture"

4. Copy the database ID from the URL:
   `https://notion.so/yourworkspace/`**`THIS-PART-IS-THE-ID`**`?v=...`
   (32-char hex string, with or without hyphens)

---

## Step 5 — Set secrets

```bash
bun run gen-key
bun run secret-encryption-key   # paste the key from gen-key
bun run secret-resend-key       # Resend API key
bun run secret-notion-client-secret  # Notion OAuth client secret
```

---

## Step 6 — Deploy

```bash
bun run deploy
```

---

## Step 7 — Wire up Email Routing

1. Cloudflare Dashboard → **Email** → **Email Routing** → **Routing Rules**
2. Add a rule:
   - **From:** `notes@bndn.io`
   - **Action:** Send to Worker → select `bndnio-notes`
3. Save

---

## Step 8 — Test it

Send an email from your personal address to `notes@bndn.io`.

Check:
- **Cloudflare Dashboard → Workers → bndnio-notes → Logs** for real-time output
- **R2 → bndnio-notes bucket** for the saved files
- **Notion** for the new page

---

## Step 9 — Set up MCP (optional, for AI agents)

This worker exposes a Remote MCP server at `/mcp` so AI agents (Claude Code, etc.) can save notes directly without email.

Register at `/profile` → **MCP Server** → **Setup**, or generate a token from the CLI:

```bash
SEC_ENCRYPTION_KEY=<key> bun run generate-mcp-token <username>
```

Add the token to your shell as `NOTES_MCP_TOKEN` and register with Claude Code — see the setup modal on `/profile` for the exact command.

---

## Retrieving notes for AI processing

### Download all notes from R2
```bash
# List all notes
bunx wrangler r2 object list bndnio-notes --prefix notes/

# Download a specific file
bunx wrangler r2 object get bndnio-notes notes/2026-05-13/20h32-my-idea.md --file ./my-idea.md
```

### Bulk download with a script
```javascript
// pull-notes.js — run with: bun pull-notes.js
// Requires: bun add @aws-sdk/client-s3
// R2 is S3-compatible — get your R2 API token from Cloudflare Dashboard
// → R2 → Manage R2 API tokens

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFileSync, mkdirSync } from "fs";

const client = new S3Client({
  region: "auto",
  endpoint: "https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "<R2_ACCESS_KEY_ID>",
    secretAccessKey: "<R2_SECRET_ACCESS_KEY>",
  },
});

const list = await client.send(new ListObjectsV2Command({
  Bucket: "bndnio-notes",
  Prefix: "notes/",
}));

mkdirSync("./downloaded-notes", { recursive: true });

for (const obj of list.Contents ?? []) {
  if (!obj.Key.endsWith(".md")) continue;
  const res = await client.send(new GetObjectCommand({ Bucket: "bndnio-notes", Key: obj.Key }));
  const text = await res.Body.transformToString();
  const filename = obj.Key.replace(/\//g, "-");
  writeFileSync(`./downloaded-notes/${filename}`, text);
  console.log(`Downloaded: ${filename}`);
}
```

---

## File structure in R2

```
bndnio-notes/
└── notes/
    └── 2026-05-13/
        ├── 20h32-coffee-shop-idea.md    ← structured note (email or MCP)
        └── 20h32-coffee-shop-idea.eml   ← raw email backup (email path only)
```

Email note `.md`:
```markdown
---
timestamp: 2026-05-13T10:32:00.000Z
from: you@youremail.com
to: notes@bndn.io
subject: Coffee shop idea
emlKey: notes/2026-05-13/20h32-coffee-shop-idea.eml
---

The full note body here...
```

MCP note `.md`:
```markdown
---
timestamp: 2026-05-13T10:32:00.000Z
from: mcp
to: 
subject: Coffee shop idea
---

The full note body here...
```
