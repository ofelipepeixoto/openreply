import { expect, it } from "vitest";
import { pendingSend } from "@/lib/pending-send";
it("retains an opaque retry key across reconstructed clients without storing text", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const scope = ["account", "recipient", "private synthetic text"];
  const first = await pendingSend(storage, scope);
  expect(await pendingSend({ ...storage }, scope)).toEqual(first);
  expect(JSON.stringify([...values])).not.toContain("private synthetic text");
  expect((await pendingSend(storage, ["other", ...scope])).id).not.toEqual(first.id);
});
