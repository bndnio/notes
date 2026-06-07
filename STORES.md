# Storage Reference

## D1 Database

Binding: `DB` (`bndnio-notes`)

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | 8-char hex user id |
| `username` | text unique | Login handle; email routing uses `u_<username>@<EMAIL_DOMAIN>` |
| `require_sender_match` | boolean | When true, inbound email must come from a registered address |
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

| Key | Value | TTL |
|-----|-------|-----|
| `session:<hmac-sha256(sessionToken)>` | `userId` | 7 days |
| `pin:<email>` | JSON `{pin, type, ...payload}` | 10 min |
| `pin_attempts:<email>` | attempt count (string) | 10 min |
| `pin_send_count:<email>` | send count (string) | 1 hr |
| `pin_send_count_ip:<ip>` | send count (string) | 1 hr |
| `notion_state:<randomHex32>` | `userId` | 15 min |
| `notion_token:<userId>` | AES-GCM encrypted OAuth token (base64), pending DB selection | 1 hr |
| `notion_dbs:<userId>` | JSON `Array<{id, title}>` | 1 hr |
| `mcp_token:<userId>` | AES-GCM encrypted MCP token (base64), pending until Done | 1 hr |

**`pin` payload** varies by type:
- `register`: `{pin, type: "register", username, requireSenderMatch}`
- `login`: `{pin, type: "login", userId}`

**`notion_dbs`** is written during OAuth callback and deleted after DB selection (or expires after 1 hr if the user never completes setup).

**`mcp_token`** is written when the user generates a token and deleted when they click Done. Clicking Done commits the hash to D1 — the hash is not written to the database until that point.

---

## R2 Bucket

### NOTES_BUCKET `bndnio-notes`

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
