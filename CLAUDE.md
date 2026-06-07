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

Schema changes that require a STORES.md update include: adding/removing a KV key prefix, adding/removing a KV namespace, changing a D1 table or column, changing the shape of a stored JSON value, adding/removing a secret binding, changing R2 path structure.

### Pending/transient state belongs in TTL'd ephemeral storage

If a flag would be cleared "soon" or "after some action", put it in EPHEMERAL_KV with a TTL — not on a durable record.

**Why:** User asked, *"Is there another place we could put the notion pending key? It seems off on the profile?"* Pending state on a permanent record requires manual cleanup and pollutes the schema.

**Don't** — store pending state on the durable user record:
```ts
await db.update(users).set({ notionPending: true }).where(eq(users.id, userId));
// ← who clears this? when?
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
  const userId = await createUser(db, ...);
  const mcpToken = generateRandomHex(32);            // ← may never be used
  const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
  await usersRepo.updateMcpTokenHash(db, userId, mcpTokenHash);  // ← orphaned credential
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

### Authentication checks always go at the top of handlers

Resolve and verify the user's identity as the first thing a handler does, before reading form data, query params, or any state. Never defer auth checks to a downstream helper or repository.

**Why:** User instruction: *"authentication checks should be done at the top of the handlers, ALWAYS."* Deferring auth to a helper obscures the security boundary, makes it easy to skip, and can leave a handler partially executing on behalf of an unauthenticated caller.

**Don't** — let a helper do the auth check mid-handler:
```ts
async function handleSelectPost(request, env) {
  const form = await request.formData();           // ← executing before auth
  const dbId = form.get("dbId");
  const dbsJson = await env.EPHEMERAL_KV.get(...); // ← reading state before auth
  await completeNotionSetup(userId, ...);          // ← helper throws if user missing
}
```

**Do** — use the assert helpers as the first lines of every handler:
```ts
async function handleSelectPost(request, env) {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  // now safe to read form data and proceed
  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  ...
}
```

### Use throwing assert helpers, not discriminated returns

`assertSession`, `assertUser`, and `assertCsrf` throw `HttpError` on failure — they do not return `T | Response`. A single catch in the dispatcher (`handleFetch`) converts every `HttpError` into its response. Handlers contain no auth `if` checks at all.

**Why:** User asked *"if I keep them as assert methods that raise, can I keep everything consistent?"* — the answer was yes: session, user, and CSRF all fit the same `await assertX(...)` shape with no conditional check at the call site. Discriminated returns (`T | Response`) require every caller to check `instanceof Response` and early-return, which is boilerplate that grows with every new handler.

**Don't** — return a union and check at every call site:
```ts
// lib/auth.ts
export async function assertSession(...): Promise<{ userId: string } | Response> {
  if (!session) return Response.redirect(...);  // ← caller must check
  return session;
}

// handler
const session = await assertSession(request, env, encryptionKey);
if (session instanceof Response) return session;  // ← repeated in every handler
const { userId } = session;
```

**Do** — throw and catch once:
```ts
// lib/auth.ts
export async function assertSession(...): Promise<{ userId: string; sessionHash: string }> {
  if (!session) throw new HttpError(Response.redirect(...));
  return session;
}

// handlers/fetch/index.ts — one place
try {
  return await handler(request, env);
} catch (e) {
  if (e instanceof HttpError) return e.response;
  throw e;
}
```

`HttpError` is a plain class (not `extends Error`) — it is a control flow mechanism, not an exception. It lives in `lib/responses.ts` because it wraps a `Response`, not in `lib/auth.ts` or a dedicated errors file.

The one recognised exception is `handleCallback` in notion.ts, which does a cross-check (OAuth state userId vs session userId) rather than a plain "is authenticated" assertion. It stays manual and that's intentional.

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

### Never put user-controlled data into script template slots

`renderTemplate` substitutes `{{vars}}` with the same dumb string replacement whether it's inside HTML or a `<script>` block. `escHtml` guards against HTML injection but not JS injection — a value containing `'`, `\n`, or `</script>` will break out of a JS string literal or the script block entirely.

**Why:** Introduced when integration section templates (`notion-section.html`, `mcp-section.html`) were adopted. Each section template contains a `<script>` block, which increases the surface area where a developer might accidentally pass user data through a template var into a JS context.

**Don't** — substitute user-derived data inside a `<script>` in a template:
```html
<script>
  var name = '{{username}}';  // ← username containing ' or </script> breaks this
</script>
```

