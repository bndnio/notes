# Working with this codebase

House rules for any AI agent collaborating on this project. These are not suggestions. Apply them by default; deviate only with explicit user instruction.

Each rule shows the exact mistake that triggered it. Pattern-match against the **Don't** blocks — if your in-progress code looks like one of those shapes, stop and rework.

---

## Data modelling

### Never duplicate state across schemas

Derive state from a single source of truth. If `X` exists, don't also store `hasX`.

**Why:** User asked, *"If you have mcpTokenHash on profile, then why do you have mcpConfigured?"* The presence of one value already communicates the state; a separate boolean is redundant and drifts.

**Don't** — add a flag that's computable from another field:
```ts
interface Profile {
  mcpTokenHash?: string;
  mcpConfigured: boolean;  // ← redundant; derivable from mcpTokenHash presence
  notionDbId?: string;
  notionPending?: boolean; // ← redundant; derivable from notion_dbs ephemeral key
}
```

**Do** — let presence/absence carry the meaning:
```ts
interface Profile {
  mcpTokenHash?: string;   // presence ⇒ MCP configured
  notionDbId?: string;     // presence ⇒ Notion connected
}
```

### Record every schema change in STORES.md

`STORES.md` at the repo root is the canonical map of every KV namespace, R2 bucket, secret, and key prefix. It must stay in sync with the code.

**Why:** STORES.md is what humans and future agents read to understand the storage layer without grepping. If it drifts from reality, debugging and onboarding suffer.

**Don't** — add a new KV prefix or change a value shape without touching STORES.md:
```ts
// added in this PR:
await env.EPHEMERAL_KV.put(`pin_attempts:${email}`, "0", { expirationTtl: 600 });
// STORES.md still lists only 5 EPHEMERAL_KV prefixes ← out of date
```

**Do** — update STORES.md as part of the same change:
```ts
// added in this PR:
await env.EPHEMERAL_KV.put(`pin_attempts:${email}`, "0", { expirationTtl: 600 });
```
```markdown
<!-- STORES.md, EPHEMERAL_KV table -->
| `pin_attempts:<email>` | attempt count (string) | 10 min |
```

Schema changes that require a STORES.md update include: adding/removing a KV key prefix, adding/removing a KV namespace, changing the shape of a stored JSON value, adding/removing a secret binding, changing R2 path structure.

### Pending/transient state belongs in TTL'd ephemeral storage

If a flag would be cleared "soon" or "after some action", put it in EPHEMERAL_KV with a TTL — not on a durable record.

**Why:** User asked, *"Is there another place we could put the notion pending key? It seems off on the profile?"* Pending state on a permanent record requires manual cleanup and pollutes the schema.

**Don't** — store pending state on the durable profile:
```ts
await env.PROFILE_KV.put(userId, JSON.stringify({
  ...profile,
  notionPending: true,  // ← who clears this? when?
}));
```

**Do** — use a TTL'd key whose existence IS the pending state:
```ts
await env.EPHEMERAL_KV.put(
  `notion_dbs:${userId}`,
  JSON.stringify(databases),
  { expirationTtl: 3600 },  // ← self-cleaning
);
// pending check: const isPending = !!(await env.EPHEMERAL_KV.get(`notion_dbs:${userId}`));
```

---

## UI & templating

### HTML always lives in template files

Never construct HTML as inline strings in handlers, even tiny fragments.

**Why:** User feedback during the modal refactor: *"Make sure the html is always in a template, not an inline string."*

**Don't** — build modal chrome as a string literal:
```ts
function buildNotionModal(databases: NotionDatabase[]): string {
  return `<div class="modal-overlay">
    <div class="modal">
      <form method="POST" action="/integration/notion/select">
        ${databases.map(d => `<input type="radio" value="${escHtml(d.id)}">`).join('\n')}
      </form>
    </div>
  </div>`;
}
```

**Do** — put chrome in a template, pass only the dynamic fragment as a slot:
```ts
// templates/notion-select-modal.html contains the wrapper.
function buildNotionModal(databases: NotionDatabase[]): string {
  const options = databases
    .map(d => `<input type="radio" value="${escHtml(d.id)}">`)
    .join('\n');
  return renderTemplate(notionSelectModalHtml, { databases: options });
}
```

If you find yourself writing more than a single `<input>` or `<button>` inline, that's the signal — extract a template.

### Static UI strings live in templates, not in code

If a string doesn't vary at runtime, hardcode it in the template. Code-level string variables are only justified when the value actually changes based on runtime data.

