# Remote Artifacts

Inventory of everything this project depends on that lives outside the git repo. Storage schemas and key prefixes are in [STORES.md](STORES.md). Registry packages are in `package.json` / `bun.lock`.

Destroying or renaming any of these without updating the matching config will take production down.

---

## Cloudflare

Account is implied by `wrangler login` / `CLOUDFLARE_API_TOKEN`. There is no `account_id` in `wrangler.toml`.

| Artifact | Identifier | Binding / config | Created by |
|----------|------------|------------------|------------|
| Worker | `bndnio-notes` | `name` in `wrangler.toml` | `wrangler deploy` |
| Custom domain | `notes.bndn.io` | `routes` (`custom_domain = true`) | Wrangler on deploy (zone `bndn.io` must already be on Cloudflare) |
| D1 database | `bndnio-notes` (`512d5056-9718-4afd-b2d0-4c6b88e6c2be`) | `DB` | `wrangler d1 create bndnio-notes` |
| KV namespace | `da30844449de47bbb874342583c9c485` | `EPHEMERAL_KV` | `wrangler kv namespace create EPHEMERAL_KV` |
| R2 bucket | `bndnio-notes` | `NOTES_BUCKET` | `bun run bucket` |
| Worker secrets | `SEC_ENCRYPTION_KEY`, `SEC_RESEND_API_KEY`, `SEC_NOTION_CLIENT_SECRET` | `env.SEC_*` | `bun run secret-*` (`wrangler secret put`) |
| Workers Assets | uploaded from `./assets` | `[assets] directory` | `wrangler deploy` |
| Workers Observability | Workers Logs | `[observability] enabled = true` | `wrangler deploy` |

Email Routing is **dashboard-only** — it is not a Wrangler binding:

| Zone | Rule | Destination |
|------|------|-------------|
| `notes.bndn.io` | specific addresses `u_<username>@notes.bndn.io` | Worker `bndnio-notes` |
| `bndn.io` | catch-all `*@bndn.io` | Worker `bndnio-notes` (legacy) |

Inbound email never hits `wrangler dev`. Production Email Routing is the only path into `pipeline/sources/email`.

---

## GitHub

| Artifact | Identifier | Used for |
|----------|------------|----------|
| Repo | `bndnio/notes` | source of truth; `push` to `main` deploys |
| Actions secret | `CLOUDFLARE_API_TOKEN` | `.github/workflows/deploy.yml` (`wrangler secret list` + `wrangler deploy`) |
| Actions | `actions/checkout@v4`, `oven-sh/setup-bun@v2` | CI steps |
| Runner | `ubuntu-24.04-small` | CI host |

`CLOUDFLARE_API_TOKEN` is a GitHub secret, not a Worker secret. It needs Workers + D1 + KV + R2 + Workers Scripts edit permission on the Cloudflare account.

---

## Third-party APIs

### Notion

Public OAuth integration (type **Public**). Dashboard: https://www.notion.so/my-integrations

| | |
|--|--|
| Client ID | `364d872b-594c-81b2-ab69-0037727845d4` (`NOTION_CLIENT_ID` in `wrangler.toml`) |
| Client secret | Worker secret `SEC_NOTION_CLIENT_SECRET` |
| API | `https://api.notion.com/v1` (`Notion-Version: 2022-06-28`) |
| Redirect URIs | `https://notes.bndn.io/api/notion/callback`, `https://localhost:8787/api/notion/callback` |

Calls: `GET /oauth/authorize`, `POST /oauth/token`, `POST /search`, `GET /databases/:id`, `POST /pages`.

Add a new redirect URI in the Notion dashboard **before** changing `APP_URL`. In-flight OAuth states (`notion_state:*`) expire in 15 minutes.

### Resend

| | |
|--|--|
| API | `https://api.resend.com/emails` |
| API key | Worker secret `SEC_RESEND_API_KEY` |
| From | `Notes <noreply@notes.bndn.io>` |

`notes.bndn.io` must be a verified sending domain in Resend. Locally (`APP_URL` hostname `localhost` / `127.0.0.1`) PINs are logged to the Wrangler terminal and Resend is not called.

---

## Registry packages

Pinned in `bun.lock`. Direct dependencies:

| Package | Role |
|---------|------|
| `@modelcontextprotocol/sdk` | MCP HTTP server (`/api/mcp`) |
| `drizzle-orm` | D1 queries |
| `wrangler` | local runtime + deploy |
| `typescript` | `bun run typecheck` (CI gate before deploy) |
| `drizzle-kit` | migrations |
| `@cloudflare/workers-types` | Worker type defs |

`zod` is a transitive dependency of the MCP SDK (used by the `save_note` tool schema).