**Do** — pass user data through a DOM attribute, read it from JS:
```html
<div id="profile" data-username="{{username}}"></div>
<script>
  var name = document.getElementById('profile').dataset.username;
</script>
```

`escHtml` protects the attribute; JS reads from the DOM, never from raw template substitution. Section templates and any template containing `<script>` must only use server-controlled values (config vars, static strings, server-generated IDs).

### Run a standard checklist on security review

When asked to review or audit, walk through these categories in order. The initial implementation of every category had bugs — they aren't theoretical.

1. **Template injection** — iterative substitution that re-scans replacement values (was: `replaceAll` in a loop over `vars`)
2. **Stored XSS** — server-side input validation gaps (was: `validateUsername` only checked length, allowing `<script>` usernames)
3. **Reflected XSS** — URL/form params rendered into templates without escaping (was: `{{email}}` in `verify.html` unescaped)
4. **OAuth state binding** — callback must verify the session matches the state's user (was: state mapped to userId with no session check — victim could complete attacker's OAuth flow)
5. **Rate limiting** — brute-force surface on PINs, tokens, login (was: 6-digit PIN with 10-min window and no attempt counter)
6. **Data lifecycle** — orphaned credentials on regenerate, expired pending state, double-writes (was: old MCP hash left active after lapsed setup before pending-token flow)

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
const profile = await usersRepo.findByUsername(db, username);
if (!profile) {
  console.warn(`Rejected email to unknown username: ${username}`);
  message.setReject("Address not found");
  return;
}

