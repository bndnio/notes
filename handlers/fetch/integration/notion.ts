import notionSelectHtml from "../../../templates/notion-select.html";
import notionConnectedHtml from "../../../templates/notion-connected.html";
import { encrypt, generateRandomHex, hmacToken } from "../../../lib/crypto";
import { resolveNotionToken } from "../../../lib/tokens";
import { getCookie } from "../../../lib/cookies";
import { html, renderTemplate } from "../../../lib/responses";
import type { Env } from "../../../lib/types";
import {
  completeNotionSetup,
  escHtml,
  listNotionItems,
  type NotionItem,
} from "./notion-helpers";

async function handleConnect(request: Request, env: Env): Promise<Response> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return Response.redirect(`${env.APP_URL}/auth/connect`, 302);

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const userId = await env.EPHEMERAL_KV.get(`session:${sessionHash}`);
  if (!userId) return Response.redirect(`${env.APP_URL}/auth/connect`, 302);

  const state = generateRandomHex(32);
  await env.EPHEMERAL_KV.put(`notion_state:${state}`, userId, { expirationTtl: 900 });

  const oauthUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  oauthUrl.searchParams.set("client_id", env.NOTION_CLIENT_ID);
  oauthUrl.searchParams.set("redirect_uri", `${env.APP_URL}/integration/notion/callback`);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("owner", "user");
  return Response.redirect(oauthUrl.toString(), 302);
}

async function handleCallback(searchParams: URLSearchParams, env: Env): Promise<Response> {
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";

  const userId = await env.EPHEMERAL_KV.get(`notion_state:${state}`);
  if (!userId) return new Response("Link expired or invalid.", { status: 404 });

  await env.EPHEMERAL_KV.delete(`notion_state:${state}`);

  const [clientSecret, encryptionKey] = await Promise.all([
    env.NOTION_CLIENT_SECRET.get(),
    env.ENCRYPTION_KEY.get(),
  ]);

  const credentials = btoa(`${env.NOTION_CLIENT_ID}:${clientSecret}`);
  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${env.APP_URL}/integration/notion/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Notion token exchange failed: ${err}`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const accessToken = tokenData.access_token;

  const items = await listNotionItems(accessToken);

  if (items.length === 0) {
    return html("<p>No items were shared. Go back and share at least one Notion database with this integration.</p>");
  }

  if (items.length === 1) {
    await completeNotionSetup(userId, accessToken, items[0].id, env);
    return html(notionConnectedHtml);
  }

  const pickerToken = generateRandomHex(32);
  const encrypted = await encrypt(accessToken, encryptionKey);

  await Promise.all([
    env.NOTION_TOKEN_KV.put(userId, encrypted),
    env.EPHEMERAL_KV.put(`notion_pick:${pickerToken}`, userId, { expirationTtl: 3600 }),
    env.EPHEMERAL_KV.put(`notion_dbs:${pickerToken}`, JSON.stringify(items), { expirationTtl: 3600 }),
  ]);

  const itemsHtml = items
    .map(
      (db) =>
        `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;font-weight:400;">` +
        `<input type="radio" name="dbId" value="${escHtml(db.id)}" required>` +
        `${escHtml(db.title)}</label>`,
    )
    .join("\n");

  return html(renderTemplate(notionSelectHtml, { pickerToken, items: itemsHtml }));
}

async function handleSelectPost(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const pickerToken = ((form.get("pickerToken") as string) ?? "").trim();
  const dbId = ((form.get("dbId") as string) ?? "").trim();

  const [userId, dbsJson] = await Promise.all([
    env.EPHEMERAL_KV.get(`notion_pick:${pickerToken}`),
    env.EPHEMERAL_KV.get(`notion_dbs:${pickerToken}`),
  ]);

  if (!userId || !dbsJson) return Response.redirect(`${env.APP_URL}/integration/notion/connect`, 302);

  const items = JSON.parse(dbsJson) as NotionItem[];
  if (!items.some((db) => db.id === dbId)) return new Response("Invalid database selection.", { status: 400 });

  const accessToken = await resolveNotionToken(userId, env);
  if (!accessToken) return new Response("Access token not found.", { status: 400 });

  await Promise.all([
    completeNotionSetup(userId, accessToken, dbId, env),
    env.EPHEMERAL_KV.delete(`notion_pick:${pickerToken}`),
    env.EPHEMERAL_KV.delete(`notion_dbs:${pickerToken}`),
  ]);

  return html(notionConnectedHtml);
}

export async function handleNotionIntegration(request: Request, env: Env): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  if (pathname === "/integration/notion/connect" && request.method === "GET") {
    return handleConnect(request, env);
  }
  if (pathname === "/integration/notion/callback" && request.method === "GET") {
    return handleCallback(searchParams, env);
  }
  if (pathname === "/integration/notion/select" && request.method === "POST") {
    return handleSelectPost(request, env);
  }

  return new Response("Not found", { status: 404 });
}
