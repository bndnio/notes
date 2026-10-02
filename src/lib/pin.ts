import { isLocalDev } from "./env";
import { sendEmail } from "./resend";
import * as pinsRepo from "@/kv/repositories/pins";
import * as pinSendCountsRepo from "@/kv/repositories/pin-send-counts";
import type { PinPayload } from "@/kv/repositories/pins";
import type { Env } from "./types";

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

function isPinVerifyLocked(attempts: number, env: Env): boolean {
  if (isLocalDev(env)) return false;
  return attempts >= PIN_VERIFY_ATTEMPT_LIMIT;
}

async function recordPinVerifyAttempt(email: string, attempts: number, env: Env): Promise<void> {
  if (isLocalDev(env)) return;
  await pinsRepo.putAttempts(env.EPHEMERAL_KV, email, attempts + 1);
}

export async function checkEmailPinSendRate(email: string, env: Env): Promise<boolean> {
  if (isLocalDev(env)) return true;
  const count = await pinSendCountsRepo.findByEmail(env.EPHEMERAL_KV, email);
  if (count >= PIN_SEND_EMAIL_LIMIT) return false;
  await pinSendCountsRepo.putForEmail(env.EPHEMERAL_KV, email, count + 1);
  return true;
}

export async function checkIpPinSendRate(ip: string, env: Env): Promise<boolean> {
  if (isLocalDev(env)) return true;
  const count = await pinSendCountsRepo.findByIp(env.EPHEMERAL_KV, ip);
  if (count >= PIN_SEND_IP_LIMIT) return false;
  await pinSendCountsRepo.putForIp(env.EPHEMERAL_KV, ip, count + 1);
  return true;
}

export async function storePin(
  email: string,
  pin: string,
  payload: PinPayload,
  env: Env,
): Promise<void> {
  await pinsRepo.put(env.EPHEMERAL_KV, email, { pin, ...payload });
}

/** Drops a staged PIN without consuming it — used when a flow is abandoned. */
export async function discardPin(email: string, env: Env): Promise<void> {
  await pinsRepo.remove(env.EPHEMERAL_KV, email);
}

async function readPinPayload(email: string, env: Env): Promise<PinPayload | null> {
  const record = await pinsRepo.find(env.EPHEMERAL_KV, email);
  if (!record) return null;
  const { pin: _pin, ...payload } = record;
  return payload;
}

/** Issues a replacement PIN for an existing payload and clears verify-attempt lockout. */
export async function rotatePin(email: string, payload: PinPayload, env: Env): Promise<string> {
  const pin = generatePin();
  await Promise.all([
    storePin(email, pin, payload, env),
    pinsRepo.removeAttempts(env.EPHEMERAL_KV, email),
  ]);
  return pin;
}

/** Re-issues a live login or register PIN. Returns null when the stored PIN is missing or belongs to another flow. */
export async function rotateAuthPin(email: string, env: Env): Promise<string | null> {
  const existing = await readPinPayload(email, env);
  if (!existing || (existing.type !== "login" && existing.type !== "register")) return null;
  return rotatePin(email, existing, env);
}

export async function consumePin(
  email: string,
  pin: string,
  env: Env,
): Promise<PinPayload | "locked" | "expired" | null> {
  const [record, attempts] = await Promise.all([
    pinsRepo.find(env.EPHEMERAL_KV, email),
    pinsRepo.findAttempts(env.EPHEMERAL_KV, email),
  ]);
  if (!record) return "expired";

  if (isPinVerifyLocked(attempts, env)) return "locked";

  const { pin: storedPin, ...payload } = record;
  if (storedPin !== pin) {
    await recordPinVerifyAttempt(email, attempts, env);
    return null;
  }

  await Promise.all([
    pinsRepo.remove(env.EPHEMERAL_KV, email),
    pinsRepo.removeAttempts(env.EPHEMERAL_KV, email),
  ]);
  return payload;
}

export async function sendPin(to: string, pin: string, env: Env): Promise<void> {
  if (isLocalDev(env)) {
    console.warn("PIN logged to console instead of email (local dev)")
    console.log(`[dev] PIN for ${to}: ${pin}`);
    return;
  }
  await sendEmail(to, "Your verification PIN", `Your PIN is: ${pin}\n\nThis PIN expires in 10 minutes.`, env);
}
