import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ workspace: "workspace-a" as string | null, create: vi.fn(), remove: vi.fn(), send: vi.fn(), account: vi.fn(), reserve: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => m.workspace }));
vi.mock("@/lib/instagram-accounts", () => ({ getWorkspaceInstagramAccount: m.account }));
vi.mock("@/lib/db/client", () => ({ prisma: { postbackDelivery: { create: m.create, delete: m.remove } } }));
vi.mock("@/lib/instagram/provider", () => ({ getConversations: vi.fn(), MetaApiError: class extends Error {}, createInstagramContext: async () => ({}), sendDirectMessage: m.send }));
vi.mock("@/lib/billing/usage", () => ({ reserveWorkspaceDMSend: m.reserve, releaseWorkspaceDMReservation: m.release }));
import { POST } from "@/app/api/instagram/conversations/route";
const request = (key = "synthetic-request-123", text = "hello") => new NextRequest("http://localhost/api/instagram/conversations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ recipientId: "recipient-a", text }) });
beforeEach(() => {
  vi.resetAllMocks(); m.workspace = "workspace-a";
  m.account.mockResolvedValue({ id: "account-a", instagramId: "ig-a" });
  m.reserve.mockResolvedValue({ allowed: true, reserved: true, periodStart: new Date(0) });
  m.send.mockResolvedValue({ id: "synthetic-message" });
  const claims = new Set<string>();
  m.create.mockImplementation(async ({ data }) => { if (claims.has(data.id)) throw { code: "P2002" }; claims.add(data.id); });
});
it("requires auth and a valid operation key before sending", async () => {
  m.workspace = null; expect((await POST(request())).status).toBe(401);
  m.workspace = "workspace-a"; expect((await POST(request(""))).status).toBe(400);
  expect(m.send).not.toHaveBeenCalled();
});
it("deduplicates concurrent sends and replay with changed content under the same key", async () => {
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect(responses.map(x => x.status).sort()).toEqual([200, 409]);
  expect((await POST(request(undefined, "changed content"))).status).toBe(409);
  expect(m.send).toHaveBeenCalledTimes(1);
});
it("retains UNKNOWN and quota after a lost provider response", async () => {
  m.send.mockRejectedValue(new Error("timeout"));
  const response = await POST(request());
  expect(response.status).toBe(409); expect((await response.json()).outcome).toBe("UNKNOWN");
  expect(m.release).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(409);
  expect(m.send).toHaveBeenCalledTimes(1);
});
it("does not send when storage fails or the account is outside the workspace", async () => {
  m.create.mockRejectedValue(new Error("storage unavailable"));
  expect((await POST(request())).status).toBe(502);
  expect(m.release).toHaveBeenCalledTimes(1);
  m.account.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(400);
  expect(m.send).not.toHaveBeenCalled();
});
it("scopes the same request key to its authenticated workspace", async () => {
  expect((await POST(request())).status).toBe(200);
  m.workspace = "workspace-b";
  expect((await POST(request())).status).toBe(200);
  expect(m.send).toHaveBeenCalledTimes(2);
});
