# Storage Reference

Remote artifacts this project depends on (Worker, Email Routing, GitHub, Notion, Resend, packages) are inventoried in [REMOTE.md](REMOTE.md). This file is the schema and key map for the stores listed there.

## D1 Database

Binding: `DB` (`bndnio-notes`, id `512d5056-9718-4afd-b2d0-4c6b88e6c2be`)

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | 8-char hex user id |
| `username` | text unique | Login handle; email routing uses `u_<username>@<EMAIL_DOMAIN>` |
| `require_sender_match` | boolean | When true, inbound email must come from a registered address |
| `storage_enabled` | boolean | When true, notes are archived to R2 (`NOTES_BUCKET`); default false |
| `mcp_token_hash` | text unique nullable | HMAC-SHA256 of active MCP bearer token |
| `created_at` | integer | Unix ms |

### `user_emails`

| Column | Type | Notes |
|--------|------|-------|
| `email` | text PK | Lowercase email address |
| `user_id` | text FK → `users.id` | |
| `created_at` | integer | Earliest row is the primary email |

### `notion_integrations`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | text PK FK → `users.id` | |
| `database_id` | text | Selected Notion database id |
| `access_token_encrypted` | text | AES-GCM encrypted OAuth access token (base64) |
| `created_at` | integer | |
| `updated_at` | integer | |

---

## KV Namespaces

### EPHEMERAL_KV `da30844449de47bbb874342583c9c485`
Short-lived state. All entries expire automatically.

All access goes through a typed repository in `src/kv/repositories/` — one module per entity, which owns the key format, value shape, and TTL. Callers never build keys or call `EPHEMERAL_KV` directly.

| Key | Value | TTL | Repository |
|-----|-------|-----|------------|
| `session:<hmac-sha256(sessionToken)>` | `userId` | 7 days | `sessions` |
| `pin:<email>` | JSON `{pin, type, ...payload}` | 10 min | `pins` |
| `pin_attempts:<email>` | attempt count (string) | 10 min | `pins` |
| `pin_send_count:<email>` | send count (string) | 1 hr | `pin-send-counts` |
| `pin_send_count_ip:<ip>` | send count (string) | 1 hr | `pin-send-counts` |
| `notion_state:<randomHex32>` | `userId` | 15 min | `notion` |
| `notion_token:<userId>` | AES-GCM encrypted OAuth token (base64), pending DB selection | 1 hr | `notion` |
| `notion_dbs:<userId>` | JSON `Array<{id, title}>` | 1 hr | `notion` |
| `notion_schema_error:<userId>` | schema validation message shown on the database picker | 1 hr | `notion` |
| `mcp_token:<userId>` | AES-GCM encrypted MCP token (base64), pending until Done | 1 hr | `mcp-tokens` |
| `email_add:<userId>` | pending email address (string), awaiting PIN verification | 10 min | `email-adds` |

**`pin` payload** varies by type:
- `register`: `{pin, type: "register", username, requireSenderMatch}`
- `login`: `{pin, type: "login", userId}`
- `email_add`: `{pin, type: "email_add", userId}` — keyed by the *new* address, not the account's existing one

**`email_add`** points at the single address a user is currently verifying; its presence is the pending state. The PIN itself lives under `pin:<newAddress>`, so both expire together. Written by `POST /api/email`, deleted by `POST /api/email/verify` or `POST /api/email/cancel`. An address is never inserted into `user_emails` until the PIN sent to it comes back.

**`notion_dbs`** is written during OAuth callback and deleted after DB selection (or expires after 1 hr if the user never completes setup). **`notion_schema_error`** is written when the chosen database fails schema validation and deleted with the other pending Notion keys once selection succeeds.

**`mcp_token`** is written when the user generates a token and deleted when they click Done. Clicking Done commits the hash to D1 — the hash is not written to the database until that point.

---

## R2 Bucket

### NOTES_BUCKET `bndnio-notes`

Opt-in per user via `users.storage_enabled`. Disabling storage deletes all objects under `<userId>/`.

| Key pattern | Content type |
|-------------|-------------|
| `<userId>/<YYYY-MM-DD>/<HH>h<MM>-<slug>.md` | `text/markdown` — note with YAML frontmatter |
| `<userId>/<YYYY-MM-DD>/<HH>h<MM>-<slug>.eml` | `message/rfc822` — raw email backup |

---

## Worker Secrets

Set on the deployed worker via `wrangler secret put` (or the `secret-*` npm scripts). Local dev loads the same names from `.dev.vars`.

| Secret | Purpose |
|---------|---------|
| `SEC_ENCRYPTION_KEY` | Base64-encoded 256-bit key. Used for AES-GCM encrypt/decrypt (Notion tokens, MCP tokens) and HMAC-SHA256 (session hashes, MCP token hashes). |
| `SEC_RESEND_API_KEY` | Resend API key for sending PIN emails. |
| `SEC_NOTION_CLIENT_SECRET` | Notion OAuth app client secret. Used in the token exchange during OAuth callback. |

---

## Plain Vars

Production defaults are in `wrangler.toml` `[vars]`. Local dev overrides the same keys in `.dev.vars`.

| Var | Production (`wrangler.toml`) | Local dev (`.dev.vars`) |
|-----|------------------------------|-------------------------|
| `EMAIL_DOMAIN` | `notes.bndn.io` | (omit — uses toml default) |
| `APP_URL` | `https://notes.bndn.io` | `https://localhost:8787` |
| `NOTION_CLIENT_ID` | `364d872b-594c-81b2-ab69-0037727845d4` | your dev OAuth client id |

### Local development

Copy `.dev.vars.example` to `.dev.vars`. Wrangler loads all keys from there during `wrangler dev` — no separate sync step.
