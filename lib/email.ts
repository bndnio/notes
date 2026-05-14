import type { ParsedEmail } from "./types";

export async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
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

export function parseEmail(raw: string): ParsedEmail {
  const sep = raw.search(/\r?\n\r?\n/);
  if (sep === -1) return { subject: "", body: "" };

  const headers = parseHeaders(raw.slice(0, sep));
  const rawSubject = headers["subject"] || "";
  const subject = decodeRfc2047(rawSubject).trim();
  const plainText = extractPlainText(raw);
  const stripped = stripSignature(plainText);
  const reflowed = reflow(stripped);
  const body = reflowed.replace(/\n{3,}/g, "\n\n").trim();

  return { subject, body };
}

function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return headers;
}

function decodeRfc2047(str: string): string {
  const joined = str.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(=\?[^?]+\?[BbQq]\?[^?]*\?=)/g, "$1$2");
  return joined.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (original, charset, enc, text) => {
    try {
      if (enc.toUpperCase() === "Q") {
        const withSpaces = text.replace(/_/g, " ");
        return decodeURIComponent(withSpaces.replace(/=([0-9A-Fa-f]{2})/g, "%$1"));
      }
      const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return original;
    }
  });
}

function decodeQP(text: string): string {
  const soft = text.replace(/=\r?\n/g, "");
  try {
    return decodeURIComponent(soft.replace(/=([0-9A-Fa-f]{2})/g, "%$1"));
  } catch {
    return soft.replace(/=([0-9A-Fa-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
}

function decodeBodyContent(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === "quoted-printable") return decodeQP(body);
  if (enc === "base64") {
    const bytes = Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return body;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function extractPlainText(raw: string): string {
  const sep = raw.search(/\r?\n\r?\n/);
  if (sep === -1) return "";

  const headers = parseHeaders(raw.slice(0, sep));
  const bodyText = raw.slice(sep).replace(/^\r?\n\r?\n/, "");
  const contentType = headers["content-type"] || "text/plain";
  const encoding = headers["content-transfer-encoding"] || "7bit";

  if (contentType.startsWith("multipart/")) {
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (!boundaryMatch) return decodeBodyContent(bodyText, encoding);
    const boundary = boundaryMatch[1].trim();

    const parts = bodyText.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?\\r?\\n?`));
    let htmlFallback = "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const partSep = trimmed.search(/\r?\n\r?\n/);
      if (partSep === -1) continue;

      const partHeaders = parseHeaders(trimmed.slice(0, partSep));
      const partBody = trimmed.slice(partSep).replace(/^\r?\n\r?\n/, "");
      const partType = partHeaders["content-type"] || "";
      const partEncoding = partHeaders["content-transfer-encoding"] || "7bit";

      if (partType.startsWith("text/plain")) {
        return decodeBodyContent(partBody, partEncoding).trim();
      }
      if (partType.startsWith("text/html") && !htmlFallback) {
        htmlFallback = stripHtml(decodeBodyContent(partBody, partEncoding));
      }
      if (partType.startsWith("multipart/")) {
        const nested = extractPlainText(trimmed);
        if (nested) return nested;
      }
    }

    return htmlFallback;
  }

  if (contentType.startsWith("text/html")) {
    return stripHtml(decodeBodyContent(bodyText, encoding));
  }

  return decodeBodyContent(bodyText, encoding).trim();
}

function stripSignature(text: string): string {
  const lines = text.split("\n");
  const sigIndex = lines.findIndex((l) => l === "-- " || l === "--");
  return sigIndex === -1 ? text : lines.slice(0, sigIndex).join("\n");
}

function reflow(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let result = "";

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1] ?? "";

    const shouldJoin =
      i < lines.length - 1 &&
      cur !== "" &&
      next !== "" &&
      !cur.startsWith(">") &&
      !next.startsWith(">");

    result += cur;
    result += shouldJoin ? " " : "\n";
  }

  return result.trimEnd();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
