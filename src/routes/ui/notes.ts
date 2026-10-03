import notesPageHtml from "@/templates/pages/notes.html";
import notesDayGroupHtml from "@/templates/components/notes/day-group.html";
import notesRowHtml from "@/templates/components/notes/row.html";
import notesPaginationHtml from "@/templates/components/notes/pagination.html";
import notesEmptyHtml from "@/templates/components/notes/empty.html";
import notesStorageOffHtml from "@/templates/components/notes/storage-off.html";
import notesBodyHtml from "@/templates/components/notes/body.html";
import notesScriptHtml from "@/templates/components/notes/script.html";
import toastHtml from "@/templates/partials/toast.html";
import { assertCsrf, assertSession, assertUser, getCsrfToken } from "@/lib/auth";
import { escHtml } from "@/lib/html";
import { pageVars } from "@/lib/page";
import { html, renderTemplate } from "@/lib/responses";
import { deleteStoredNote, readStoredNote } from "@/lib/platform-storage";
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

function notesUrl(toast: string | null): string {
  return toast ? `/notes?${new URLSearchParams({ toast })}` : "/notes";
}

function buildDayGroups(notes: NoteSummary[], csrfField: string): string {
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
            emailHidden: note.emailKey ? "" : "hidden",
            csrfField,
          });
        })
        .join("\n"),
    }))
    .join("\n");
}

export async function handleNotes(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const params = new URL(request.url).searchParams;
  const before = parseCursor(params.get("before"));
  const after = before ? undefined : parseCursor(params.get("after"));

  const page = await notesRepo.findPage(db, userId, { before, after });
  if (page.notes.length === 0 && page.total > 0) {
    return Response.redirect(`${env.APP_URL}${notesUrl(params.get("toast"))}`, 302);
  }

  const csrfToken = await getCsrfToken(sessionHash, encryptionKey);
  const csrfField = `<input type="hidden" name="_csrf" value="${csrfToken}">`;

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
    rangeEndValue: String(page.newerCount + shown),
    total: page.total.toLocaleString("en-US"),
    totalValue: String(page.total),
    toastTemplate: renderTemplate(toastHtml, { message: "" }),
    emptyState,
    dayGroups: buildDayGroups(page.notes, csrfField),
    pagination,
    script: notesScriptHtml,
  })));
}

const NOTE_ROUTE_RE = /^\/notes\/([0-9a-f]{12})\/(body|md|eml|delete)$/;

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
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const match = NOTE_ROUTE_RE.exec(new URL(request.url).pathname);
  if (!match) return notFound();
  const [, id, action] = match;

  if (action === "delete") {
    if (request.method !== "POST") return notFound();
    const form = await request.formData();
    await assertCsrf(form, sessionHash, encryptionKey);
    return deleteNote(request, db, env, userId, id);
  }
  if (request.method !== "GET") return notFound();

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

// The page script deletes in place and asks for JSON; a plain form submit gets a redirect.
function deleteResponse(request: Request, env: Env, ok: boolean, message: string): Response {
  if (request.headers.get("Accept")?.includes("application/json")) {
    return Response.json({ message }, { status: ok ? 200 : 404, headers: privateHeaders });
  }
  return Response.redirect(`${env.APP_URL}${notesUrl(message)}`, 302);
}

// R2 objects go first: if that fails, the row still points at them and a retry works.
// The reverse order could leave objects behind with nothing listing them.
async function deleteNote(
  request: Request,
  db: ReturnType<typeof createDb>,
  env: Env,
  userId: string,
  id: string,
): Promise<Response> {
  const note = await notesRepo.findById(db, userId, id);
  if (!note) return deleteResponse(request, env, false, "That note no longer exists.");

  await deleteStoredNote(env.NOTES_BUCKET, { mdKey: note.r2Key, emailKey: note.emailKey });
  await notesRepo.remove(db, userId, id);

  console.log(`Deleted note ${id} for user ${userId}`);
  return deleteResponse(request, env, true, "Note deleted");
}
