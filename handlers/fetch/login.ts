import loginHtml from "../../templates/login.html";
import { generatePin, storePin, sendPin } from "../../lib/pin";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

function formField(form: FormData, name: string): string {
  return ((form.get(name) as string) ?? "").trim();
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const renderLogin = (error: string) =>
    html(renderTemplate(loginHtml, { error }));

  if (request.method === "GET") {
    return renderLogin("");
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();

    if (!email) return renderLogin("Email is required.");

    const userId = await env.USER_INDEX_KV.get(email);
    if (userId) {
      const pin = generatePin();
      await storePin(email, pin, { type: "login", userId }, env);
      await sendPin(email, pin, env);
    }

    // Always redirect to avoid email enumeration
    return Response.redirect(`${env.APP_URL}/verify?email=${encodeURIComponent(email)}`, 302);
  }

  return new Response("Method not allowed", { status: 405 });
}
