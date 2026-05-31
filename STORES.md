# Storage Reference

## KV Namespaces

### MCP_TOKEN_KV `dfae73f4893d406095ebb95b26e30563`
Maps MCP auth tokens to users. Looked up on every MCP request.

| Key | Value | TTL |
|-----|-------|-----|
| `<hmac-sha256(mcpToken)>` | `userId` | permanent |

Entries are created on token generation and deleted when a new token is generated for the same user.

---

### USER_INDEX_KV `3bc2721c49b44e21bc5e028c7cef54c3`
Reverse-lookup index for finding a userId by email or username.

| Key | Value | TTL |
|-----|-------|-----|
| `<email>` | `userId` | permanent |
| `<username>` | `userId` | permanent |

---

### PROFILE_KV `6efa814a66e041008f334fd9b83ca30f`
User profile records.

| Key | Value | TTL |
|-----|-------|-----|
| `<userId>` | JSON `Profile` | permanent |

`Profile` shape:
```ts
{
  userId: string
  username: string
  notionDbId?: string       // set after Notion DB is selected
  mcpTokenHash?: string     // hmac of current active MCP token
  requireSenderMatch?: boolean
}
```

---

### NOTION_TOKEN_KV `9bb4ca36b284453b8899d8068f30837d`
Encrypted Notion OAuth access tokens.

| Key | Value | TTL |
|-----|-------|-----|
| `<userId>` | AES-GCM encrypted Notion access token (base64) | permanent |

Written during Notion OAuth callback. Overwritten if user reconnects.

---

### EPHEMERAL_KV `da30844449de47bbb874342583c9c485`
Short-lived state. All entries expire automatically.

| Key | Value | TTL |
|-----|-------|-----|
| `session:<hmac-sha256(sessionToken)>` | `userId` | 7 days |
| `pin:<email>` | JSON `{pin, type, ...payload}` | 10 min |
| `pin_attempts:<email>` | attempt count (string) | 10 min |
| `notion_state:<randomHex32>` | `userId` | 15 min |
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

## Secrets Store `065d291326ea4a1d8181859d83f313be`

| Binding | Purpose |
|---------|---------|
| `ENCRYPTION_KEY` | Base64-encoded 256-bit key. Used for AES-GCM encrypt/decrypt (Notion tokens, MCP tokens) and HMAC-SHA256 (session hashes, MCP token hashes). |
| `RESEND_API_KEY` | Resend API key for sending PIN emails. |
| `NOTION_CLIENT_SECRET` | Notion OAuth app client secret. Used in the token exchange during OAuth callback. |

---

## Plain Vars

| Var | Value |
|-----|-------|
| `EMAIL_DOMAIN` | `notes.bndn.io` |
| `APP_URL` | `https://notes.bndn.io` |
| `NOTION_CLIENT_ID` | `364d872b-594c-81b2-ab69-0037727845d4` |
