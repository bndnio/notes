export async function lookupUserId(kv: KVNamespace, identifier: string): Promise<string | null> {
  return kv.get(identifier.toLowerCase().trim());
}
