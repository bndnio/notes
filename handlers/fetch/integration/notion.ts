import notionRelayHtml from "../../../templates/notion-relay.html";
import notionSelectModalHtml from "../../../templates/notion-select-modal.html";
import notionScriptHtml from "../../../templates/notion-script.html";
import { resolveSession, assertSession, assertUser, assertCsrf } from "../../../lib/auth";
import { encrypt, generateRandomHex } from "../../../lib/crypto";
import { escHtml } from "../../../lib/html";
import { html, renderTemplate, renderIntegrationCard } from "../../../lib/responses";
import type { Env, Profile } from "../../../lib/types";
import { createDb } from "../../../lib/db";
import { completeNotionSetup, listDatabases, type NotionDatabase } from "./notion-helpers";

function buildNotionModal(databases: Array<{ id: string; title: string }>, csrfField: string): string {
  const databaseOptions = databases
    .map(
      (db) =>
        `<label class="checkbox-label">` +
        `<input type="radio" name="dbId" value="${escHtml(db.id)}" required> ` +
        `${escHtml(db.title)}</label>`,
    )
    .join("\n");
  return renderTemplate(notionSelectModalHtml, { databases: databaseOptions, csrfField });
}

export async function buildNotionSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<{ card: string; modal: string; script: string }> {
  const script = notionScriptHtml;

  if (profile.notion?.databaseId) {
    return {
      card: renderIntegrationCard({
        name: "Notion",
        badgeClass: "status-badge--connected",
        badgeText: "Connected",
        description: "Notes are being saved to your Notion database.",
        action: "",
      }),
      modal: "",
      script,
    };
  }

  const dbsJson = await env.EPHEMERAL_KV.get(`notion_dbs:${userId}`);
  const databases = dbsJson ? (JSON.parse(dbsJson) as Array<{ id: string; title: string }>) : null;

  if (databases && databases.length > 0) {
    return {
      card: renderIntegrationCard({
        name: "Notion",
        badgeClass: "status-badge--pending",
        badgeText: "Pending",
        description: "Notion is authorized — choose which database to save notes to.",
        action: `<button class="btn" onclick="openNotionModal()">Select database →</button>`,
      }),
      modal: buildNotionModal(databases, csrfField),
      script,
    };
  }

  return {
    card: renderIntegrationCard({
      name: "Notion",
      badgeClass: "status-badge--none",
      badgeText: "Not connected",
      description: "Connect Notion to save notes to your workspace.",
      action: `<button id="notion-connect-btn" class="btn" onclick="openNotionPopup()">Connect →</button>`,
    }),
    modal: "",
    script,
  };
}

async function handleConnect(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const { userId } = await assertSession(request, env, encryptionKey);

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

async function handleCallback(request: Request, searchParams: URLSearchParams, env: Env): Promise<Response> {
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";

  const userId = await env.EPHEMERAL_KV.get(`notion_state:${state}`);
  if (!userId) return new Response("Link expired or invalid.", { status: 404 });

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const sessionUserId = await resolveSession(request, env, encryptionKey);
  if (sessionUserId !== userId) {
    return Response.redirect(`${env.APP_URL}/login`, 302);
  }

  await env.EPHEMERAL_KV.delete(`notion_state:${state}`);

  const clientSecret = await env.NOTION_CLIENT_SECRET.get();
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
  const databases = await listDatabases(accessToken);

  if (databases.length === 0) {
    const error = encodeURIComponent("No databases found. Share a Notion database with this integration and try again.");
    return Response.redirect(`${env.APP_URL}/integration/notion/relay?error=${error}`, 302);
  }

  const encrypted = await encrypt(accessToken, encryptionKey);

  await Promise.all([
    env.EPHEMERAL_KV.put(`notion_token:${userId}`, encrypted, { expirationTtl: 3600 }),
    env.EPHEMERAL_KV.put(`notion_dbs:${userId}`, JSON.stringify(databases), { expirationTtl: 3600 }),
  ]);

  return Response.redirect(`${env.APP_URL}/integration/notion/relay`, 302);
}

function handleRelay(request: Request, env: Env): Response {
  const error = new URL(request.url).searchParams.get("error") ?? "";
  return html(renderTemplate(notionRelayHtml, { appUrl: env.APP_URL, error: escHtml(error) }));
}

async function handleSelectPost(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const dbId = ((form.get("dbId") as string) ?? "").trim();

  const [dbsJson, encryptedToken] = await Promise.all([
    env.EPHEMERAL_KV.get(`notion_dbs:${userId}`),
    env.EPHEMERAL_KV.get(`notion_token:${userId}`),
  ]);

  if (!dbsJson || !encryptedToken) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Notion+authorization+expired,+please+reconnect`, 302);
  }

  const databases = JSON.parse(dbsJson) as NotionDatabase[];
  if (!databases.some((db) => db.id === dbId)) {
    return new Response("Invalid database selection.", { status: 400 });
  }

  await Promise.all([
    completeNotionSetup(userId, encryptedToken, dbId, env),
    env.EPHEMERAL_KV.delete(`notion_dbs:${userId}`),
    env.EPHEMERAL_KV.delete(`notion_token:${userId}`),
  ]);

  return Response.redirect(`${env.APP_URL}/profile?toast=Notion+database+connected`, 302);
}

export async function handleNotionIntegration(request: Request, env: Env): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  if (pathname === "/integration/notion/connect" && request.method === "GET") {
    return handleConnect(request, env);
  }
  if (pathname === "/integration/notion/callback" && request.method === "GET") {
    return handleCallback(request, searchParams, env);
  }
  if (pathname === "/integration/notion/relay" && request.method === "GET") {
    return handleRelay(request, env);
  }
  if (pathname === "/integration/notion/select" && request.method === "POST") {
    return handleSelectPost(request, env);
  }

  return new Response("Not found", { status: 404 });
}
