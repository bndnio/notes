# Production Architecture Notes

Considerations for scaling the email-to-notes worker into a multi-user product.

---

## Current Stack

- **Inbound email**: Cloudflare Email Routing → `notes@bndn.io`
- **Processing**: Cloudflare Worker (`worker.ts`)
- **Storage**: R2 (`.md` + raw `.eml` per note)
- **Destination**: Notion API

---

## Multi-User Email Routing

Cloudflare Email Routing supports a **catch-all rule** that routes all `*@bndn.io`
mail to a single Worker — no per-address dashboard config needed, and there is an
API to manage the catch-all rule programmatically.

Each user gets an inbound address based on their username (e.g. `username@bndn.io`).
The Worker reads `message.to`, extracts the local part, looks up the username in
D1, and proceeds. Usernames must be unique and immutable after creation — changing
a username would silently break any saved contacts or email rules the user has set up.

```ts
const username = message.to.split("@")[0].toLowerCase();
const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?")
  .bind(username)
  .first();
```

Since the service only **receives** email, deliverability (SPF, DKIM, sender
reputation) is irrelevant — Cloudflare manages the MX records.

---

## Architectural Considerations

### 1. Abuse / Unknown Username Handling

A catch-all means emails to unknown or deleted usernames hit the Worker. The
**first** thing the handler should do is look up the username in D1/KV. If
no match, call `message.setReject()` and return immediately — before any parsing
or I/O.

```ts
async email(message, env, ctx) {
  const username = message.to.split("@")[0].toLowerCase();
  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?")
    .bind(username)
    .first();

  if (!user) {
    message.setReject("Address not found");
    return;
  }

  // proceed with parsing...
}
```

### 2. Reliability / Delivery Guarantees

The current architecture loses notes silently if a destination API (e.g. Notion)
is down. Wrap destination writes in a **Cloudflare Queue** so failures are retried
automatically. R2 serves as the durable record; the queue handler syncs to the
destination asynchronously.

A single Worker handles both roles — no separate Workers needed. The `email`
handler parses, saves to R2, and enqueues a job; the `queue` handler processes
it and writes to the destination:

```ts
export default {
  async email(message, env, ctx) {
    // parse, save to R2, then:
    await env.QUEUE.send({ userId, subject, body, r2Key });
  },

  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      await postToNotion(msg.body, env);
      msg.ack();
    }
  },
};
```

Declared in `wrangler.toml` as both producer and consumer:

```toml
[[queues.producers]]
binding = "QUEUE"
queue = "notes-queue"

[[queues.consumers]]
queue = "notes-queue"
max_retries = 5
```

Cloudflare invokes the `queue` handler automatically — no polling. The only
reason to split into separate Workers is if the consumer logic warrants
independent deployments or different resource limits.

### 3. Per-User Secrets Storage

Worker env vars are global — they can't hold per-user credentials. Each user's
destination tokens (e.g. Notion OAuth token) should be stored encrypted in **D1**,
fetched at runtime by username after lookup.

```ts
const integration = await env.DB.prepare(
  "SELECT config FROM integrations WHERE user_id = ? AND type = ? AND enabled = 1"
).bind(user.id, "notion").first();

const { notionToken, databaseId } = JSON.parse(decrypt(integration.config, env.ENCRYPTION_KEY));
```

### 4. Integration Model

Avoid baking Notion in everywhere. A clean schema supports multiple destination
types from day one:

```
integrations
  id
  user_id
  type        -- "notion" | "webhook" | "email_forward" | ...
  config      -- encrypted JSON blob (database_id, webhook_url, etc.)
  enabled
```

The queue handler dispatches to the right integration based on `type`:

```ts
async function dispatchToIntegrations(note, user, env) {
  const integrations = await env.DB.prepare(
    "SELECT * FROM integrations WHERE user_id = ? AND enabled = 1"
  ).bind(user.id).all();

  await Promise.allSettled(
    integrations.results.map((integration) => {
      const config = JSON.parse(decrypt(integration.config, env.ENCRYPTION_KEY));
      switch (integration.type) {
        case "notion":  return postToNotion(note, config);
        case "webhook": return postToWebhook(note, config);
        default: console.warn(`Unknown integration type: ${integration.type}`);
      }
    })
  );
}
```

This makes adding new destinations straightforward without schema migrations.

### 5. Attachments

Currently skipped entirely — only `text/plain` is extracted. For a production
product, decisions needed:

- Store attachments in R2 under a per-user prefix (`attachments/{userId}/{noteId}/{filename}`)
- Append a signed URL to the note body
- Decide which MIME types to accept vs. ignore

```ts
if (partType.startsWith("image/") || partType === "application/pdf") {
  const filename = partHeaders["content-disposition"]?.match(/filename="?([^";]+)"?/i)?.[1];
  const key = `attachments/${userId}/${noteId}/${filename ?? "attachment"}`;
  await env.NOTES_BUCKET.put(key, decodeBodyContent(partBody, partEncoding));
  attachmentKeys.push(key);
}
```

### 6. Workers Paid Tier

The free tier (100k requests/day, 10ms CPU) is sufficient for a single user but
will hit limits across multiple users. Workers Paid ($5/month) gives 10M
requests/month and 30ms CPU — worth enabling from day one for a product.

```toml
[usage_model]
usage_model = "standard"
```

---

## Suggested D1 Schema (Sketch)

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,   -- the local part of username@bndn.io
  email       TEXT UNIQUE NOT NULL,   -- login/auth email, distinct from inbound address
  created_at  TEXT NOT NULL
);

CREATE TABLE integrations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  config      TEXT NOT NULL,          -- encrypted JSON
  enabled     INTEGER NOT NULL DEFAULT 1
);
```

The `inbound_addresses` table is no longer needed — the username on the `users`
table is the inbound address. The Worker extracts the local part of `message.to`
and queries `SELECT * FROM users WHERE username = ?`.
