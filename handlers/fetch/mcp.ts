import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { saveNote, type SaveNoteResult } from "../../lib/notes";
import { resolveProfile } from "../../lib/auth";
import type { Content, Env, Profile } from "../../lib/types";

function formatResults(results: SaveNoteResult): string {
  return Object.entries(results)
    .map(([id, result]) => {
      if (!result.ok) return `${id}: failed`;
      return result.detail ? `${id}: ${result.detail}` : `${id}: ok`;
    })
    .join(". ");
}

function makeMcpServer(env: Env, profile: Profile): McpServer {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  async function saveNoteTool(subject: string, body: string) {
    const content: Content = {
      timestamp: new Date().toISOString(),
      from: "mcp",
      to: "",
      subject,
      body,
    };
    const results = await saveNote(content, env, profile);
    const ran = Object.values(results);
    if (ran.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No destinations configured — visit ${env.APP_URL}/profile`,
        }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text" as const, text: formatResults(results) }],
      isError: ran.every((r) => !r.ok),
    };
  }

  server.registerTool(
    "save_note",
    {
      description: "Save a note to the user's configured destinations",
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
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

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
