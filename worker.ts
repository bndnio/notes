/**
 * worker.ts
 * Receives email at notes@bndn.io, validates sender,
 * saves to R2, and creates a Notion database page.
 *
 * Environment variables (set via: bunx wrangler secret put <NAME>):
 *   ALLOWED_SENDER   - your personal email address
 *   NOTION_TOKEN     - your Notion integration secret
 *   NOTION_DB_ID     - your Notion database ID
 *
 * R2 binding: NOTES_BUCKET (configured in wrangler.toml)
 */

interface Env {
  NOTES_BUCKET: R2Bucket;
  ALLOWED_SENDER: string;
  NOTION_TOKEN: string;
  NOTION_DB_ID: string;
}

interface ParsedEmail {
  subject: string;
  body: string;
}

interface Note {
  timestamp: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  raw_key: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // ── 1. Validate sender ───────────────────────────────────────────────────
    const from = message.from?.toLowerCase().trim();
    const allowed = env.ALLOWED_SENDER?.toLowerCase().trim();

    if (!from || from !== allowed) {
      console.warn(`Rejected email from: ${from}`);
      // Silently reject to avoid revealing the endpoint
      message.setReject("Address not allowed");
      return;
    }

    // ── 2. Parse the email ───────────────────────────────────────────────────
    const rawEmail = await streamToText(message.raw);
    const parsed = parseEmail(rawEmail);

    const timestamp = new Date().toISOString();
    const dateStamp = timestamp.slice(0, 10);
    const timeStamp = timestamp.slice(11, 16).replace(":", "h");
    const slug = slugify(parsed.subject || "untitled");
    const key = `notes/${dateStamp}/${timeStamp}-${slug}.md`;

    const note: Note = {
      timestamp,
      from: message.from,
      to: message.to,
      subject: parsed.subject || "(no subject)",
      body: parsed.body,
      raw_key: key.replace(".md", ".eml"),
    };

    // ── 3. Save to R2 ────────────────────────────────────────────────────────
    const saveMd = env.NOTES_BUCKET.put(key, toMarkdown(note), {
      httpMetadata: { contentType: "text/markdown" },
      customMetadata: { subject: note.subject, from: note.from },
    });

    // Also save the raw .eml for future reference
    const saveRaw = env.NOTES_BUCKET.put(
      note.raw_key,
      rawEmail,
      { httpMetadata: { contentType: "message/rfc822" } }
    );

    // ── 4. Save to Notion ────────────────────────────────────────────────────
    const saveNotion = postToNotion(note, env);

    // Run R2 and Notion writes in parallel
    const [r2Result, notionResult] = await Promise.allSettled([
      Promise.all([saveMd, saveRaw]),
      saveNotion,
    ]);

    if (r2Result.status === "rejected") {
      console.error("R2 write failed:", r2Result.reason);
    } else {
      console.log(`Saved to R2: ${key}`);
    }

    if (notionResult.status === "rejected") {
      console.error("Notion write failed:", notionResult.reason);
    } else {
      console.log("Saved to Notion");
    }
  },
};

// ── Markdown formatter ───────────────────────────────────────────────────────

function toMarkdown(note: Note): string {
  return `---
timestamp: ${note.timestamp}
from: ${note.from}
to: ${note.to}
subject: ${note.subject}
raw_key: ${note.raw_key}
---

${note.body || "(empty)"}
`;
}

// ── Notion API ───────────────────────────────────────────────────────────────

async function postToNotion(note: Note, env: Env): Promise<void> {
  const body = {
    parent: { database_id: env.NOTION_DB_ID },
    properties: {
      // "Name" is the default title property in Notion databases
      Name: {
        title: [{ text: { content: note.subject } }],
      },
      Date: {
        date: { start: note.timestamp },
      },
      From: {
        rich_text: [{ text: { content: note.from } }],
      },
    },
    // Email body goes into the page content blocks
    children: chunkBody(note.body).map((chunk) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }],
      },
    })),
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
}

// Notion blocks max out at 2000 chars each
function chunkBody(text: string, size = 1900): string[] {
  if (!text) return ["(empty)"];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// ── Email parsing helpers ────────────────────────────────────────────────────

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

function parseEmail(raw: string): ParsedEmail {
  const lines = raw.split(/\r?\n/);
  let subject = "";
  let inHeaders = true;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (inHeaders) {
      if (line === "") {
        inHeaders = false;
        continue;
      }
      const subjectMatch = line.match(/^Subject:\s*(.+)/i);
      if (subjectMatch) subject = subjectMatch[1].trim();
    } else {
      // Skip MIME boundaries and headers in multipart bodies
      if (line.startsWith("--") || line.match(/^Content-Type:/i) ||
          line.match(/^Content-Transfer-Encoding:/i)) continue;

      // Decode quoted-printable soft line breaks
      const decoded = line.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi,
        (_, hex) => String.fromCharCode(parseInt(hex, 16)));

      bodyLines.push(decoded);
    }
  }

  const body = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { subject, body };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
