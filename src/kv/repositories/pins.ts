// pin:<email>          → JSON PinRecord
// pin_attempts:<email> → failed verify count, expires with the PIN

import { ephemeralKv } from "../namespace";

export const PIN_TTL = 600; // 10 minutes

export type PinPayload =
  | { type: "register"; username: string; requireSenderMatch: boolean }
  | { type: "login"; userId: string }
  | { type: "email_add"; userId: string };

export type PinRecord = { pin: string } & PinPayload;

const pinKey = (email: string) => `pin:${email}`;
const attemptsKey = (email: string) => `pin_attempts:${email}`;

export async function put(email: string, record: PinRecord): Promise<void> {
  await ephemeralKv().put(pinKey(email), JSON.stringify(record), { expirationTtl: PIN_TTL });
}

export async function find(email: string): Promise<PinRecord | null> {
  const raw = await ephemeralKv().get(pinKey(email));
  return raw ? (JSON.parse(raw) as PinRecord) : null;
}

export async function remove(email: string): Promise<void> {
  await ephemeralKv().delete(pinKey(email));
}

export async function findAttempts(email: string): Promise<number> {
  return parseInt((await ephemeralKv().get(attemptsKey(email))) ?? "0", 10);
}

export async function putAttempts(email: string, attempts: number): Promise<void> {
  await ephemeralKv().put(attemptsKey(email), String(attempts), { expirationTtl: PIN_TTL });
}

export async function removeAttempts(email: string): Promise<void> {
  await ephemeralKv().delete(attemptsKey(email));
}
