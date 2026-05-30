import registerHtml from "../../templates/register.html";
import { stageRegistration } from "../../lib/registration";
import { sendPin } from "../../lib/pin";
import { formField } from "../../lib/form";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

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

    if (!email || !username) return renderRegister("All fields are required.");

    const requireSenderMatch = form.get("requireSenderMatch") === "true";
    const result = await stageRegistration(env, { email, username, requireSenderMatch });

    if ("error" in result) return renderRegister(result.error);

    await sendPin(email, result.pin, env);

    return Response.redirect(`${env.APP_URL}/verify?email=${encodeURIComponent(email)}`, 302);
  }

  return new Response("Method not allowed", { status: 405 });
}
