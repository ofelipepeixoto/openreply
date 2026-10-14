import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  workspace: 'tenant-a' as string | null,
  attach: vi.fn(async () => ({ attached: 0 })),
  dm: vi.fn(async () => []), events: vi.fn(async () => []), webhooks: vi.fn(async () => []),
  counts: vi.fn(async () => ({ waiting: 3 })),
  health: vi.fn(async () => ({ healthy: true, heartbeat: { hostname: 'internal-host' } })),
  alerts: vi.fn(async () => [{ instagramAccountId: 'tenant-b-account', commentId: 'private-comment', message: 'tenant-b-error' }]),
}));
vi.mock('@/lib/auth', () => ({ getCurrentWorkspaceId: async () => m.workspace, getCurrentUserId: async () => "user-a" }));
vi.mock('@/lib/db/client', () => ({ prisma: { dmLog: { findMany: m.dm }, operationalEvent: { findMany: m.events }, webhookEvent: { findMany: m.webhooks } } }));
vi.mock('@/lib/queue/client', () => ({ getDMQueue: () => ({ getJobCounts: m.counts }) }));
vi.mock('@/lib/ops/worker-health', () => ({ getWorkerHealth: m.health, getWorkerAlerts: m.alerts }));
vi.mock('@/lib/automation/attach-next-reel', () => ({ attachPendingNextReels: m.attach }));
import { GET as cron } from '../app/api/cron/attach-next-reel/route';
import { GET as diagnostics } from '../app/api/admin/diagnostics/route';
beforeEach(() => { vi.clearAllMocks(); m.workspace = 'tenant-a'; vi.stubEnv('OPENREPLY_OPERATOR_USER_IDS', ''); });
afterEach(() => vi.unstubAllEnvs());
it('rejects cron with both secrets absent before any work', async () => {
  vi.stubEnv('CRON_SECRET', undefined); vi.stubEnv('NEXTAUTH_SECRET', undefined);
  const response = await cron(new Request('http://localhost/api/cron/attach-next-reel', { headers: { authorization: 'Bearer undefined' } }) as Parameters<typeof cron>[0]);
  expect(response.status).toBe(401); expect(m.attach).not.toHaveBeenCalled();
});
it('accepts the explicitly configured cron secret', async () => {
  vi.stubEnv('CRON_SECRET', 'audit-cron');
  const response = await cron(new Request('http://localhost/api/cron/attach-next-reel', { headers: { authorization: 'Bearer audit-cron' } }) as Parameters<typeof cron>[0]);
  expect(response.status).toBe(200); expect(m.attach).toHaveBeenCalledTimes(1);
});
it('does not disclose global worker details to a tenant session', async () => {
  const response = await diagnostics(); const body = JSON.stringify(await response.json());
  expect(response.status).toBe(403);
  expect(body).not.toContain('tenant-b-account'); expect(body).not.toContain('internal-host');
  expect(m.alerts).not.toHaveBeenCalled(); expect(m.health).not.toHaveBeenCalled();
  expect(m.events).not.toHaveBeenCalled();
});
it('rejects unauthenticated diagnostics before database work', async () => {
  m.workspace = null; const response = await diagnostics();
  expect(response.status).toBe(401); expect(m.dm).not.toHaveBeenCalled();
});

it('allows an explicitly configured deployment operator', async () => {
  vi.stubEnv('OPENREPLY_OPERATOR_USER_IDS', 'user-a');
  const response = await diagnostics(); expect(response.status).toBe(200);
  expect(m.alerts).toHaveBeenCalledTimes(1);
});
