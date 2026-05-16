import registerHtml from "../../templates/register.html";
import successHtml from "../../templates/success.html";
import { register } from "../../lib/registration";
import type { Env } from "../../lib/types";

function html(content: string): Response {
  return new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function handleRegistration(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    return html(registerHtml.replace("{{error}}", ""));
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = ((form.get("email") as string) ?? "").trim().toLowerCase();
    const username = ((form.get("username") as string) ?? "").trim().toLowerCase();
    const notionDbId = ((form.get("notionDbId") as string) ?? "").trim();
    const notionToken = ((form.get("notionToken") as string) ?? "").trim();

    if (!email || !username || !notionDbId || !notionToken) {
      return html(registerHtml.replace("{{error}}", "All fields are required."));
    }

    const result = await register(env, { email, username, notionDbId, notionToken });

    if ("error" in result) {
      return html(registerHtml.replace("{{error}}", result.error));
    }

    return html(successHtml.replace("{{mcpToken}}", result.mcpToken));
  }

  return new Response("Method not allowed", { status: 405 });
}
