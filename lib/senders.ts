export async function lookupUsername(kv: KVNamespace, email: string): Promise<string | null> {
  return kv.get(email.toLowerCase().trim());
}
