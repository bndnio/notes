import registerHtml from "../../templates/register.html";
import successHtml from "../../templates/success.html";
import { register } from "../../lib/registration";
import { html } from "../../lib/responses";
import type { Env } from "../../lib/types";

function formField(form: FormData, name: string): string {
  const value = ((form.get(name) as string) ?? "").trim();
  return value;
}

export async function handleRegistration(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    return html(registerHtml.replace("{{error}}", ""));
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const username = formField(form, "username").toLowerCase();
    const notionDbId = formField(form, "notionDbId");
    const notionToken = formField(form, "notionToken");

    if (!email || !username || !notionDbId || !notionToken) {
      return html(registerHtml.replace("{{error}}", "All fields are required."));
    }

    const requireSenderMatch = form.get("requireSenderMatch") === "true";
    const result = await register(env, { email, username, notionDbId, notionToken, requireSenderMatch });

    if ("error" in result) {
      return html(registerHtml.replace("{{error}}", result.error));
    }

    const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;
    return html(
      successHtml.replace("{{mcpToken}}", result.mcpToken).replace("{{emailAddress}}", emailAddress),
    );
  }

  return new Response("Method not allowed", { status: 405 });
}
