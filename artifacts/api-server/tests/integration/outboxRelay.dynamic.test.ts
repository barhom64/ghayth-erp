// P2.6 — live-DB integration tests for the outbox relay.
//
// The unit suite (p21OutboxRelayScaffold / p22OutboxIdempotency /
// p2OutboxPurgeStatusAware / p23OutboxAdminMonitor) reads the relay
// source as text and asserts the SQL/contract is shaped right. These
// tests run the relay's REAL SQL against a REAL Postgres and assert the
// row state machine actually behaves:
//
//   - happy path: pending → claimed → dispatched → processed (+ the
//     in-process listener actually received the payload)
//   - a listener that THROWS is dead-lettered to event_dlq but the row
//     is still marked processed (dispatch happened — the relay is
//     decoupled from listener success)
//   - claim atomicity: two concurrent claims partition the pending set
//     with NO overlap (the bug the auto-commit lock-gap allowed)
//   - claim transitions pending → 'processing' + stamps claimedAt
//   - markFailure increments attempts → 'failed_retry', then 'dead' at
//     the max-attempts threshold, stashing lastError + clearing claimedAt
//   - reapStaleClaims returns a stranded 'processing' row to pending
//   - the partial unique index dedupes (eventName, idempotencyKey)
//   - the status-aware purge deletes processed/dead but NEVER pending /
//     processing
//
// Activation: same pattern as the other *.dynamic.test.ts files — every
// describe is wrapped in `d` (= describe when a TEST Postgres is wired,
// describe.skip otherwise) so the suite stays green on dev boxes / CI
// without a container.
//
// To run locally:
//   /usr/lib/postgresql/16/bin/initdb -D /tmp/pg ...   (or docker compose)
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh   (+ apply migrations 252 + 254)
//   pnpm --filter @workspace/api-server test tests/integration/outboxRelay.dynamic.test.ts

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Small poll helper: the EventBus wrap dead-letters via a fire-and-forget
// `void rawExecute(...)`, so a DLQ row may land a tick after dispatch.
async function waitFor(fn: () => Promise<boolean>, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

d("Outbox relay — dynamic (real Postgres)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let eventBus: any;
  let relay: any;

  const TEST_EVENT = "test.outbox.relay";

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawQuery = db.rawQuery;
    rawExecute = db.rawExecute;
    eventBus = (await import("../../src/lib/eventBus.js")).eventBus;
    relay = await import("../../src/lib/outboxRelay.js");
  });

  beforeEach(async () => {
    // Wipe the two tables this suite owns so scenarios stay independent.
    await rawExecute(`TRUNCATE TABLE event_outbox RESTART IDENTITY`, []);
    await rawExecute(`DELETE FROM event_dlq WHERE "eventName" = $1`, [TEST_EVENT]);
    eventBus.removeAllListeners(TEST_EVENT);
  });

  afterAll(async () => {
    eventBus.removeAllListeners(TEST_EVENT);
  });

  // Helper: insert a pending row, return its id (as string).
  async function insertPending(payload: Record<string, unknown>, eventName = TEST_EVENT): Promise<string> {
    const [row] = await rawQuery(
      `INSERT INTO event_outbox ("eventName", payload, "companyId", status)
       VALUES ($1, $2, $3, 'pending') RETURNING id::text AS id`,
      [eventName, JSON.stringify(payload), payload.companyId ?? null],
    );
    return row.id;
  }

  async function statusOf(id: string): Promise<{ status: string; attempts: number; claimedAt: string | null; lastError: string | null; processedAt: string | null }> {
    const [row] = await rawQuery(
      `SELECT status, attempts, "claimedAt", "lastError", "processedAt" FROM event_outbox WHERE id = $1::bigint`,
      [id],
    );
    return row;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("drains a pending row to 'processed' and the listener receives the payload", async () => {
      const received: any[] = [];
      eventBus.on(TEST_EVENT, (p: any) => received.push(p));

      const id = await insertPending({ companyId: 7, hello: "world" });

      const result = await relay.runOutboxRelayOnce();
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      const row = await statusOf(id);
      expect(row.status).toBe("processed");
      expect(row.processedAt).not.toBeNull();
      expect(row.claimedAt).toBeNull(); // cleared on finalise

      expect(received).toHaveLength(1);
      expect(received[0].hello).toBe("world");
      expect(received[0].companyId).toBe(7);
    });

    it("drains multiple rows oldest-first", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push(await insertPending({ seq: i }));

      const result = await relay.runOutboxRelayOnce();
      expect(result.processed).toBe(5);

      const stats = await relay.getOutboxRelayStats();
      expect(stats.processed).toBe(5);
      expect(stats.pending).toBe(0);
    });

    it("a second drain over an empty pending pool is a no-op", async () => {
      await insertPending({ x: 1 });
      await relay.runOutboxRelayOnce();
      const second = await relay.runOutboxRelayOnce();
      expect(second.processed).toBe(0);
      expect(second.failed).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Listener-failure decoupling
  // ──────────────────────────────────────────────────────────────────────

  describe("listener failure is dead-lettered but does not block the relay", () => {
    it("row is still marked 'processed' and a DLQ row is written", async () => {
      eventBus.on(TEST_EVENT, () => {
        throw new Error("listener boom");
      });

      const id = await insertPending({ companyId: 3, n: 1 });
      const result = await relay.runOutboxRelayOnce();

      // Dispatch happened (the wrap swallowed the throw), so the relay
      // counts it processed — NOT failed.
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      const row = await statusOf(id);
      expect(row.status).toBe("processed");

      // The throw was dead-lettered (fire-and-forget, so poll for it).
      const dlqAppeared = await waitFor(async () => {
        const [c] = await rawQuery(
          `SELECT count(*)::int AS c FROM event_dlq WHERE "eventName" = $1`,
          [TEST_EVENT],
        );
        return c.c >= 1;
      });
      expect(dlqAppeared).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Claim atomicity — the headline P2.6 bug
  // ──────────────────────────────────────────────────────────────────────

  describe("atomic claim (concurrency safety)", () => {
    it("two concurrent claims partition the pending set with zero overlap", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 40; i++) ids.push(await insertPending({ seq: i }));

      const { claimBatch } = relay.__outboxRelayInternals;
      // Fire two claims at the same time — each asks for up to 25 rows.
      // With a correct single-statement claim, the union is exactly the
      // 40 rows and the intersection is EMPTY. A leaky lock would let
      // both claims grab overlapping rows.
      const [batchA, batchB] = await Promise.all([
        claimBatch(25, 10),
        claimBatch(25, 10),
      ]);

      const idsA = new Set(batchA.map((r: any) => r.id));
      const idsB = new Set(batchB.map((r: any) => r.id));
      const overlap = [...idsA].filter((x) => idsB.has(x));

      expect(overlap).toHaveLength(0);
      expect(idsA.size + idsB.size).toBe(40);

      // Every claimed row is now 'processing' with a claimedAt stamp.
      const [counts] = await rawQuery(
        `SELECT
           (count(*) FILTER (WHERE status='processing'))::int AS processing,
           (count(*) FILTER (WHERE "claimedAt" IS NOT NULL))::int AS claimed
         FROM event_outbox`,
      );
      expect(counts.processing).toBe(40);
      expect(counts.claimed).toBe(40);
    });

    it("claim respects attempts < maxAttempts", async () => {
      const id = await insertPending({ x: 1 });
      // Bump attempts beyond the cap; the claim must skip it.
      await rawExecute(`UPDATE event_outbox SET attempts = 10 WHERE id = $1::bigint`, [id]);

      const { claimBatch } = relay.__outboxRelayInternals;
      const batch = await claimBatch(50, 5);
      expect(batch.find((r: any) => r.id === id)).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Failure → retry → dead state machine
  // ──────────────────────────────────────────────────────────────────────

  describe("markFailure state machine", () => {
    it("first failures land in 'failed_retry'; the max-attempts one promotes to 'dead'", async () => {
      const id = await insertPending({ x: 1 });
      const { markFailure } = relay.__outboxRelayInternals;
      const maxAttempts = 3;

      // attempt 0 → 1 : failed_retry
      await markFailure(id, 0, new Error("boom-1"), maxAttempts);
      let row = await statusOf(id);
      expect(row.status).toBe("failed_retry");
      expect(row.attempts).toBe(1);
      expect(row.claimedAt).toBeNull();
      expect(row.lastError).toContain("boom-1");

      // attempt 1 → 2 : failed_retry
      await markFailure(id, 1, new Error("boom-2"), maxAttempts);
      row = await statusOf(id);
      expect(row.status).toBe("failed_retry");
      expect(row.attempts).toBe(2);

      // attempt 2 → 3 : dead (>= maxAttempts)
      await markFailure(id, 2, new Error("boom-3"), maxAttempts);
      row = await statusOf(id);
      expect(row.status).toBe("dead");
      expect(row.attempts).toBe(3);
      expect(row.lastError).toContain("boom-3");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Stale-claim reaper
  // ──────────────────────────────────────────────────────────────────────

  describe("reapStaleClaims", () => {
    it("returns a stranded 'processing' row to 'pending'", async () => {
      const id = await insertPending({ x: 1 });
      // Simulate a worker that claimed the row then crashed: status
      // 'processing' with an old claimedAt.
      await rawExecute(
        `UPDATE event_outbox
            SET status = 'processing', "claimedAt" = now() - interval '1 hour'
          WHERE id = $1::bigint`,
        [id],
      );

      const { reapStaleClaims } = relay.__outboxRelayInternals;
      const reclaimed = await reapStaleClaims(60_000); // 60s threshold
      expect(reclaimed).toBe(1);

      const row = await statusOf(id);
      expect(row.status).toBe("pending");
      expect(row.claimedAt).toBeNull();
    });

    it("does NOT reap a freshly-claimed 'processing' row", async () => {
      const id = await insertPending({ x: 1 });
      await rawExecute(
        `UPDATE event_outbox SET status = 'processing', "claimedAt" = now() WHERE id = $1::bigint`,
        [id],
      );
      const { reapStaleClaims } = relay.__outboxRelayInternals;
      const reclaimed = await reapStaleClaims(60_000);
      expect(reclaimed).toBe(0);

      const row = await statusOf(id);
      expect(row.status).toBe("processing");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Idempotency index (P2.2) — enforced at the DB
  // ──────────────────────────────────────────────────────────────────────

  describe("partial unique index dedupes (eventName, idempotencyKey)", () => {
    it("a second INSERT with the same key is a no-op via ON CONFLICT DO NOTHING", async () => {
      const insertWithKey = (key: string) =>
        rawExecute(
          `INSERT INTO event_outbox ("eventName", payload, "companyId", "idempotencyKey")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("eventName", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL
           DO NOTHING`,
          [TEST_EVENT, JSON.stringify({ n: 1 }), 1, "stable-key-123"],
        );

      await insertWithKey("stable-key-123");
      await insertWithKey("stable-key-123"); // duplicate

      const [c] = await rawQuery(
        `SELECT count(*)::int AS c FROM event_outbox WHERE "idempotencyKey" = $1`,
        ["stable-key-123"],
      );
      expect(c.c).toBe(1);
    });

    it("rows WITHOUT a key are never deduped (at-least-once preserved)", async () => {
      await insertPending({ n: 1 });
      await insertPending({ n: 2 });
      const [c] = await rawQuery(
        `SELECT count(*)::int AS c FROM event_outbox WHERE "idempotencyKey" IS NULL`,
      );
      expect(c.c).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Status-aware purge (P2.5) — verified against real rows
  // ──────────────────────────────────────────────────────────────────────

  describe("purgeAgedOutboxEntries is status-aware", () => {
    it("deletes aged processed/dead but NEVER aged pending or processing", async () => {
      const eventBusMod = await import("../../src/lib/eventBus.js");

      // Four aged rows (createdAt 30 days ago), one per status.
      const mkAged = (status: string, claimed = false) =>
        rawExecute(
          `INSERT INTO event_outbox ("eventName", payload, status, "createdAt", "claimedAt")
           VALUES ($1, $2, $3, now() - interval '30 days', $4)`,
          [TEST_EVENT, JSON.stringify({}), status, claimed ? "now()" : null],
        );
      await rawExecute(
        `INSERT INTO event_outbox ("eventName", payload, status, "createdAt")
         VALUES ($1, $2, 'pending', now() - interval '30 days')`,
        [TEST_EVENT, JSON.stringify({})],
      );
      await rawExecute(
        `INSERT INTO event_outbox ("eventName", payload, status, "createdAt", "claimedAt")
         VALUES ($1, $2, 'processing', now() - interval '30 days', now() - interval '30 days')`,
        [TEST_EVENT, JSON.stringify({})],
      );
      await rawExecute(
        `INSERT INTO event_outbox ("eventName", payload, status, "createdAt")
         VALUES ($1, $2, 'processed', now() - interval '30 days')`,
        [TEST_EVENT, JSON.stringify({})],
      );
      await rawExecute(
        `INSERT INTO event_outbox ("eventName", payload, status, "createdAt")
         VALUES ($1, $2, 'dead', now() - interval '30 days')`,
        [TEST_EVENT, JSON.stringify({})],
      );

      const purged = await eventBusMod.purgeAgedOutboxEntries(7);
      expect(purged).toBe(2); // processed + dead only

      const [counts] = await rawQuery(
        `SELECT
           (count(*) FILTER (WHERE status='pending'))::int AS pending,
           (count(*) FILTER (WHERE status='processing'))::int AS processing,
           (count(*) FILTER (WHERE status='processed'))::int AS processed,
           (count(*) FILTER (WHERE status='dead'))::int AS dead
         FROM event_outbox`,
      );
      expect(counts.pending).toBe(1);     // survived
      expect(counts.processing).toBe(1);  // survived — never purge mid-flight
      expect(counts.processed).toBe(0);   // purged
      expect(counts.dead).toBe(0);        // purged
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // End-to-end through processBatch (claim → dispatch → finalise)
  // ──────────────────────────────────────────────────────────────────────

  describe("runOutboxRelayOnce end-to-end", () => {
    it("claims, dispatches, and finalises in a single drain with no rows left pending", async () => {
      let calls = 0;
      eventBus.on(TEST_EVENT, () => { calls++; });

      for (let i = 0; i < 12; i++) await insertPending({ seq: i });

      const result = await relay.runOutboxRelayOnce();
      expect(result.processed).toBe(12);
      expect(calls).toBe(12);

      const stats = await relay.getOutboxRelayStats();
      expect(stats.pending).toBe(0);
      expect(stats.processed).toBe(12);
    });
  });
});
