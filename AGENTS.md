# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Single Cloudflare Worker (`bndnio-notes`) at `worker.ts`: web UI (register/login, profile, Notion OAuth, MCP setup), inbound email capture, and MCP `save_note` at `/mcp`. See `README.md` and `wrangler.toml` for bindings (D1, R2, KV, Secrets Store).

### Toolchain

- **Bun** is required (`bun`, `bunx`). Cloud VMs may only have Node on PATH; install Bun to `~/.bun/bin` and prepend to PATH (the install script adds this to `~/.bashrc`).
- Use `bun install` (not npm). Use `bunx wrangler` for Wrangler commands.

### Local dev server

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run dev   # wrangler dev → http://localhost:8787
```

Run long-lived dev in **tmux** (e.g. session `wrangler-dev`) so the process survives beyond one shell command.

### First-time local secrets (non-obvious)

Bindings use **Cloudflare Secrets Store** (`env.ENCRYPTION_KEY.get()`, etc.). `.dev.vars` alone is **not** enough for those bindings in local dev.

1. Create `.dev.vars` (gitignored) with at least:
   - `ENCRYPTION_KEY` — from `bun run gen-key` (base64)
   - `APP_URL=http://localhost:8787` (overrides production URL in `wrangler.toml` for redirects/OAuth)
   - Placeholder `RESEND_API_KEY` / `NOTION_CLIENT_SECRET` if you are not calling those APIs

2. Mirror the same values into the **local** Secrets Store (no `--remote`), using the store id from `wrangler.toml` (`065d291326ea4a1d8181859d83f313be`):

```bash
printf '%s' "<ENCRYPTION_KEY>" | bunx wrangler secrets-store secret create 065d291326ea4a1d8181859d83f313be --name ENCRYPTION_KEY --scopes workers
# Repeat for RESEND_API_KEY and NOTION_CLIENT_SECRET as needed
```

Restart `bun run dev` after creating secrets. Without this step, MCP/auth routes error with `Secret "ENCRYPTION_KEY" not found`.

### D1 migrations

```bash
bunx wrangler d1 migrations apply bndnio-notes --local
```

### Lint / typecheck / test

| Task | Command | Notes |
|------|---------|--------|
| Lint | — | No ESLint/Prettier in repo |
| Typecheck | `bun run typecheck` | Runs `tsc --noEmit` but `typescript` is not a declared dependency; `tsconfig.json` only includes `worker.ts`. Expect failures unless you add `typescript` and expand config. Wrangler bundles the full app regardless. |
| Integration tests | `bun run test` | Requires `.env.test` with `WORKER_URL` and `MCP_AUTH_TOKEN` pointing at a **deployed** worker with a configured user — not local Miniflare. |
| Deploy | `bun run deploy` | Needs `wrangler login` / `CLOUDFLARE_API_TOKEN` |

### MCP smoke test (local)

After secrets + migrations, you can seed a local D1 user with an MCP token hash (must match `ENCRYPTION_KEY` in Secrets Store). Example flow used in setup: user `devtest`, token 64×`0` (local only). Then:

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"save_note","arguments":{"subject":"test","body":"hello"}}}'
```

Unauthenticated POST to `/mcp` should return **401**.

### Legacy admin scripts

`scripts/add-user.ts`, `generate-mcp-token.ts`, etc. still target **remote KV**; runtime auth uses **D1** (`users.mcp_token_hash`). Prefer D1 + profile/MCP UI flows for new users.
