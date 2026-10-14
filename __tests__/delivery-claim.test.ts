import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { postbackDelivery: { create: m.create, delete: m.remove } } }));
import { sendClaimedOnce } from "@/lib/queue/delivery-claim";
import { TokenExpiredError } from "@/lib/meta/client";
beforeEach(() => {
  vi.resetAllMocks();
  const claims = new Set<string>();
  m.create.mockImplementation(async ({ data }) => {
    if (claims.has(data.id)) throw { code: "P2002" };
    claims.add(data.id);
  });
  m.remove.mockImplementation(async ({ where }) => { claims.delete(where.id); });
});
it("admits one sender across concurrent workers and later replay", async () => {
  const send = vi.fn(async () => {});
  const input = { operationId: "same-event", send };
  expect((await Promise.all([sendClaimedOnce(input), sendClaimedOnce(input)])).sort()).toEqual([false, true]);
  expect(await sendClaimedOnce(input)).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});
it("does not send when the durable claim store fails", async () => {
  m.create.mockRejectedValue(new Error("storage unavailable"));
  const send = vi.fn();
  await expect(sendClaimedOnce({ operationId: "failed", send })).rejects.toThrow("storage unavailable");
  expect(send).not.toHaveBeenCalled();
});
it("retains UNKNOWN after a timeout or crash boundary; another worker cannot resend", async () => {
  const send = vi.fn(async () => { throw new Error("connection lost after provider accepted"); });
  await expect(sendClaimedOnce({ operationId: "unknown", send })).rejects.toThrow("unconfirmed");
  expect(await sendClaimedOnce({ operationId: "unknown", send })).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
  expect(m.remove).not.toHaveBeenCalled();
});
it("permits retry only after explicit rejection", async () => {
  const send = vi.fn().mockRejectedValueOnce(new TokenExpiredError("synthetic token expired")).mockResolvedValueOnce({});
  await expect(sendClaimedOnce({ operationId: "rejected", send })).rejects.toBeInstanceOf(TokenExpiredError);
  expect(await sendClaimedOnce({ operationId: "rejected", send })).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});
it("fails closed if rejection cleanup cannot persist", async () => {
  m.remove.mockRejectedValue(new Error("delete unavailable"));
  const send = vi.fn().mockRejectedValue(new TokenExpiredError("synthetic token expired"));
  await expect(sendClaimedOnce({ operationId: "cleanup", send })).rejects.toThrow("delete unavailable");
  expect(await sendClaimedOnce({ operationId: "cleanup", send })).toBe(false);
});
it("suppresses replay after a crash between claim commit and provider invocation", async () => {
  await m.create({ data: { id: "crash-before-send" } });
  const send = vi.fn();
  expect(await sendClaimedOnce({ operationId: "crash-before-send", send })).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
