import { isLocalDev } from "./env";
import { sendEmail } from "./resend";
import type { Env } from "./types";

const PIN_TTL = 600; // 10 minutes
const PIN_SEND_WINDOW = 3600; // 1 hour
const PIN_SEND_EMAIL_LIMIT = 5;
const PIN_SEND_IP_LIMIT = 10;
const PIN_VERIFY_ATTEMPT_LIMIT = 5;

export function generatePin(): string {
  let pin = "";

  while (pin.length < 6) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    // 250 is the largest multiple of 10 below 256; rejecting 250-255 avoids modulo bias.
    if (byte < 250) pin += String(byte % 10);
  }

  return pin;
}

async function checkAndIncrementSendCount(key: string, limit: number, env: Env): Promise<boolean> {
  if (isLocalDev(env)) return true;
  const raw = await env.EPHEMERAL_KV.get(key);
  const count = parseInt(raw ?? "0", 10);
  if (count >= limit) return false;
  await env.EPHEMERAL_KV.put(key, String(count + 1), { expirationTtl: PIN_SEND_WINDOW });
  return true;
}

function isPinVerifyLocked(attempts: number, env: Env): boolean {
  if (isLocalDev(env)) return false;
  return attempts >= PIN_VERIFY_ATTEMPT_LIMIT;
}

async function recordPinVerifyAttempt(
  attemptsKey: string,
  attempts: number,
  env: Env,
): Promise<void> {
  if (isLocalDev(env)) return;
  await env.EPHEMERAL_KV.put(attemptsKey, String(attempts + 1), { expirationTtl: PIN_TTL });
}

export async function checkEmailPinSendRate(email: string, env: Env): Promise<boolean> {
  return checkAndIncrementSendCount(`pin_send_count:${email}`, PIN_SEND_EMAIL_LIMIT, env);
}

export async function checkIpPinSendRate(ip: string, env: Env): Promise<boolean> {
  return checkAndIncrementSendCount(`pin_send_count_ip:${ip}`, PIN_SEND_IP_LIMIT, env);
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
  if (isPinVerifyLocked(attempts, env)) return "locked";

  const data = JSON.parse(raw) as Record<string, unknown>;
  if (data.pin !== pin) {
    await recordPinVerifyAttempt(attemptsKey, attempts, env);
    return null;
  }

  await Promise.all([
    env.EPHEMERAL_KV.delete(`pin:${email}`),
    env.EPHEMERAL_KV.delete(attemptsKey),
  ]);
  return data;
}

export async function sendPin(to: string, pin: string, env: Env): Promise<void> {
  if (isLocalDev(env)) {
    console.warn("PIN logged to console instead of email (local dev)")
    console.log(`[dev] PIN for ${to}: ${pin}`);
    return;
  }
  await sendEmail(to, "Your verification PIN", `Your PIN is: ${pin}\n\nThis PIN expires in 10 minutes.`, env);
}
