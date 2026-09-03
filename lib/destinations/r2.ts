import type { Content } from "../types";
import type { Sink, SinkContext, SinkResult } from "../sink";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function computeKeys(subject: string, userId: string, timestamp: string): { mdKey: string; emlKey: string } {
  const dateStamp = timestamp.slice(0, 10);
  const timeStamp = timestamp.slice(11, 16).replace(":", "h");
  const slug = slugify(subject || "untitled");
  const mdKey = `${userId}/${dateStamp}/${timeStamp}-${slug}.md`;
  const emlKey = mdKey.replace(".md", ".eml");
  return { mdKey, emlKey };
}

function toMarkdown(content: Content, emlKey?: string): string {
  return `---
timestamp: ${content.timestamp}
from: ${content.from}
to: ${content.to}
subject: ${content.subject}
${emlKey ? `emlKey: ${emlKey}` : ""}
---

${content.body || "(empty)"}
`;
}

export const r2Sink: Sink = {
  id: "r2",
  enabled: () => true,

  async write(content: Content, ctx: SinkContext): Promise<SinkResult> {
    try {
      const { mdKey, emlKey } = computeKeys(content.subject, ctx.profile.id, content.timestamp);
      const stored: Content = {
        ...content,
        subject: content.subject || "(no subject)",
      };
      const rawEmail = ctx.artifacts?.rawEmail;

      const saveEml = rawEmail
        ? ctx.env.NOTES_BUCKET.put(emlKey, rawEmail, {
            httpMetadata: { contentType: "message/rfc822" },
          })
        : Promise.resolve();

      const saveMd = ctx.env.NOTES_BUCKET.put(mdKey, toMarkdown(stored, rawEmail ? emlKey : undefined), {
        httpMetadata: { contentType: "text/markdown" },
        customMetadata: { subject: stored.subject, from: stored.from },
      });

      const [emlResult, mdResult] = await Promise.allSettled([saveEml, saveMd]);

      if (rawEmail) {
        if (emlResult.status === "rejected") console.error(`R2 eml write failed: ${emlResult.reason}`);
        else console.log(`Saved eml: ${emlKey}`);
      }

      if (mdResult.status === "rejected") {
        const error = String(mdResult.reason);
        console.error(`R2 md write failed: ${error}`);
        return { ok: false, error };
      }

      console.log(`Saved md: ${mdKey}`);
      return { ok: true, detail: mdKey };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`R2 write failed: ${error}`);
      return { ok: false, error };
    }
  },
};
