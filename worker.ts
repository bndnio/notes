import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { streamToText, parseEmail } from "./lib/email";
import { computeKeys, saveNote } from "./lib/notes";
import type { Env } from "./lib/types";

function makeMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  async function saveNoteTool(subject: string, body: string) {
    const { mdKey } = computeKeys(subject);
    const result = await saveNote({ mdKey, subject, body }, env);
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

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const server = makeMcpServer(env);
    await server.connect(transport);
    return transport.handleRequest(request);
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const from = message.from?.toLowerCase().trim();
    const allowed = env.ALLOWED_SENDER?.toLowerCase().trim();

    if (!from || from !== allowed) {
      console.warn(`Rejected email from: ${from}`);
      message.setReject("Address not allowed");
      return;
    }

    const rawEmail = await streamToText(message.raw);
    const parsed = parseEmail(rawEmail);

    const { mdKey, emlKey } = computeKeys(parsed.subject);

    const saveEml = env.NOTES_BUCKET.put(emlKey, rawEmail, {
      httpMetadata: { contentType: "message/rfc822" },
    });

    const [emlResult, noteResult] = await Promise.allSettled([
      saveEml,
      saveNote({ mdKey, subject: parsed.subject, body: parsed.body, from: message.from, to: message.to, emlKey }, env),
    ]);

    if (emlResult.status === "rejected") console.error(`R2 eml write failed: ${emlResult.reason}`);
    else console.log(`Saved eml: ${emlKey}`);

    if (noteResult.status === "rejected") console.error(`R2 md write failed (Notion status unknown): ${noteResult.reason}`);
    else {
      console.log(`Saved md: ${mdKey}`);
      if (!noteResult.value.notionOk) console.error("Notion write failed (md saved successfully)");
      else console.log("Saved to Notion");
    }
  },
};
