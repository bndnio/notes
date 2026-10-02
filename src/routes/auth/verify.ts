import verifyHtml from "@/templates/verify.html";
import {
  checkEmailPinSendRate,
  checkIpPinSendRate,
  consumePin,
  rotateAuthPin,
  rotatePin,
  sendPin,
} from "@/lib/pin";
import { completeRegistration } from "@/lib/registration";
import { hmacToken, generateRandomHex } from "@/lib/crypto";
import { escHtml } from "@/lib/html";
import { formField } from "@/lib/form";
import { sessionCookieHeader } from "@/lib/auth";
import { html, renderTemplate } from "@/lib/responses";
import { pageVars } from "@/lib/page";
import * as sessionsKv from "@/kv/repositories/sessions";
import { createDb } from "@/db";
import * as usersRepo from "@/db/repositories/users";
import type { Env } from "@/lib/types";

async function renderVerify(request: Request, env: Env, email: string, error: string, notice: string): Promise<Response> {
  return html(renderTemplate(verifyHtml, await pageVars(request, env, {
    error,
    notice,
    email: escHtml(email),
  })));
}

async function handleResend(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const email = formField(form, "email").toLowerCase();
  if (!email) return renderVerify(request, env, "", "Email is required.", "");

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!await checkIpPinSendRate(ip, env)) {
    return renderVerify(request, env, email, "Too many requests. Please try again later.", "");
  }
  if (!await checkEmailPinSendRate(email, env)) {
    return renderVerify(request, env, email, "Too many verification emails sent to this address. Please try again later.", "");
  }

  const authPin = await rotateAuthPin(email);
  if (authPin) {
    await sendPin(email, authPin, env);
    return renderVerify(request, env, email, "", "New PIN sent.");
  }

  const db = createDb(env.DB);
  const user = await usersRepo.findByEmail(db, email);
  if (user) {
    const pin = await rotatePin(email, { type: "login", userId: user.id });
    await sendPin(email, pin, env);
    return renderVerify(request, env, email, "", "New PIN sent.");
  }

  return renderVerify(request, env, email, "Registration PIN expired. Register again to continue.", "");
}

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/auth/verify/resend") {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    return handleResend(request, env);
  }

  if (request.method === "GET") {
    const email = new URL(request.url).searchParams.get("email") ?? "";
    return renderVerify(request, env, email, "", "");
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const email = formField(form, "email").toLowerCase();
    const pin = formField(form, "pin");

    if (!email || !pin) return renderVerify(request, env, email, "Email and PIN are required.", "");

    const data = await consumePin(email, pin, env);
    if (data === "locked") return renderVerify(request, env, email, "Too many attempts. Send a new PIN.", "");
    if (data === "expired") return renderVerify(request, env, email, "PIN expired. Send a new one.", "");
    if (!data) return renderVerify(request, env, email, "Invalid PIN.", "");

    if (data.type === "register") {
      const { sessionToken } = await completeRegistration(env, email, {
        username: data.username,
        requireSenderMatch: data.requireSenderMatch,
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
      const encryptionKey = env.SEC_ENCRYPTION_KEY;
      const sessionHash = await hmacToken(sessionToken, encryptionKey);
      await sessionsKv.create(sessionHash, data.userId);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${env.APP_URL}/profile`,
          "Set-Cookie": sessionCookieHeader(sessionToken),
        },
      });
    }

    return renderVerify(request, env, email, "Unknown error. Please try again.", "");
  }

  return new Response("Method not allowed", { status: 405 });
}
