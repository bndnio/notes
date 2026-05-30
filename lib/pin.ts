import { sendEmail } from "./resend";
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
): Promise<Record<string, unknown> | "locked" | null> {
  const attemptsKey = `pin_attempts:${email}`;
  const [raw, attemptsRaw] = await Promise.all([
    env.EPHEMERAL_KV.get(`pin:${email}`),
    env.EPHEMERAL_KV.get(attemptsKey),
  ]);
  if (!raw) return null;

  const attempts = parseInt(attemptsRaw ?? "0", 10);
  if (attempts >= 5) return "locked";

  const data = JSON.parse(raw) as Record<string, unknown>;
  if (data.pin !== pin) {
    await env.EPHEMERAL_KV.put(attemptsKey, String(attempts + 1), { expirationTtl: PIN_TTL });
    return null;
  }

  await Promise.all([
    env.EPHEMERAL_KV.delete(`pin:${email}`),
    env.EPHEMERAL_KV.delete(attemptsKey),
  ]);
  return data;
}

export async function sendPin(to: string, pin: string, env: Env): Promise<void> {
  await sendEmail(to, "Your verification PIN", `Your PIN is: ${pin}\n\nThis PIN expires in 10 minutes.`, env);
}
