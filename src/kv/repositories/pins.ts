// pin:<email>          → JSON PinRecord
// pin_attempts:<email> → failed verify count, expires with the PIN

export const PIN_TTL = 600; // 10 minutes

export type PinPayload =
  | { type: "register"; username: string; requireSenderMatch: boolean }
  | { type: "login"; userId: string }
  | { type: "email_add"; userId: string };

export type PinRecord = { pin: string } & PinPayload;

const pinKey = (email: string) => `pin:${email}`;
const attemptsKey = (email: string) => `pin_attempts:${email}`;

export async function put(kv: KVNamespace, email: string, record: PinRecord): Promise<void> {
  await kv.put(pinKey(email), JSON.stringify(record), { expirationTtl: PIN_TTL });
}

export async function find(kv: KVNamespace, email: string): Promise<PinRecord | null> {
  const raw = await kv.get(pinKey(email));
  return raw ? (JSON.parse(raw) as PinRecord) : null;
}

export async function remove(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(pinKey(email));
}

export async function findAttempts(kv: KVNamespace, email: string): Promise<number> {
  return parseInt((await kv.get(attemptsKey(email))) ?? "0", 10);
}

export async function putAttempts(kv: KVNamespace, email: string, attempts: number): Promise<void> {
  await kv.put(attemptsKey(email), String(attempts), { expirationTtl: PIN_TTL });
}

export async function removeAttempts(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(attemptsKey(email));
}
