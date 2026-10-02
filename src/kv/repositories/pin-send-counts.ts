// pin_send_count:<email>  → PINs sent to an address in the current window
// pin_send_count_ip:<ip>  → PINs requested from an IP in the current window

const SEND_WINDOW_TTL = 3600; // 1 hour

const emailKey = (email: string) => `pin_send_count:${email}`;
const ipKey = (ip: string) => `pin_send_count_ip:${ip}`;

async function findCount(kv: KVNamespace, key: string): Promise<number> {
  return parseInt((await kv.get(key)) ?? "0", 10);
}

async function putCount(kv: KVNamespace, key: string, count: number): Promise<void> {
  await kv.put(key, String(count), { expirationTtl: SEND_WINDOW_TTL });
}

export function findByEmail(kv: KVNamespace, email: string): Promise<number> {
  return findCount(kv, emailKey(email));
}

export function putForEmail(kv: KVNamespace, email: string, count: number): Promise<void> {
  return putCount(kv, emailKey(email), count);
}

export function findByIp(kv: KVNamespace, ip: string): Promise<number> {
  return findCount(kv, ipKey(ip));
}

export function putForIp(kv: KVNamespace, ip: string, count: number): Promise<void> {
  return putCount(kv, ipKey(ip), count);
}
