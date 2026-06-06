import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P2.2 — opt-in event_outbox idempotency contract ───────────────────────
//
// Migration 252 added an `idempotencyKey` column + a partial unique
// index on (eventName, idempotencyKey) WHERE key IS NOT NULL. P2.1
// already shipped the relay scaffold (commit f9931b22); this commit
// closes the dedupe half so callers that need exactly-once semantics
// can pass `payload.idempotencyKey` and the second emit gets dropped at
// the DB.
//
// Behaviour without an idempotencyKey is UNCHANGED — the column is
// NULLable, the index is partial, the ON CONFLICT only fires when a
// non-null key is supplied.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const MIGRATION = read("artifacts/api-server/src/migrations/252_event_outbox_idempotency_key.sql");
const SCHEMA = read("db/schema_pre.sql");
const EVENT_BUS = read("artifacts/api-server/src/lib/eventBus.ts");
const INDEX_TS = read("artifacts/api-server/src/index.ts");

describe("P2.2 — migration 252 adds idempotencyKey column + partial unique index", () => {
  it("ADD COLUMN IF NOT EXISTS makes the migration safely re-runnable", () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS "idempotencyKey"');
  });

  it("idempotencyKey is NULLable (no NOT NULL constraint on the ADD COLUMN line)", () => {
    // Find the ADD COLUMN statement and assert it doesn't carry a
    // NOT NULL constraint. The migration body legitimately uses
    // `WHERE "idempotencyKey" IS NOT NULL` in the partial-index
    // predicate, so we can't blanket-grep "NOT NULL" — we have to
    // look at the column DDL itself.
    const addColIdx = MIGRATION.indexOf('ADD COLUMN IF NOT EXISTS "idempotencyKey"');
    expect(addColIdx).toBeGreaterThan(-1);
    const endOfStmt = MIGRATION.indexOf(";", addColIdx);
    const stmt = MIGRATION.slice(addColIdx, endOfStmt);
    expect(stmt).not.toContain("NOT NULL");
  });

  it("CREATE UNIQUE INDEX is PARTIAL (WHERE idempotencyKey IS NOT NULL)", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]+event_outbox_idem_uniq[\s\S]+WHERE "idempotencyKey" IS NOT NULL/);
  });

  it("migration is wrapped in BEGIN/COMMIT", () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it("@rollback annotation is present", () => {
    expect(MIGRATION).toContain("@rollback:");
    expect(MIGRATION).toContain('DROP COLUMN "idempotencyKey"');
    expect(MIGRATION).toContain("DROP INDEX IF EXISTS event_outbox_idem_uniq");
  });
});

describe("P2.2 — db/schema_pre.sql carries the new column", () => {
  it("event_outbox CREATE TABLE declares idempotencyKey", () => {
    const idx = SCHEMA.indexOf("CREATE TABLE public.event_outbox");
    expect(idx).toBeGreaterThan(-1);
    const block = SCHEMA.slice(idx, idx + 1000);
    expect(block).toContain('"idempotencyKey"');
  });
});

describe("P2.2 — captureToOutbox reads payload.idempotencyKey + uses ON CONFLICT DO NOTHING", () => {
  it("captureToOutbox INSERT includes the new column", () => {
    const idx = EVENT_BUS.indexOf("function captureToOutbox");
    expect(idx).toBeGreaterThan(-1);
    const block = EVENT_BUS.slice(idx, idx + 3000);
    expect(block).toContain('"idempotencyKey"');
  });

  it("reads payload.idempotencyKey (opt-in, defaults to null)", () => {
    const idx = EVENT_BUS.indexOf("function captureToOutbox");
    const block = EVENT_BUS.slice(idx, idx + 3000);
    expect(block).toContain("payload as { idempotencyKey?: string }");
    expect(block).toContain("?? null");
  });

  it("ON CONFLICT clause matches the partial index predicate", () => {
    const idx = EVENT_BUS.indexOf("function captureToOutbox");
    const block = EVENT_BUS.slice(idx, idx + 3000);
    // The conflict-target must include the same WHERE clause as the
    // partial unique index, otherwise PostgreSQL won't recognise the
    // arbiter and the INSERT fails at runtime.
    expect(block).toContain('ON CONFLICT ("eventName", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL');
    expect(block).toContain("DO NOTHING");
  });

  it("preserves the existing at-least-once contract for null keys", () => {
    // Comment must call this out explicitly so a future reviewer
    // doesn't "fix" the null check thinking it's an oversight.
    const idx = EVENT_BUS.indexOf("function captureToOutbox");
    const block = EVENT_BUS.slice(idx, idx + 3000);
    expect(block).toContain("at-least-once");
  });
});

describe("P2.2 — single-process index.ts also starts the relay", () => {
  // Without this, OUTBOX_RELAY_ACTIVE=true on a single-container deploy
  // would mean the API process inserts events but nothing drains them —
  // events accumulate as pending forever. The relay must run wherever
  // captureToOutbox runs.
  it("index.ts boots startOutboxRelay() when not API_ONLY", () => {
    expect(INDEX_TS).toContain("startOutboxRelay");
  });

  it("index.ts uses a dynamic import so the relay module loads lazily", () => {
    expect(INDEX_TS).toMatch(/import\("\.\/lib\/outboxRelay\.js"\)/);
  });

  it("index.ts graceful shutdown calls stopOutboxRelay() defensively", () => {
    expect(INDEX_TS).toContain("stopOutboxRelay");
    // Defensive: try/catch so a never-started relay doesn't crash
    // shutdown.
    const stopIdx = INDEX_TS.indexOf("stopOutboxRelay");
    const block = INDEX_TS.slice(Math.max(0, stopIdx - 400), stopIdx + 200);
    expect(block).toContain("try");
    expect(block).toContain("catch");
  });
});
