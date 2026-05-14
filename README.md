# notes@bndn.io → R2 + Notion Setup Guide

## What this does
Emails sent to `notes@bndn.io` from your personal address are:
1. Validated (all other senders are silently rejected)
2. Saved to R2 as structured JSON + raw `.eml`
3. Posted as a page in a Notion database

---

## Prerequisites
- Your domain `bndn.io` on Cloudflare (free plan is fine)
- Node.js installed locally
- A Notion account

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
bunx wrangler r2 bucket create bndnio-notes
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
bun run secret-sender       # your personal email address
bun run secret-notion-token # Notion integration secret (secret_...)
bun run secret-notion-db    # Notion database ID
bun run secret-mcp-token    # random token for MCP auth (see Step 9)
```

---

## Step 6 — Deploy

```bash
bunx wrangler deploy
```

---

## Step 7 — Wire up Email Routing

1. Cloudflare Dashboard → **Email** → **Email Routing** → **Routing Rules**
2. Add a rule:
   - **From:** `notes@bndn.io`
   - **Action:** Send to Worker → select `notes-capture`
3. Save

---

## Step 8 — Test it

Send an email from your personal address to `notes@bndn.io`.

Check:
- **Cloudflare Dashboard → Workers → notes-capture → Logs** for real-time output
- **R2 → bndnio-notes bucket** for the saved files
- **Notion** for the new page

---

## Step 9 — Set up MCP (optional, for AI agents)

This worker exposes a Remote MCP server at `/mcp` so AI agents (Claude Code, etc.) can save notes directly without email.

### Generate a token

```bash
openssl rand -hex 32
```

### Set the secret

```bash
bun run secret-mcp-token
# Paste the token when prompted
```

### Register with Claude Code

```bash
claude mcp add --transport http notes \
  https://bndnio-notes.brendonaearl.workers.dev/mcp \
  --header "Authorization: Bearer <your-token>"
```

This writes to `~/.claude.json`. The `save_note` tool (accepts `subject` and `body`) will appear automatically in every Claude Code session.

### Rotate the token

Generate a new token, run `bun run secret-mcp-token`, and update the `Authorization` header in `~/.claude.json`.

---

## Retrieving notes for AI processing

### Download all notes from R2
```bash
# List all notes
bunx wrangler r2 object list bndnio-notes --prefix notes/

# Download a specific file
bunx wrangler r2 object get bndnio-notes notes/2026-05-13/2026-05-13T10-32-00Z-my-idea.json --file ./my-idea.json
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
        ├── 2026-05-13T10-32-00Z-coffee-shop-idea.md    ← structured note (email or MCP)
        └── 2026-05-13T10-32-00Z-coffee-shop-idea.eml   ← raw email backup (email path only)
```

Each `.md` looks like:
```markdown
---
timestamp: 2026-05-13T10:32:00.000Z
from: you@youremail.com
to: notes@bndn.io
subject: Coffee shop idea
raw_key: notes/2026-05-13/2026-05-13T10-32-00Z-coffee-shop-idea.eml
---

The full note body here...
```
