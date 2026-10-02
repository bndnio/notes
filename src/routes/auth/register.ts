import registerHtml from "@/templates/register.html";
import { stageRegistration } from "@/lib/registration";
import { sendPin, checkIpPinSendRate, checkEmailPinSendRate } from "@/lib/pin";
import { formField } from "@/lib/form";
import { html, renderTemplate } from "@/lib/responses";
import { pageVars } from "@/lib/page";
import type { Env } from "@/lib/types";

export async function handleRegistration(request: Request, env: Env): Promise<Response> {
  const renderRegister = async (error: string) =>
    html(renderTemplate(registerHtml, await pageVars(request, env, { error, emailDomain: env.EMAIL_DOMAIN })));

  if (request.method === "GET") {
    return renderRegister("");
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const username = formField(form, "username").toLowerCase();

    if (!email || !username) return renderRegister("All fields are required.");

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!await checkIpPinSendRate(ip, env)) {
      return renderRegister("Too many requests. Please try again later.");
    }
    if (!await checkEmailPinSendRate(email, env)) {
      return renderRegister("Too many verification emails sent to this address. Please try again later.");
    }

    const requireSenderMatch = form.get("requireSenderMatch") === "true";
    const result = await stageRegistration(env, { email, username, requireSenderMatch });

    if ("error" in result) return renderRegister(result.error);

    await sendPin(email, result.pin, env);

    return Response.redirect(`${env.APP_URL}/auth/verify?email=${encodeURIComponent(email)}`, 302);
  }

  return new Response("Method not allowed", { status: 405 });
}
