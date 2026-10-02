// pin_send_count:<email>  → PINs sent to an address in the current window
// pin_send_count_ip:<ip>  → PINs requested from an IP in the current window

import { ephemeralKv } from "../namespace";

const SEND_WINDOW_TTL = 3600; // 1 hour

const emailKey = (email: string) => `pin_send_count:${email}`;
const ipKey = (ip: string) => `pin_send_count_ip:${ip}`;

async function findCount(key: string): Promise<number> {
  return parseInt((await ephemeralKv().get(key)) ?? "0", 10);
}

async function putCount(key: string, count: number): Promise<void> {
  await ephemeralKv().put(key, String(count), { expirationTtl: SEND_WINDOW_TTL });
}

export function findByEmail(email: string): Promise<number> {
  return findCount(emailKey(email));
}

export function putForEmail(email: string, count: number): Promise<void> {
  return putCount(emailKey(email), count);
}

export function findByIp(ip: string): Promise<number> {
  return findCount(ipKey(ip));
}

export function putForIp(ip: string, count: number): Promise<void> {
  return putCount(ipKey(ip), count);
}