// after (refactor) — log gone
const profile = await usersRepo.findByUsername(db, username);
if (!profile) {
  message.setReject("Address not found");
  return;
}
```

**Do** — port the log forward, improving it if helpful:
```ts
const profile = await usersRepo.findByUsername(db, username);
if (!profile) {
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
$ bun run secret-encryption-key
# paste abc123def456... when prompted
```

**Do** — pipe directly without ever rendering the value:
```bash
$ bun run gen-key | bunx wrangler secret put SEC_ENCRYPTION_KEY
```

Or use the tool's interactive prompt (terminal does not echo):
```bash
$ bunx wrangler secret put SEC_ENCRYPTION_KEY
? Enter the secret text: [hidden input]
```

---

## Tooling

- Use `bun` (not `node`) and `bunx` (not `npx`) for all JS tooling
- `bun run <script>` for package.json scripts; `bunx <bin>` for package binaries (e.g. `bunx wrangler`)
- `bun add` for dependencies, not `npm install`
- Wrangler v4+: `wrangler kv key delete` does not accept `--force`; non-interactive callers skip the prompt automatically. Pass the key as a positional via `spawnSync` (not shell interpolation) to avoid injection on keys containing special chars

---

## Local development & Wrangler secrets

### `.dev.vars` is the local config file — load everything from it

Local dev config (secrets **and** non-secret overrides) belongs in `.dev.vars`. Wrangler loads it automatically during `wrangler dev`. Do not split local config across inline `--var` flags, custom wrapper scripts, or duplicate entries scattered in `package.json`.

**Why:** We migrated from Secrets Store to worker secrets and added `[secrets] required` in `wrangler.toml`. That silently stopped Wrangler from loading non-secret keys (`APP_URL`, `NOTION_CLIENT_ID`, etc.) from `.dev.vars`, so production `[vars]` won locally. Fixes that inlined vars in `package.json` or parsed `.dev.vars` in a custom `scripts/dev.ts` worked but fought the tool instead of using it.

**Don't** — filter `.dev.vars` with `[secrets] required` and patch around it:
```toml
# wrangler.toml
[secrets]
required = ["SEC_ENCRYPTION_KEY", "SEC_RESEND_API_KEY", "SEC_NOTION_CLIENT_SECRET"]
# ↑ Wrangler now IGNORES every other key in .dev.vars during dev
```
```json
// package.json — unmaintainable; grows with every local override
"dev": "wrangler dev --var APP_URL:https://localhost:8787 --var NOTION_CLIENT_ID:..."
```
```ts
// scripts/dev.ts — reimplements what Wrangler already does
for (const [key, value] of Object.entries(parseDevVars(".dev.vars"))) {
  if (!key.startsWith("SEC_")) wranglerArgs.push("--var", `${key}:${value}`);
}
```

**Do** — omit `[secrets] required`, keep production defaults in `wrangler.toml` `[vars]`, and put all local overrides in `.dev.vars`:
```toml
# wrangler.toml — production defaults only
[vars]
APP_URL = "https://notes.bndn.io"
NOTION_CLIENT_ID = "364d872b-594c-81b2-ab69-0037727845d4"
```
```
# .dev.vars — gitignored; overrides [vars] locally
APP_URL=https://localhost:8787
NOTION_CLIENT_ID=your-dev-oauth-client-id
SEC_ENCRYPTION_KEY=...
SEC_RESEND_API_KEY=dev-unused
SEC_NOTION_CLIENT_SECRET=...
```
```json
"dev": "wrangler dev --local-protocol https"
```

Merge order during `wrangler dev`: `wrangler.toml` `[vars]` first, then `.dev.vars` overrides matching keys.

### `[secrets] required` and full `.dev.vars` are mutually exclusive

When `[secrets] required` is present, Wrangler **only** loads the listed names from `.dev.vars` (or `.env`). There is no `wrangler.toml` flag to keep deploy validation while also loading other keys from the file. You must choose one model:

| Model | Local `.dev.vars` | Deploy guardrail |
|-------|-------------------|------------------|
| **No `[secrets] required`** (this repo) | All keys load; overrides `[vars]` | CI runs `wrangler secret list` before deploy |
| **`[secrets] required` present** | Only listed `SEC_*` keys load | `wrangler deploy` fails if secrets missing |

Do not reintroduce `[secrets] required` unless you accept that non-secret local config must live elsewhere (e.g. duplicated `[env.*.vars]` bindings, or inline `--var` flags).

### Worker secrets use the `SEC_` prefix

Production worker secrets are `SEC_ENCRYPTION_KEY`, `SEC_RESEND_API_KEY`, and `SEC_NOTION_CLIENT_SECRET`. Access them as plain `env.SEC_*` strings — not Secrets Store bindings, not unprefixed names.

**Why:** Legacy Secrets Store bindings (`ENCRYPTION_KEY`, `RESEND_API_KEY`, `NOTION_CLIENT_SECRET`) still existed on deployed worker versions. `wrangler secret put` on the old names failed with binding-already-in-use (code 10053). The `SEC_` prefix avoids collision with those legacy bindings.

**Don't** — reference unprefixed secret names or call `.get()` on a Secrets Store binding:
```ts
const key = await env.ENCRYPTION_KEY.get();
await env.RESEND_API_KEY.get();
```

**Do** — read worker secrets directly from `env`:
```ts
const key = env.SEC_ENCRYPTION_KEY;
await sendEmail(env.SEC_RESEND_API_KEY, ...);
```

Set production secrets with the `secret-*` npm scripts (`wrangler secret put SEC_*`). Local values go in `.dev.vars` under the same names.

### Use `isLocalDev(env)` for local-only behaviour

`lib/env.ts` exports `isLocalDev(env)` — true when `APP_URL` hostname is `localhost` or `127.0.0.1`. Use it for dev-only shortcuts (PIN logged to wrangler terminal instead of Resend, rate limits disabled). Do not add separate env vars like `DISPLAY_PIN_IN_CONSOLE` for behaviour that already follows from running locally.

```ts
// lib/pin.ts
if (isLocalDev(env)) {
  console.log(`[dev] PIN for ${to}: ${pin}`);
  return;
}
```

### Local Notion OAuth requires HTTPS

`bun run dev` uses `--local-protocol https` → **https://localhost:8787**. Notion redirect URIs must match exactly. `APP_URL` in `.dev.vars` must be `https://localhost:8787`, and that callback URL must be registered in the Notion integration settings.

Token exchange `invalid_client` locally usually means `SEC_NOTION_CLIENT_SECRET` in `.dev.vars` doesn't match the `NOTION_CLIENT_ID` (and redirect URI) in use — not a stale Secrets Store entry (that path is gone).

### Deploy guardrails live in CI, not `[secrets] required`

Without `[secrets] required`, `wrangler deploy` does not fail fast on missing secrets. `.github/workflows/deploy.yml` verifies all three `SEC_*` secrets exist via `wrangler secret list` before deploying. Do not remove that step if `[secrets] required` stays absent from `wrangler.toml`.

When changing secret names or **adding a new `SEC_*` variable**, update every place that enumerates required secrets — including the `for key in ...` loop in `.github/workflows/deploy.yml`. That CI list is the deploy guardrail; if you add `SEC_FOO` to the codebase but not to the workflow, deploy will succeed without it.

Also update: `lib/types.ts`, `.dev.vars.example`, `STORES.md`, and the `secret-*` scripts in `package.json`.
