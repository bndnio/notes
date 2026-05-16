import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { computeKeys, saveNote } from "../../lib/notes";
import { resolveProfile } from "../../lib/auth";
import type { Env, Profile } from "../../lib/types";

function makeMcpServer(env: Env, profile: Profile): McpServer {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  async function saveNoteTool(subject: string, body: string) {
    const timestamp = new Date().toISOString();
    const { mdKey } = computeKeys(subject, profile.userId, timestamp);
    const result = await saveNote({ mdKey, timestamp, subject, body }, env, profile);
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
  const profile = await resolveProfile(token, env);
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
