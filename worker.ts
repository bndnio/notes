import { streamToText, parseEmail } from "./lib/email";
import { postToNotion } from "./lib/notion";
import { toMarkdown, slugify } from "./lib/markdown";
import type { Env, Note } from "./lib/types";

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // ── 1. Validate sender ───────────────────────────────────────────────────
    const from = message.from?.toLowerCase().trim();
    const allowed = env.ALLOWED_SENDER?.toLowerCase().trim();

    if (!from || from !== allowed) {
      console.warn(`Rejected email from: ${from}`);
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

    const saveRaw = env.NOTES_BUCKET.put(
      note.raw_key,
      rawEmail,
      { httpMetadata: { contentType: "message/rfc822" } }
    );

    // ── 4. Save to Notion ────────────────────────────────────────────────────
    const saveNotion = postToNotion(note, env);

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
