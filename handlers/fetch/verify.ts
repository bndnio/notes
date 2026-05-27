import verifyHtml from "../../templates/verify.html";
import successHtml from "../../templates/success.html";
import { consumePin } from "../../lib/pin";
import { completeRegistration } from "../../lib/registration";
import { hmacToken, generateRandomHex } from "../../lib/crypto";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

function formField(form: FormData, name: string): string {
  return ((form.get(name) as string) ?? "").trim();
}

function sessionCookieHeader(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`;
}

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") ?? "";
    return html(renderTemplate(verifyHtml, { error: "", email }));
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const pin = formField(form, "pin");

    const renderError = (error: string) =>
      html(renderTemplate(verifyHtml, { error, email }));

    if (!email || !pin) return renderError("Email and PIN are required.");

    const data = await consumePin(email, pin, env);
    if (!data) return renderError("Invalid or expired PIN.");

    if (data.type === "register") {
      const { mcpToken, sessionToken } = await completeRegistration(env, email, {
        username: data.username as string,
        requireSenderMatch: data.requireSenderMatch as boolean,
      });
      const res = html(
        renderTemplate(successHtml, {
          mcpToken,
          emailAddress: `u_${data.username}@${env.EMAIL_DOMAIN}`,
        }),
      );
      res.headers.set("Set-Cookie", sessionCookieHeader(sessionToken));
      return res;
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
          Location: `${env.APP_URL}/`,
          "Set-Cookie": sessionCookieHeader(sessionToken),
        },
      });
    }

    return renderError("Unknown error. Please try again.");
  }

  return new Response("Method not allowed", { status: 405 });
}
