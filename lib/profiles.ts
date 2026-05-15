import type { Profile } from "./types";

export async function lookupProfile(kv: KVNamespace, username: string): Promise<Profile | null> {
  const raw = await kv.get(username);
  if (!raw) return null;
  return JSON.parse(raw) as Profile;
}
