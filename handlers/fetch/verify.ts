import verifyHtml from "../../templates/verify.html";
import { consumePin } from "../../lib/pin";
import { completeRegistration } from "../../lib/registration";
import { hmacToken, generateRandomHex } from "../../lib/crypto";
import { escHtml } from "../../lib/html";
import { formField } from "../../lib/form";
import { sessionCookieHeader } from "../../lib/auth";
import { html, renderTemplate, pageVars } from "../../lib/responses";
import type { Env } from "../../lib/types";

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") ?? "";
    return html(renderTemplate(verifyHtml, pageVars({ error: "", email: escHtml(email) })));
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const pin = formField(form, "pin");

    const renderError = (error: string) =>
      html(renderTemplate(verifyHtml, pageVars({ error, email: escHtml(email) })));

    if (!email || !pin) return renderError("Email and PIN are required.");

    const data = await consumePin(email, pin, env);
    if (data === "locked") return renderError("Too many attempts. Request a new PIN.");
    if (!data) return renderError("Invalid or expired PIN.");

    if (data.type === "register") {
      const { sessionToken } = await completeRegistration(env, email, {
        username: data.username as string,
        requireSenderMatch: data.requireSenderMatch as boolean,
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${env.APP_URL}/profile?toast=Account+created`,
          "Set-Cookie": sessionCookieHeader(sessionToken),
        },
      });
    }

    if (data.type === "login") {
      const sessionToken = generateRandomHex(32);
      const encryptionKey = await env.ENCRYPTION_KEY.get();
      const sessionHash = await hmacToken(sessionToken, encryptionKey);
      await env.EPHEMERAL_KV.put(`session:${sessionHash}`, data.userId as string, {
        expirationTtl: 604800,
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${env.APP_URL}/profile`,
          "Set-Cookie": sessionCookieHeader(sessionToken),
        },
      });
    }

    return renderError("Unknown error. Please try again.");
  }

  return new Response("Method not allowed", { status: 405 });
}
