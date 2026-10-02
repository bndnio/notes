# Working with this codebase

See `CLAUDE.md` for house rules on data modelling, security, and process.

## Cursor Cloud specific instructions

### Product overview

**Notes** is a Cloudflare Worker (`bndnio-notes`) that captures notes via email (`u_<username>@notes.bndn.io`), an HTTP MCP endpoint (`/mcp`), and a small web app (register/login, profile, Notion OAuth, MCP token setup). There is no separate backend service or Docker stack—everything runs in one Worker with D1, R2, KV, and Secrets Store bindings (see `wrangler.toml` and `STORES.md`).

### Tooling

- Use **Bun** (`bun install`, `bun run`, `bunx wrangler`), not npm/npx.
- Bun is installed to `~/.bun/bin` and added to `PATH` in `~/.bashrc` on Cloud Agent VMs. Use a login shell (`bash -l`) if `bun` is not found.
- **Lint / typecheck:** `bun run typecheck` runs `tsc --noEmit` but `typescript` is not listed in `package.json` devDependencies; use `bunx -p typescript tsc --noEmit -p tsconfig.json` if needed. `tsconfig.json` only includes `worker.ts` (Wrangler bundles the rest).
- **Tests:** `bun test` runs `test/integration.test.ts` and requires `.env.test` with `WORKER_URL` and `MCP_AUTH_TOKEN` pointing at a deployed worker with a configured user. It does not start local services.
- **Build check (no deploy):** `bunx wrangler deploy --dry-run --outdir /tmp/wrangler-out` succeeds and validates the production bundle.

### Running the Worker locally

| Command | Purpose |
|--------|---------|
| `bun run dev` | `wrangler dev` (default port **8787**) |
| `bun run deploy` | Deploy to Cloudflare (needs `wrangler login` / `CLOUDFLARE_API_TOKEN`) |
| `bun run logs` | `wrangler tail` |

**Local dev caveat:** In this environment, `wrangler dev` (v4.91) often fails at bundle time with `modules-watch-stub.js cannot be marked as external`, likely due to HTML/CSS/JS modules from `[[rules]]` in `wrangler.toml` plus the MCP SDK dependency. If you hit this:

1. Try `node node_modules/wrangler/bin/wrangler.js dev --latest false --port 8787` (disables the newest compatibility date).
2. Use `wrangler deploy --dry-run` to confirm the Worker still builds.
3. For UI/MCP smoke tests without local bindings, use the deployed app at `https://notes.bndn.io` (see below).

`wrangler whoami` shows auth status. Secrets Store bindings simulate locally but real PIN email / Notion OAuth need Cloudflare secrets and external APIs.

### Production smoke tests (no credentials)

These verify routing and auth boundaries on the live worker:

```bash
curl -sS -o /dev/null -w "GET / → %{http_code}\n" https://notes.bndn.io/
curl -sS -o /dev/null -w "GET /login → %{http_code}\n" https://notes.bndn.io/login
curl -sS -o /dev/null -w "POST /mcp → %{http_code}\n" -X POST https://notes.bndn.io/mcp \
  -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{}}'
# Expect 200, 200, 401
```

### Optional Cloudflare setup (full E2E)

Not required for basic dev verification. See `README.md` and comments in `wrangler.toml` for R2 bucket creation, D1 migrations, `bun run gen-key`, Secrets Store, and `bun run add-user`. Integration tests and MCP `save_note` need a user with Notion configured and `MCP_AUTH_TOKEN` in `.env.test`.

### Services summary

| Service | Required for local UI | How to run |
|--------|---------------------|------------|
| Cloudflare Worker | Yes | `bun run dev` or https://notes.bndn.io |
| D1 / R2 / KV / Secrets | Yes for full flows | Simulated by `wrangler dev`; remote bindings need `wrangler dev --remote` + login |
| Resend / Notion / Email Routing | Only for register/login/email ingest E2E | External; configured in Cloudflare dashboard |
