# Layout — routes, planes, and URLs

Status: **implemented.** Commits `bb0171d` (file moves) and `b900cd7` (URL prefixes).
Audience: humans and agents. This describes the tree that exists, not a target.

House rules in `CLAUDE.md` still apply and take precedence: HTML in templates, static copy in HTML, auth asserts at the top of handlers, one phase at a time, `STORES.md` in sync, no user data in `<script>` slots.

---

## What this app is

Notes arrive from **sources** (inbound email, MCP `save_note`) as canonical **Content**, then a **fan-out** writes them to user-configured **sinks** (R2, Notion). Sources, the fan-out, and sinks are one subsystem and live in one folder: `pipeline/`.

```
email MIME ──parse──► Content ──┐
                                 ├──► saveNote ──► enabled sinks in parallel
mcp {subject,body} ─────────────┘
```

| Word | Meaning |
|------|---------|
| **Source** | Receives content, normalizes to `Content`, calls the fan-out. Does not know R2 key layout, markdown, or Notion blocks. |
| **Content** | `{ timestamp, from, to, subject, body }`. No `emlKey`. |
| **Fan-out** | `pipeline/index.ts` — `hasEnabledSink(profile)` + `saveNote(content, env, profile, artifacts?)`. Writes to every enabled sink **concurrently** via `Promise.allSettled`. Never throws for write failure. |
| **Sink** | `{ id, enabled(profile), write(content, ctx) }` → `SinkResult`. Owns its transformer. |
| **Transformer** | Sink-owned: Content → payload (markdown / Notion page JSON). Not a global toolbox. |
| **Artifact** | Optional ingest extras (today: `{ rawEmail }`). `.eml` is not a field on Content; the R2 sink stores it as a best-effort backup. |
| **Section** | `{ card, modal, script }` HTML fragments (`Section` in `lib/types.ts`). Profile composes these. Not a route. |

---

## The organizing principle

**Two planes, and the file tree keeps them apart.**

| Plane | Lives in | Triggered by | Knows about |
|-------|----------|--------------|-------------|
| HTTP | `routes/` | a request to a URL | sessions, CSRF, forms, templates |
| Pipeline | `pipeline/` — `sources/`, `index.ts`, `sinks/` | email arriving or a tool call | Content, sink payloads, storage |

`routes/` mirrors the URL space. Everything under it has an address; the folder is the first path segment. The pipeline has **no URLs at all**, so it gets its own folder at the top of `src/` and is never nested inside a URL-shaped tree.

The planes meet in exactly one place: `routes/index.ts` dispatches `POST /api/mcp` into `pipeline/sources/mcp/handler.ts`. That line is commented as the seam. Nothing else in `routes/` imports anything under `pipeline/`, which is now a one-glance check rather than a three-folder one.

**Why `pipeline/` is a folder and not a `pipeline.ts` file.** It was a file at the `src/` root, next to sibling `sources/` and `sinks/` folders. Three problems, all fixed by the same move. The plane boundary was documentary — the four top-level entries `sources/`, `pipeline.ts`, `sinks/`, and `routes/` gave the filesystem no way to say which three belonged together. The word "pipeline" was doing double duty, naming both the plane and one step inside it. And a pipeline means sequential stages, which the file never was: it is a concurrent one-to-many fan-out. Naming the *directory* `pipeline/` is accurate — the plane really is a sequence (arrive → normalize → fan out) — while the step inside it is now called what it is.

### Rejected alternatives, and why

- **`integrations/<name>/` holding `source.ts`/`sink.ts` next to `api/`.** Puts a pipeline file and a route file in one folder named after a vendor. Two things on different change-clocks sharing a parent.
- **A REST resource tree (`api/me/notion/`, `api/me/mcp/`, `api/notes/`).** Explored in a scratch worktree and abandoned. Two reasons. First, the app has almost no REST resources: every method check in the codebase is `GET` or `POST`, because the primary client is an HTML form and forms cannot send `PUT`/`PATCH`/`DELETE`. MCP is JSON-RPC by spec, and OAuth is a redirect state machine — neither can be resource-shaped. Second, a URL-derived tree cannot place a file that has no URL, so `sink.ts` ended up beside `routes.ts`, which is the exact mixing the layout was supposed to prevent.
- **Per-entity `templates/` folders.** At ~45 lines per file, four-deep paths to reach a 20-line HTML fragment cost more navigation than they buy. `templates/` stays flat, directly under `src/`.