**Why:** User asked, *"why is there an mcpDescription now?"* The variable held the same string in every branch — there was no dynamic data to compute. The badge already communicated state; the description was decorative copy that belonged in HTML.

**Don't** — introduce a variable that always holds the same value:
```ts
let mcpDescription: string;
if (mcpTokenHash) {
  mcpDescription = "Connect Notes to Claude Code as an AI tool.";
} else {
  mcpDescription = "Connect Notes to Claude Code as an AI tool.";
}
return renderTemplate(profileHtml, { mcpDescription, ... });
```

**Do** — write the string directly in the template:
```html
<!-- profile.html -->
<div class="status-card-info">
  <h3>MCP Server</h3>
  <p>Connect Notes to Claude Code as an AI tool.</p>
</div>
```

---

## Behaviour & lifecycle

### Generate secrets lazily, not preemptively

Don't pre-generate tokens during signup or initial setup. Create them when the user initiates the specific action that needs them.

**Why:** User direction: *"I only want to generate the token when the modal first opens."* Preemptive generation creates orphaned credentials if the user never completes the flow.

**Don't** — generate during registration to "have it ready":
```ts
export async function completeRegistration(env, email, pending) {
  const userId = await generateUniqueUserId(env.PROFILE_KV);
  const mcpToken = generateRandomHex(32);            // ← may never be used
  const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
  await env.MCP_TOKEN_KV.put(mcpTokenHash, userId);  // ← orphaned credential
  return { sessionToken, mcpToken };
}
```

**Do** — registration only sets up the session; a dedicated endpoint generates on demand:
```ts
export async function completeRegistration(env, email, pending) {
  // ...only session + profile setup...
  return { sessionToken };
}

// User clicks "Setup →" → POST /setup-mcp/generate → token created and shown.
```

### Always use the session cookie for user identity

Never pass picker tokens or short-lived correlation tokens through form fields, URL params, or hidden inputs to identify the user across steps.

**Why:** Established preference. Session cookies are simpler, centralise auth, and prevent token leakage into URLs, form data, or browser history.

**Don't** — issue a token after step 1 to identify the user in step 2:
```ts
// step 1: store pending state under a random pickerToken, set it as a cookie or form field
const pickerToken = generateRandomHex(16);
await env.EPHEMERAL_KV.put(`picker:${pickerToken}`, JSON.stringify({ userId, databases }));

// step 2: read the pickerToken from a hidden input, resolve userId from it
<input type="hidden" name="pickerToken" value="{{pickerToken}}">
```

**Do** — resolve identity via the session cookie at every step:
```ts
const userId = await resolveSession(request, env, encryptionKey);
if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

const dbsJson = await env.EPHEMERAL_KV.get(`notion_dbs:${userId}`);
// pending state keyed by userId — no separate correlation token needed
```

---

## Error handling

### Distinct failure modes need distinct return values

Don't collapse "wrong input", "rate limited", and "expired" all into `null`. Callers can't give specific messages from an opaque failure.

**Why:** User pushback on rate-limit handling: *"make sure this gives a reason for why it's failing when the limit is exceeded."*

**Don't** — return `null` for every failure variant:
```ts
export async function consumePin(...): Promise<Record<string, unknown> | null> {
  if (!raw) return null;
  if (attempts >= 5) return null;            // ← caller sees same as "wrong PIN"
  if (data.pin !== pin) return null;
  return data;
}
// caller:
if (!data) return renderError("Invalid or expired PIN.");  // ← wrong message when locked
```

**Do** — use a discriminated return that forces the caller to handle each case:
```ts
export async function consumePin(...): Promise<Record<string, unknown> | "locked" | null> {
  if (!raw) return null;
  if (attempts >= 5) return "locked";
  if (data.pin !== pin) { /* increment */ return null; }
  return data;
}
// caller:
if (result === "locked") return renderError("Too many attempts. Request a new PIN.");
if (!result) return renderError("Invalid or expired PIN.");
```

---

## Security

### Defense in depth for sanitisation

When fixing a vulnerability, harden multiple layers — don't just close the one bug.

**Why:** After fixing `renderTemplate` to single-pass regex (closing template injection), user said yes to *also* escaping `{`/`}` in `escHtml`. If the engine ever regresses, the input layer still holds.

**Don't** — fix only the layer where the bug was reported:
```ts
// templating engine fixed to single-pass — done, ship it
export function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
// escHtml unchanged — `{` and `}` still pass through user input
```

