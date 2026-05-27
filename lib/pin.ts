import { EmailMessage } from "cloudflare:email";
import type { Env } from "./types";

const PIN_TTL = 600; // 10 minutes

export function generatePin(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b % 10).join("");
}

export async function storePin(
  email: string,
  pin: string,
  payload: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const stored = JSON.stringify({ pin, ...payload });
  await env.EPHEMERAL_KV.put(`pin:${email}`, stored, { expirationTtl: PIN_TTL });
}

export async function consumePin(
  email: string,
  pin: string,
  env: Env,
): Promise<Record<string, unknown> | null> {
  const raw = await env.EPHEMERAL_KV.get(`pin:${email}`);
  if (!raw) return null;
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (data.pin !== pin) return null;
  await env.EPHEMERAL_KV.delete(`pin:${email}`);
  return data;
}

export async function sendPin(to: string, pin: string, env: Env): Promise<void> {
  const from = `noreply@${env.EMAIL_DOMAIN}`;
  const raw = [
    `From: Notes <${from}>`,
    `To: ${to}`,
    `Subject: Your verification PIN`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `Your PIN is: ${pin}`,
    ``,
    `This PIN expires in 10 minutes.`,
  ].join("\r\n");

  const message = new EmailMessage(from, to, new Response(raw).body!);
  await env.SEND_EMAIL.send(message);
}
