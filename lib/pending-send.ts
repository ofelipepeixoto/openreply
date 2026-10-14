// Persist only a digest and opaque ID, never message text. Retaining the ID
// after a lost response lets a page reload retry the same server-side claim.
export async function pendingSend(storage: Pick<Storage, "getItem" | "setItem">, scope: string[]): Promise<{ storageKey: string; id: string }> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(scope)));
  const storageKey = "openreply:pending:" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = storage.getItem(storageKey) ?? crypto.randomUUID();
  storage.setItem(storageKey, id);
  return { storageKey, id };
}