**Do** — harden the input layer as well:
```ts
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\{/g, "&#123;")  // ← injection chars can't enter the system
    .replace(/\}/g, "&#125;");
}
```

For every security fix, ask: *what other layer could catch this?* and fix that too.

### Run a standard checklist on security review

When asked to review or audit, walk through these categories in order. The initial implementation of every category had bugs — they aren't theoretical.

1. **Template injection** — iterative substitution that re-scans replacement values (was: `replaceAll` in a loop over `vars`)
2. **Stored XSS** — server-side input validation gaps (was: `validateUsername` only checked length, allowing `<script>` usernames)
3. **Reflected XSS** — URL/form params rendered into templates without escaping (was: `{{email}}` in `verify.html` unescaped)
4. **OAuth state binding** — callback must verify the session matches the state's user (was: state mapped to userId with no session check — victim could complete attacker's OAuth flow)
5. **Rate limiting** — brute-force surface on PINs, tokens, login (was: 6-digit PIN with 10-min window and no attempt counter)
6. **Data lifecycle** — orphaned credentials on regenerate, expired pending state, double-writes (was: `MCP_TOKEN_KV` old entry only deleted on `regenerate=1`, leaving two active tokens after lapsed setup)

---

## Process

### Implement multi-step refactors one phase at a time

For any refactor touching multiple files or systems, finish one phase, pause for review, then continue.

**Why:** User direction during the profile/MCP/Notion refactor: *"Implement it only one phase at a time."* Batching loses opportunities for course correction; a single phase reviewed deeply beats five phases reviewed superficially.

**Don't** — produce a 7-file diff in one shot for a refactor with natural phases:
```
Edit lib/types.ts
Edit lib/registration.ts
Edit handlers/fetch/profile.ts
Edit handlers/fetch/setup-mcp.ts
Edit handlers/fetch/integration/notion.ts
Edit templates/profile.html
Edit templates/notion-relay.html
[no pause]
"Done!"
```

**Do** — finish one phase, summarise, wait:
```
Phase 1: data model changes
Edit lib/types.ts
Edit lib/registration.ts
"Phase 1 done — Profile now uses mcpTokenHash. Ready for phase 2 when you are."
[wait for "next"]
```

### Preserve all existing logging

When editing code, never remove existing `console.log`/`console.warn`/`console.error` calls. Improve them if needed; don't delete them.

**Why:** Established preference — logs encode operational knowledge that may not be obvious from the code. A refactor that "cleans up" logs is destroying institutional memory.

**Don't** — drop logs during a refactor because the new code "makes them obvious":
```ts
// before
const userId = await lookupUserId(env.USER_INDEX_KV, username);
if (!userId) {
  console.warn(`Rejected email to unknown username: ${username}`);
  message.setReject("Address not found");
  return;
}

// after (refactor) — log gone
const userId = await lookupUserId(env.USER_INDEX_KV, username);
if (!userId) {
  message.setReject("Address not found");
  return;
}
```

**Do** — port the log forward, improving it if helpful:
```ts
const userId = await lookupUserId(env.USER_INDEX_KV, username);
if (!userId) {
  console.warn(`Rejected email to unknown username: ${username}`);
  message.setReject("Address not found");
  return;
}
```

### Never echo secrets in plain text

Don't print tokens, keys, or PINs in shell commands, error messages, or stdout. Pipe directly into the consuming command.

**Why:** Echoing leaks secrets into terminal history, screen recordings, and CI logs.

**Don't** — display the secret value, then ask the user to copy-paste it:
```bash
$ bun run gen-key
abc123def456...
$ bunx wrangler secrets-store secret create ... --value "abc123def456..."
```

**Do** — pipe directly without ever rendering the value:
```bash
$ bun run gen-key | bunx wrangler secrets-store secret create ... --stdin
```

Or use the tool's interactive prompt (terminal does not echo):
```bash
$ bunx wrangler secret put MCP_AUTH_TOKEN
? Enter the secret text: [hidden input]
```

---

## Tooling

- Use `bun` (not `node`) and `bunx` (not `npx`) for all JS tooling
- `bun run <script>` for package.json scripts; `bunx <bin>` for package binaries (e.g. `bunx wrangler`)
- `bun add` for dependencies, not `npm install`
- Wrangler v4+: `wrangler kv key delete` does not accept `--force`; non-interactive callers skip the prompt automatically. Pass the key as a positional via `spawnSync` (not shell interpolation) to avoid injection on keys containing special chars
