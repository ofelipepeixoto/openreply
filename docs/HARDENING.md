# Hardening batches — 2026-10-14

Based on diwenne/openreply dca8713249f979fda8d677a272ffb724ee205b93.
This fork preserves upstream history and the MIT attribution to Anish Raj and
Diwen Huang. Original authorship is not claimed by the fork maintainer.

## Batch 1: access and delivery

Cron handlers reject requests when neither supported secret exists. Global
worker diagnostics now require an explicit authenticated operator user ID in
`OPENREPLY_OPERATOR_USER_IDS` (comma-separated); ordinary workspace membership
is insufficient. No deployment configuration is changed by this patch. The
diagnostics screen shows an operator-only message for ordinary users.
Invalid-signature webhook logs no longer include a body preview.

Inbound keyword replies reuse the existing DmLog atomic claim before sending.
The existing `dmDeliveryUnconfirmed=true` flag represents UNKNOWN: it is set
before a network side effect and blocks automatic replay after a crash, timeout,
or result-write failure. Only confirmed provider rejection permits retry and
releases the usage reservation. Successful persistence clears the flag. The
claim bounds attempts using the existing three-attempt policy. Concurrent losers
release only their own reservation. This deliberately favors no duplicate send
over guaranteed delivery: a crash between claiming and sending can leave an
unsent UNKNOWN. Operators must reconcile with provider evidence, never blindly
clear claims. No database migration or production database access is included.

Scope remaining: manual conversation sends and appreciation follow-ups still
need the same durable delivery policy. This is not an exactly-once guarantee.
DB atomicity is based on the existing conditional update, not demonstrated by
mock tests; a real isolated PostgreSQL concurrency test remains a release gate.

## Batch 2: dependencies

Targeted compatible updates are recorded in package.json and package-lock.json.
No `audit fix --force`, lifecycle bypass of integrity checks, or provider calls.
Prisma and nodemailer major upgrades require separate compatibility review;
remaining audit advisories are not evidence of a proven exploit. Do not deploy
until dependency triage and reproducible build checks are complete.

## Batch 3: integration boundary (proposal only)

Existing governance and portal projects were rechecked at their current heads.
Reuse their proposal/version/hash and human approval boundaries. Do not copy a
second governance engine into OpenReply. A future offline adapter should accept
only a tenant-scoped delivery proposal containing an opaque recipient reference,
a template identifier, an idempotency key, and a content hash. It should emit a
proposal for the existing approval service, with no provider credentials or
transport. Receipt of an approval must be authenticated and bound to the exact
proposal hash before execution; an arbitrary boolean is not authorization.
No adapter is connected to Hub, Portal, customer accounts or a live dispatcher.

## Release gates

1. Install/generate/typecheck/lint/test/build at the proposed commit.
2. Isolated PostgreSQL + Redis crash/concurrency tests, including failure after
   send and before persistence; no live messages.
3. Cover manual and follow-up paths, request size limits and provider timeouts.
4. Resolve reachable critical/high advisories and document exceptions by path.
5. Separately authorized staging with synthetic accounts, reconciliation UI,
   operator audit trail, alerts and rollback drill before production approval.

Local tests are synthetic and transport-blocked. Existing tests being present
or remote upstream CI being green does not prove this branch passes CI.

## Executed validation

With Next/eslint-config-next 16.3.8, next-auth 5.0.0-beta.32,
@auth/prisma-adapter 2.11.3 and Vitest 4.1.11:

- `npm ci --ignore-scripts`: passed; no lifecycle scripts executed.
- `npm test`: 323 tests passed in 26 files; three suites could not import the
  generated Prisma client. This is a failing full-suite result, not a green run.
- `npm run lint`: exit 0, one existing navigation warning.
- Prisma generation: failed fetching engine checksum with HTTP 403. No checksum
  bypass used. Typecheck and build therefore remain blocked/unverified.
- `npm audit --json`: 24 entries (0 critical, 18 high, 4 moderate, 2 low), versus
  baseline 32 (4 critical, 20 high, 6 moderate, 2 low). Counts are advisory nodes,
  not confirmed reachable exploits. Nodemailer/Prisma transitive findings remain.
- Synthetic new tests cover missing cron secret, diagnostic access boundaries,
  durable inbound claim failure, replay after persistence loss, and concurrency.

The test process used dummy local service URLs and blocked Node transports;
no PostgreSQL, Redis, SMTP or provider round trip was executed. Local test logs
are retained separately and are not part of this public fork.
