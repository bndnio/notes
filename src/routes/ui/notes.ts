import notesPageHtml from "@/templates/pages/notes.html";
import notesDayGroupHtml from "@/templates/components/notes/day-group.html";
import notesRowHtml from "@/templates/components/notes/row.html";
import notesPaginationHtml from "@/templates/components/notes/pagination.html";
import notesEmptyHtml from "@/templates/components/notes/empty.html";
import notesStorageOffHtml from "@/templates/components/notes/storage-off.html";
import notesBodyHtml from "@/templates/components/notes/body.html";
import notesScriptHtml from "@/templates/components/notes/script.html";
import { assertSession, assertUser } from "@/lib/auth";
import { escHtml } from "@/lib/html";
import { pageVars } from "@/lib/page";
import { html, renderTemplate } from "@/lib/responses";
import { readStoredNote } from "@/lib/platform-storage";
import { createDb } from "@/db";
import * as notesRepo from "@/db/repositories/notes";
import type { Env, NoteSummary } from "@/lib/types";

const CURSOR_RE = /^(\d+)-([0-9a-f]{12})$/;

function parseCursor(value: string | null): notesRepo.NoteCursor | undefined {
  const match = value ? CURSOR_RE.exec(value) : null;
  return match ? { createdAt: Number(match[1]), id: match[2] } : undefined;
}

function formatCursor(note: NoteSummary): string {
  return `${note.createdAt}-${note.id}`;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

function buildDayGroups(notes: NoteSummary[]): string {
  const groups = new Map<string, NoteSummary[]>();
  for (const note of notes) {
    const day = new Date(note.createdAt).toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), note]);
  }

  return [...groups.values()]
    .map((dayNotes) => renderTemplate(notesDayGroupHtml, {
      date: dayFormat.format(dayNotes[0].createdAt),
      rows: dayNotes
        .map((note) => {
          const iso = new Date(note.createdAt).toISOString();
          return renderTemplate(notesRowHtml, {
            id: escHtml(note.id),
            iso,
            time: iso.slice(11, 16),
            subject: escHtml(note.subject),
            from: escHtml(note.from),
          });
        })
        .join("\n"),
    }))
    .join("\n");
}

export async function handleNotes(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const params = new URL(request.url).searchParams;
  const before = parseCursor(params.get("before"));
  const after = before ? undefined : parseCursor(params.get("after"));

  const page = await notesRepo.findPage(db, userId, { before, after });
  if (page.notes.length === 0 && page.total > 0) {
    return Response.redirect(`${env.APP_URL}/notes`, 302);
  }

  const shown = page.notes.length;
  const hasNewer = page.newerCount > 0;
  const hasOlder = page.newerCount + shown < page.total;

  let emptyState = "";
  if (!user.storageEnabled) {
    emptyState = notesStorageOffHtml;
  } else if (page.total === 0) {
    emptyState = renderTemplate(notesEmptyHtml, {
      emailAddress: escHtml(`u_${user.username}@${env.EMAIL_DOMAIN}`),
    });
  }

  const pagination = hasNewer || hasOlder
    ? renderTemplate(notesPaginationHtml, {
        newerHref: hasNewer ? `/notes?after=${formatCursor(page.notes[0])}` : "",
        newerHidden: hasNewer ? "" : "hidden",
        olderHref: hasOlder ? `/notes?before=${formatCursor(page.notes[shown - 1])}` : "",
        olderHidden: hasOlder ? "" : "hidden",
      })
    : "";

  return html(renderTemplate(notesPageHtml, await pageVars(request, env, {
    metaHidden: shown > 0 ? "" : "hidden",
    rangeStart: (page.newerCount + 1).toLocaleString("en-US"),
    rangeEnd: (page.newerCount + shown).toLocaleString("en-US"),
    total: page.total.toLocaleString("en-US"),
    emptyState,
    dayGroups: buildDayGroups(page.notes),
    pagination,
    script: notesScriptHtml,
  })));
}

const NOTE_ROUTE_RE = /^\/notes\/([0-9a-f]{12})\/(body|md|eml)$/;

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const notFound = () => new Response("Not found", { status: 404, headers: privateHeaders });

// `<date>-<name>` from `<userId>/<date>/<name>`, so downloads sort by date.
function downloadFilename(key: string): string {
  const [, date, name] = key.split("/");
  return `${date}-${name}`;
}

function download(object: R2ObjectBody, key: string, contentType: string): Response {
  return new Response(object.body, {
    headers: {
      ...privateHeaders,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${downloadFilename(key)}"`,
    },
  });
}

export async function handleNoteRoutes(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const match = NOTE_ROUTE_RE.exec(new URL(request.url).pathname);
  if (!match || request.method !== "GET") return notFound();
  const [, id, action] = match;

  const note = await notesRepo.findById(db, userId, id);
  if (!note) return notFound();

  if (action === "body") {
    const content = await readStoredNote(env.NOTES_BUCKET, note.r2Key);
    if (!content) {
      console.warn(`Indexed note ${note.id} has no object at ${note.r2Key}`);
      return notFound();
    }
    return new Response(renderTemplate(notesBodyHtml, {
      id: escHtml(note.id),
      from: escHtml(note.from),
      to: escHtml(content.to),
      toHidden: content.to ? "" : "hidden",
      body: escHtml(content.body),
      emailHidden: note.emailKey ? "" : "hidden",
    }), { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }

  const key = action === "md" ? note.r2Key : note.emailKey;
  if (!key) return notFound();
  const object = await env.NOTES_BUCKET.get(key);
  if (!object) {
    console.warn(`Indexed note ${note.id} has no object at ${key}`);
    return notFound();
  }
  return download(object, key, action === "md" ? "text/markdown; charset=utf-8" : "message/rfc822");
}
