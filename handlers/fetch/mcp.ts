import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { computeKeys, saveNote } from "../../lib/notes";
import { lookupProfile } from "../../lib/profiles";
import { hmacToken } from "../../lib/crypto";
import type { Env, Profile } from "../../lib/types";

function makeMcpServer(env: Env, profile: Profile): McpServer {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  async function saveNoteTool(subject: string, body: string) {
    const { mdKey } = computeKeys(subject, profile.userId);
    const result = await saveNote({ mdKey, subject, body }, env, profile);
    return {
      content: [{ type: "text" as const, text: `Saved: ${mdKey}. Notion: ${result.notionOk ? "ok" : "failed"}` }],
    };
  }

  server.registerTool(
    "save_note",
    {
      description: "Save a note to R2 and Notion",
      inputSchema: {
        subject: z.string().describe("Note title"),
        body: z.string().describe("Note body (plain text or markdown)"),
      },
    },
    ({ subject, body }) => saveNoteTool(subject, body),
  );

  return server;
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const hash = await hmacToken(token, encryptionKey);
  const userId = await env.MCP_TOKEN_KV.get(hash);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) {
    return new Response("Unauthorized", { status: 401 });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = makeMcpServer(env, profile);
  await server.connect(transport);
  return transport.handleRequest(request);
}
