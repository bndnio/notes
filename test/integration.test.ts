import { describe, test, expect } from "bun:test";

const WORKER_URL = process.env.WORKER_URL!;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN!;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mcp(params: unknown, token = MCP_AUTH_TOKEN) {
  return fetch(`${WORKER_URL}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "test", method: "tools/call", params }),
  });
}

// ── MCP server ────────────────────────────────────────────────────────────────

describe("MCP server", () => {
  test("rejects request with no auth token", async () => {
    const res = await fetch(`${WORKER_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/call", params: {} }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects request with wrong auth token", async () => {
    const res = await mcp({}, "wrong-token");
    expect(res.status).toBe(401);
  });

  test("returns 404 for unknown path", async () => {
    const res = await fetch(`${WORKER_URL}/unknown`);
    expect(res.status).toBe(404);
  });

  test("save_note writes to R2 under brendon/ and Notion", async () => {
    const res = await mcp({
      name: "save_note",
      arguments: {
        subject: "Integration test - save_note",
        body: "Automated integration test. Safe to delete.",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const text: string = body.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/^Saved: [0-9a-f]{8}\//);
    expect(text).toContain("Notion: ok");
  });
});
