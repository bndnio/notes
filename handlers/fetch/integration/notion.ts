import notionSelectHtml from "../../../templates/notion-select.html";
import notionConnectedHtml from "../../../templates/notion-connected.html";
import { encrypt, generateRandomHex } from "../../../lib/crypto";
import { lookupProfile } from "../../../lib/profiles";
import { resolveNotionSecrets } from "../../../lib/tokens";
import { html, renderTemplate } from "../../../lib/responses";
import type { Env, NotionSecrets } from "../../../lib/types";
import {
  completeNotionSetup,
  escHtml,
  listDatabases,
  renderNotionSetup,
  type NotionDatabase,
} from "./notion-helpers";

// TODO: review this page after the notion connection is moved to a single OAuth app

async function handleConnect(searchParams: URLSearchParams, env: Env): Promise<Response> {
  const state = searchParams.get("state") ?? "";
  const userId = await env.EPHEMERAL_KV.get(`notion_state:${state}`);
  if (!userId) return new Response("Link expired or invalid.", { status: 404 });

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile?.notionClientId) {
    return Response.redirect(`${env.APP_URL}/integration/notion/setup?state=${state}`, 302);
  }

  const oauthUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  oauthUrl.searchParams.set("client_id", profile.notionClientId);
  oauthUrl.searchParams.set("redirect_uri", `${env.APP_URL}/integration/notion/callback`);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("owner", "user");
  return Response.redirect(oauthUrl.toString(), 302);
}

async function handleSetupGet(searchParams: URLSearchParams, env: Env): Promise<Response> {
  return renderNotionSetup(searchParams.get("state") ?? "", env);
}

async function handleSetupPost(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const state = ((form.get("state") as string) ?? "").trim();
  const notionClientId = ((form.get("notionClientId") as string) ?? "").trim();
  const notionClientSecret = ((form.get("notionClientSecret") as string) ?? "").trim();

  if (!state || !notionClientId || !notionClientSecret) {
    return renderNotionSetup(state, env, "All fields are required.");
  }

  const userId = await env.EPHEMERAL_KV.get(`notion_state:${state}`);
  if (!userId) return new Response("Link expired or invalid.", { status: 404 });

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return new Response("Account not found.", { status: 404 });

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const existing = await resolveNotionSecrets(userId, env);
  const secrets: NotionSecrets = { clientSecret: notionClientSecret, accessToken: existing?.accessToken };
  const encrypted = await encrypt(JSON.stringify(secrets), encryptionKey);

  await Promise.all([
    env.NOTION_TOKEN_KV.put(userId, encrypted),
    env.PROFILE_KV.put(userId, JSON.stringify({ ...profile, notionClientId })),
  ]);

  return Response.redirect(`${env.APP_URL}/integration/notion/connect?state=${state}`, 302);
}

async function handleCallback(searchParams: URLSearchParams, env: Env): Promise<Response> {
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";

  const userId = await env.EPHEMERAL_KV.get(`notion_state:${state}`);
  if (!userId) return new Response("Link expired or invalid.", { status: 404 });

  await env.EPHEMERAL_KV.delete(`notion_state:${state}`);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile?.notionClientId) return new Response("Notion app not configured.", { status: 400 });

  const secrets = await resolveNotionSecrets(userId, env);
  if (!secrets?.clientSecret) return new Response("Notion credentials not found.", { status: 400 });

  const credentials = btoa(`${profile.notionClientId}:${secrets.clientSecret}`);
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

  const tokenData = await tokenRes.json() as { access_token: string };
  const accessToken = tokenData.access_token;

  const databases = await listDatabases(accessToken);

  if (databases.length === 0) {
    return html("<p>No databases were shared. Go back and share at least one Notion database with this integration.</p>");
  }

  if (databases.length === 1) {
    await completeNotionSetup(userId, accessToken, databases[0].id, env);
    return html(notionConnectedHtml);
  }

  const pickerToken = generateRandomHex(32);
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const updatedSecrets: NotionSecrets = { clientSecret: secrets.clientSecret, accessToken };
  const encrypted = await encrypt(JSON.stringify(updatedSecrets), encryptionKey);

  await Promise.all([
    env.NOTION_TOKEN_KV.put(userId, encrypted),
    env.EPHEMERAL_KV.put(`notion_pick:${pickerToken}`, userId, { expirationTtl: 600 }),
    env.EPHEMERAL_KV.put(`notion_dbs:${pickerToken}`, JSON.stringify(databases), { expirationTtl: 600 }),
  ]);

  const databasesHtml = databases
    .map(
      (db) =>
        `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;font-weight:400;">` +
        `<input type="radio" name="dbId" value="${escHtml(db.id)}" required>` +
        `${escHtml(db.title)}</label>`,
    )
    .join("\n");

  return html(renderTemplate(notionSelectHtml, { pickerToken, databases: databasesHtml }));
}

async function handleSelectPost(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const pickerToken = ((form.get("pickerToken") as string) ?? "").trim();
  const dbId = ((form.get("dbId") as string) ?? "").trim();

  const [userId, dbsJson] = await Promise.all([
    env.EPHEMERAL_KV.get(`notion_pick:${pickerToken}`),
    env.EPHEMERAL_KV.get(`notion_dbs:${pickerToken}`),
  ]);

  if (!userId || !dbsJson) return new Response("Session expired.", { status: 400 });

  const databases = JSON.parse(dbsJson) as NotionDatabase[];
  if (!databases.some((db) => db.id === dbId)) return new Response("Invalid database selection.", { status: 400 });

  const secrets = await resolveNotionSecrets(userId, env);
  if (!secrets?.accessToken) return new Response("Access token not found.", { status: 400 });

  await Promise.all([
    completeNotionSetup(userId, secrets.accessToken, dbId, env),
    env.EPHEMERAL_KV.delete(`notion_pick:${pickerToken}`),
    env.EPHEMERAL_KV.delete(`notion_dbs:${pickerToken}`),
  ]);

  return html(notionConnectedHtml);
}

export async function handleNotionIntegration(request: Request, env: Env): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  if (pathname === "/integration/notion/connect" && request.method === "GET") {
    return handleConnect(searchParams, env);
  }
  if (pathname === "/integration/notion/setup" && request.method === "GET") {
    return handleSetupGet(searchParams, env);
  }
  if (pathname === "/integration/notion/setup" && request.method === "POST") {
    return handleSetupPost(request, env);
  }
  if (pathname === "/integration/notion/callback" && request.method === "GET") {
    return handleCallback(searchParams, env);
  }
  if (pathname === "/integration/notion/select" && request.method === "POST") {
    return handleSelectPost(request, env);
  }

  return new Response("Not found", { status: 404 });
}
