import type { Profile } from "./types";

export async function lookupProfile(kv: KVNamespace, userId: string): Promise<Profile | null> {
  const raw = await kv.get(userId);
  if (!raw) return null;
  return JSON.parse(raw) as Profile;
}

export async function lookupUserId(kv: KVNamespace, identifier: string): Promise<string | null> {
  return kv.get(identifier.toLowerCase().trim());
}
