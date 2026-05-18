import registerHtml from "../../templates/register.html";
import successHtml from "../../templates/success.html";
import { register } from "../../lib/registration";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

function formField(form: FormData, name: string): string {
  const value = ((form.get(name) as string) ?? "").trim();
  return value;
}

export async function handleRegistration(request: Request, env: Env): Promise<Response> {
  const renderRegister = (error: string) =>
    html(renderTemplate(registerHtml, { error, emailDomain: env.EMAIL_DOMAIN }));

  if (request.method === "GET") {
    return renderRegister("");
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const username = formField(form, "username").toLowerCase();

    if (!email || !username) {
      return renderRegister("All fields are required.");
    }

    const requireSenderMatch = form.get("requireSenderMatch") === "true";
    const result = await register(env, { email, username, requireSenderMatch });

    if ("error" in result) {
      return renderRegister(result.error);
    }

    return html(
      renderTemplate(successHtml, {
        mcpToken: result.mcpToken,
        emailAddress: `u_${username}@${env.EMAIL_DOMAIN}`,
        state: result.state,
      }),
    );
  }

  return new Response("Method not allowed", { status: 405 });
}