`/api` means "not a website page," not "JSON only." Form POSTs and the Notion OAuth callback still redirect or return HTML. The prefix is a namespace, not a REST claim.

---

## The tree

**The rule: `src/` is what Wrangler bundles as `main`.** Not "everything hand-written" — that rule would pull in `test/` and `scripts/` too. The repo root holds config, docs, and anything that reaches production by a route other than the worker bundle.

```
src/                          bundled worker source (wrangler.toml main)
assets/                       edge-served static files; NOT bundled or imported
migrations/                   drizzle output
scripts/                      dev tooling (gen-key, clear-kv); imports no app code
test/                         integration tests against a deployed URL
drizzle.config.ts             schema path points into src/
tsconfig.json                 include: src/worker.ts, src/html.d.ts
```

`assets/` stays out of `src/` deliberately. Those files are uploaded to Cloudflare's asset store and served by the edge **without invoking the worker** — a different deploy path and a different runtime from anything esbuild bundles. `[assets] directory` names only the local folder; files are served at their path relative to it, so `assets/styles.css` is `/styles.css` regardless of where the folder sits.

Two consequences worth remembering:

1. **Assets shadow routes.** A matching asset is served before the dispatcher runs, so a file at `assets/profile` would make `/profile` unreachable. Harmless with two files; a sharp edge if that directory grows.
2. **`styles.css` and `src/templates/*.html` change together** even though they live on opposite sides of the boundary. Adding a class to a template means adding a rule in `assets/styles.css`. This is the strongest argument against the split; it was weighed and the bundling boundary won.

Inside `src/` — **every path in this document below is relative to `src/`**:

```
worker.ts                     fetch → routes/; email → pipeline/sources/email/handler
html.d.ts                     *.html and *.txt as string modules
routes/
  index.ts                    dispatcher; groups by URL prefix
  auth/                       login.ts, register.ts, verify.ts, logout.ts
  api/
    email.ts                  /api/email
    mcp/                      setup.ts, install.ts
    notion.ts                 /api/notion/* — one file, own sub-router
  ui/
    home.ts                   GET /
    profile.ts                GET /profile — compositor only
    sections/                 email.ts, mcp.ts, notion.ts → Section
pipeline/                     the dataflow plane — nothing inside has a URL
  index.ts                    hasEnabledSink + saveNote; fans out to ./sinks
  sources/
    email/                    handler.ts (Worker.email), parse.ts (MIME)
    mcp/                      handler.ts — the MCP source; mounted at /api/mcp
  sinks/
    index.ts                  registry: [r2Sink, notionSink]
    r2.ts                     id "r2", enabled: () => true
    notion.ts                 id "notion", enabled: profile.notion !== null
    types.ts                  Sink, SinkContext, SinkResult
templates/                    all HTML + install-mcp.txt, flat
db/                           D1 subsystem — a peer of routes/ and pipeline/
  index.ts                    createDb + Db type
  schema.ts                   tables + relations (drizzle.config.ts points here)
  repositories/               users.ts, user-emails.ts, notion-integrations.ts
lib/                          auth, crypto, cookies, pin, resend, html,
                              responses, types, notion-client.ts
```

When the tree moved into `src/`, every import was still relative, so that move needed no import rewrites — only three config paths (`wrangler.toml` `main`, `tsconfig.json` `include`, `drizzle.config.ts` `schema`). Cross-subsystem imports now go through the `@/` alias instead (see [Path aliases](#path-aliases)), which is what reduced the later `pipeline/` move to three changed import lines.

Notable file-level rules:

- **Sections are not routes.** They render fragments for `/profile`. They used to be exported from the route files (`buildMcpSection` from `setup-mcp.ts`), which made a page import three URL handlers. They now live in `routes/ui/sections/` and no route file exports HTML builders.
- **`lib/notion-client.ts`** is the outbound Notion HTTP client — `fetchNotion`, `listDatabases`, `validateNotionDatabaseSchema`, `NotionDatabase`. Both `pipeline/sinks/notion.ts` and `routes/api/notion.ts` import it. It is deliberately **not** named `api.ts`, which would collide with our own `/api` routes. There is no `notion-helpers.ts`.
- **`db/` is a peer, not a `lib/` utility.** It was `lib/db/repositories/*` — four levels deep for a subsystem both planes depend on (routes read and write config; the email source looks users up by username). `lib/` is for small utilities like `escHtml` and `getCookie`. Inside `db/`, **`repositories/` stays a separate folder from `schema.ts`** on purpose: the schema is the table definitions, the repositories are the queries against them, and mixing them in one flat directory blurs that. Repositories import `Db` from `".."` and tables from `"../schema"`.
- **`html.d.ts`** declares `*.html` and `*.txt` as string modules, matching Wrangler's default Text module rules. `.gitignore` ignores `*.d.ts` with an explicit `!html.d.ts` negation — without it the file silently never commits, which is how it went missing before.

---

## URL map

| Prefix | Folder | What it is |
|--------|--------|------------|
| `/auth/*` | `routes/auth/` | Login island. Own pages. No sources or sinks. |
| `/api/*` | `routes/api/` | Machine ingest and integration config. |
| `/`, `/profile` | `routes/ui/` | The website. Home + a compositor. |

| URL | Method | Handler |
|-----|--------|---------|
| `/` | GET | `ui/home.ts` |
| `/profile` | GET | `ui/profile.ts` |
| `/auth/login` | GET, POST | `auth/login.ts` |
| `/auth/register` | GET, POST | `auth/register.ts` |
| `/auth/verify` | GET, POST | `auth/verify.ts` |
| `/auth/logout` | POST | `auth/logout.ts` |
| `/api/mcp` | POST | `pipeline/sources/mcp/handler.ts` ← plane seam |
| `/api/mcp/setup/{generate,reset,done}` | POST | `api/mcp/setup.ts` |
| `/api/mcp/install/claude-code` | GET | `api/mcp/install.ts` |
| `/api/email` | POST | `api/email.ts` |
| `/api/notion/{connect,callback,relay,select}` | GET (+POST on select) | `api/notion.ts` |

`/mcp` → `/api/mcp` is a **308**, not a 301 or 302: only 308 preserves the method and body, so existing Claude Code configs keep POSTing correctly. Same-origin, so the `Authorization` header survives.

### Naming convention

**The path under `routes/` mirrors the URL path.** A URL segment becomes a folder once it has children, and a file otherwise. `/api/mcp/setup/generate` → `api/mcp/setup.ts`; the leaf verb (`generate`) stays inside that file's sub-router because all three leaves share auth and CSRF handling.

Three deliberate exceptions:

1. **`routes/ui/`** — `/` and `/profile` have no URL prefix, so this folder is one segment the URL doesn't have. Kept because it marks "unprefixed website pages" and keeps `sections/` beside the page that composes them.
2. **`api/notion.ts`** — a single 212-line file with its own sub-router, rather than `api/notion/{connect,callback,relay,select}.ts`. The four routes are one OAuth state machine and share two private helpers; splitting them would spread one flow across five files.
3. **`/api/mcp` → `pipeline/sources/mcp/handler.ts`** — the ingest endpoint lives in the pipeline plane, not under `routes/`. This is the plane seam, and it is the one URL whose handler is deliberately outside the mirror.

Function names describe behaviour and are **not** held to the URL mirror: `handleRegistration` lives in `auth/register.ts`, and `handleEmailSettingsSave` in `api/email.ts`.

**No other legacy redirects exist.** `/login`, `/register`, `/verify`, `/logout`, `/settings/email`, `/setup-mcp/*`, `/install-mcp/*`, and `/integration/notion/*` all 404 now. Bookmarks to the old auth pages are broken. Four one-line 301s in the dispatcher would fix that if it matters.

---

## How callers import (this keeps the planes honest)

| Caller | Imports | Must not import |
|--------|---------|-----------------|
| Fan-out (`pipeline/index.ts`) | `./sinks` | anything in `routes/` |
| Email worker | `@/pipeline/sources/email/handler` from `worker.ts` | `routes/` |
| MCP source | the fan-out via `"../.."`, `lib/auth` | `routes/`, other sinks |
| Dispatcher | `routes/*`, plus `@/pipeline/sources/mcp/handler` for `/api/mcp` | sinks, the fan-out |
| Profile page | `routes/ui/sections/*` | route handlers, sinks |
| Sections | `lib/*`, templates | route handlers, anything in `pipeline/` |
| Notion sink | `lib/notion-client.ts` | `routes/`, sections |
| Notion routes | `lib/notion-client.ts`, db, KV | `pipeline/sinks/notion.ts` |

Rules:

1. Sinks and sources never import from `routes/`. Config is read off `Profile`; the routes are what *wrote* that profile.
2. Route handlers never call `sink.write`. Creating a note goes through `saveNote`.
3. Sections never import route handlers, and route handlers never export HTML builders.
4. An integration's routes may use its `lib/` client. They do not import another integration's sink.

### Path aliases

`@/` resolves to `src/`. **If an import leaves its own top-level subsystem, use `@/`. If it stays inside, keep it relative — however many levels it climbs.** That is the whole rule: no exception for files at the `src/` root, and none for depth.

```ts
// src/routes/ui/sections/mcp.ts — crosses out of routes/
import mcpSetupModalHtml from "@/templates/mcp-setup-modal.html";
import { decrypt } from "@/lib/crypto";

// src/pipeline/sources/email/handler.ts — two levels, but still inside pipeline/
import { hasEnabledSink, saveNote } from "../..";

// src/routes/ui/profile.ts — stays inside routes/
import { buildMcpSection } from "./sections/mcp";

// src/db/repositories/users.ts — one level up, stays inside db/
import { users } from "../schema";
```

Depth deliberately does not override the boundary rule, and the payoff is that **`@/` means exactly one thing: this import leaves my subsystem.** All twelve `@/` imports under `pipeline/` point at `lib/` or `db/`, with no false positives — so `rg '"@/' src/pipeline` is a complete audit of that subsystem's outbound dependencies, and the same trick works for any other. Allowing `@/pipeline` *inside* `pipeline/` would have destroyed that invariant to shorten two import lines.

Before the alias existed, 27 of 99 relative imports were `../../../`, every one of them crossing out of `routes/`. Those are gone. The only multi-level relative paths left in `src/` are the two internal `"../.."` above, and `rg '"\.\./\.\.' src/` should return exactly those two.

The alias is declared **twice**, and the two must agree:

| File | Entry | Resolver |
|------|-------|----------|
| `wrangler.toml` | `[alias]` → `"@" = "./src"` | esbuild, at bundle time |
| `tsconfig.json` | `"paths": { "@/*": ["./src/*"] }` | `tsc`, at typecheck time |

There is no single-source option; the bundler and the type checker are independent resolvers. The duplication is safe because a bad path fails loudly in *both* — `tsc` raises `TS2307`, esbuild raises `Could not resolve` — so the CI typecheck catches a half-applied change before it deploys. If you add a second alias, add it to both files.

`drizzle-kit` honours the `tsconfig.json` entry as well (verified with a value import in `schema.ts`), so the schema may use `@/` if it ever needs to. `test/` and `scripts/` import no application code, so they need no alias config.

---

## Runtime contracts (do not break these)

**Content** (`lib/types.ts`): `timestamp`, `from`, `to`, `subject`, `body`. Empty subject becomes `"(no subject)"` at write time in each sink; R2 slugs still use `untitled` via `computeKeys` on the raw subject.

**SinkResult:** `{ ok: true, detail?: string } | { ok: false, error: string }`.
`write` does not throw for I/O. The fan-out `allSettled`s and maps unexpected throws to `{ ok: false, error }`. A missing key in the result map means the sink was **not enabled**, not that it failed.

**R2** is `enabled: () => true` (always on). Markdown failure is a failed sink result; `.eml` failure is log-only inside the R2 sink. Operational logs live **in the sink**, not in sources.

**Email source:** identity → sender-match → `hasEnabledSink` else `setReject("No output destination configured")` → parse → `saveNote(..., { rawEmail })`. Four `console.warn` rejection logs — keep them.

**MCP source:** auth → `hasEnabledSink` else generic "visit /profile" → `saveNote` → format **whatever keys the fan-out returned**. `isError` iff every enabled sink failed. Tool description does not say "R2 and Notion." The handler never inspects the request path, which is why remounting it at `/api/mcp` needed no code change.

**Notion sink** decrypts the stored token and POSTs a page. It does not list databases or run OAuth.

---

## Typecheck

`bun run typecheck` works now; it did not before. Three things were broken together: `typescript` was never a dependency, `html.d.ts` was missing (and unignorable), and `drizzle-orm`'s own `.d.ts` files don't typecheck, so `skipLibCheck` is required in `tsconfig.json`.

`tsconfig.json` includes only `src/worker.ts` and `src/html.d.ts`, so the checked set is the graph reachable from the worker — every application source file (40 of them, plus the declaration file — matching the 40 `.ts` files on disk under `src/`, so nothing is orphaned). **Not** covered: `test/integration.test.ts`, `scripts/*.ts`, `drizzle.config.ts`. Including them needs `@types/bun`. Verify coverage with `bunx tsc --noEmit --listFiles`.

TypeScript is pinned at `^7` (the native compiler). If CLI and editor diagnostics ever disagree, that version gap is the first thing to check.

`.github/workflows/deploy.yml` runs `bun install --frozen-lockfile` then `bun run typecheck` before touching Cloudflare. This matters because Wrangler bundles with esbuild, which strips types without checking them — without the gate, a type error deploys cleanly.

---

## External dependencies when URLs move

- **Notion OAuth redirect URI** must match exactly. Registered in the Notion integration dashboard:
  - `https://notes.bndn.io/api/notion/callback`
  - `https://localhost:8787/api/notion/callback`
  Add the new URI *before* deploying and keep the old one until nothing is mid-flow. `notion_state:*` keys carry a 900s TTL, so in-flight flows drain within 15 minutes.
- **MCP clients** — the install snippet and setup modal emit `{{appUrl}}/api/mcp`. Old configs work via the 308.
- **Local dev** — `bun run dev` serves https://localhost:8787; `APP_URL` in `.dev.vars` must match the registered callback origin.

---

## Stash — do not drop it, do not merge blindly

```
stash@{0}: On pipeline-refactor: wip: opt-in platform storage
```

Product: `users.storage_enabled` (default **false**), R2 becomes an optional sink, disable deletes `{userId}/`, profile card + modal. Built on the **old** tree (`lib/destinations/storage.ts`, `lib/outputs.ts`, inline HTML), so it will not apply cleanly. Replay it as `pipeline/sinks/r2.ts` gaining a real `enabled(profile)`, plus `routes/ui/sections/storage.ts` and whatever config route it needs under `routes/api/`.

Default `false` is a breaking deploy for existing users unless backfilled. Once R2 is optional, `hasEnabledSink` becomes a real reject path instead of dormant.

---

## Possible next work

- Replay the storage stash (above) — the only item with product value.
- Legacy 301s for the old auth URLs, if broken bookmarks turn out to matter.
- `@types/bun` so tests and scripts are typechecked too.

Do not batch any of these with a templating-engine rewrite or a move to Hono.
