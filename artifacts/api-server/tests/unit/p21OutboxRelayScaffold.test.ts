import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P2.1 + P2.4 — outbox relay scaffold + feature flag contract ──────────
//
// P2.5 already shipped the status-aware purge so the relay can be flipped
// on later without losing pending rows. This commit lands the relay
// itself (lib/outboxRelay.ts) + the OUTBOX_RELAY_ACTIVE flag (default
// off) + the worker-side wiring + a /outbox-stats observability endpoint.
//
// Default behaviour does NOT change: the flag is off, the relay does
// nothing, the in-process emit chain remains the sole dispatcher. The
// scaffold gives staging a way to test the SELECT/UPDATE/backoff loop
// before P2.2 (dedupe) makes it safe to flip on in production.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const RELAY = read("artifacts/api-server/src/lib/outboxRelay.ts");
const EVENT_BUS = read("artifacts/api-server/src/lib/eventBus.ts");
const CONFIG = read("artifacts/api-server/src/lib/config.ts");
const WORKER = read("artifacts/api-server/src/worker.ts");

describe("P2.4 — OUTBOX_RELAY_* config flags exist with safe defaults", () => {
  it("config schema declares OUTBOX_RELAY_ACTIVE with boolEnv default false", () => {
    expect(CONFIG).toContain("OUTBOX_RELAY_ACTIVE: boolEnv(false)");
  });

  it("config schema declares OUTBOX_RELAY_INTERVAL_MS with default 5000", () => {
    expect(CONFIG).toContain("OUTBOX_RELAY_INTERVAL_MS");
    expect(CONFIG).toMatch(/OUTBOX_RELAY_INTERVAL_MS[\s\S]{0,200}\.default\(5_000\)/);
  });

  it("config schema declares OUTBOX_RELAY_BATCH_SIZE with default 50", () => {
    expect(CONFIG).toContain("OUTBOX_RELAY_BATCH_SIZE");
    expect(CONFIG).toMatch(/OUTBOX_RELAY_BATCH_SIZE[\s\S]{0,200}\.default\(50\)/);
  });

  it("config schema declares OUTBOX_RELAY_MAX_ATTEMPTS with default 5", () => {
    expect(CONFIG).toContain("OUTBOX_RELAY_MAX_ATTEMPTS");
    expect(CONFIG).toMatch(/OUTBOX_RELAY_MAX_ATTEMPTS[\s\S]{0,200}\.default\(5\)/);
  });

  it("AppConfig type carries the four relay properties", () => {
    expect(CONFIG).toMatch(/readonly outboxRelayActive:\s*boolean/);
    expect(CONFIG).toMatch(/readonly outboxRelayIntervalMs:\s*number/);
    expect(CONFIG).toMatch(/readonly outboxRelayBatchSize:\s*number/);
    expect(CONFIG).toMatch(/readonly outboxRelayMaxAttempts:\s*number/);
  });

  it("config builder wires env values into the four fields", () => {
    expect(CONFIG).toContain("outboxRelayActive: env.OUTBOX_RELAY_ACTIVE");
    expect(CONFIG).toContain("outboxRelayIntervalMs: env.OUTBOX_RELAY_INTERVAL_MS");
    expect(CONFIG).toContain("outboxRelayBatchSize: env.OUTBOX_RELAY_BATCH_SIZE");
    expect(CONFIG).toContain("outboxRelayMaxAttempts: env.OUTBOX_RELAY_MAX_ATTEMPTS");
  });
});

describe("P2.1 — eventBus.dispatchFromOutbox bypasses the outbox capture", () => {
  it("EventBus exposes dispatchFromOutbox as a public method", () => {
    // The relay needs a way to call super.emit (in-process listeners)
    // WITHOUT triggering captureToOutbox — otherwise replaying a stored
    // row would re-INSERT it and the relay would never drain.
    expect(EVENT_BUS).toMatch(/dispatchFromOutbox\s*\(\s*event:\s*EventName/);
  });

  it("dispatchFromOutbox calls super.emit and NOT captureToOutbox", () => {
    const idx = EVENT_BUS.indexOf("dispatchFromOutbox");
    expect(idx).toBeGreaterThan(-1);
    const body = EVENT_BUS.slice(idx, idx + 800);
    expect(body).toContain("super.emit");
    // The single-line body should NOT mention captureToOutbox.
    const bodyEnd = body.indexOf("}");
    expect(bodyEnd).toBeGreaterThan(-1);
    expect(body.slice(0, bodyEnd)).not.toContain("captureToOutbox");
  });
});

describe("P2.1 — outboxRelay.ts exports start / stop / stats", () => {
  it("exports startOutboxRelay()", () => {
    expect(RELAY).toMatch(/export\s+function\s+startOutboxRelay\s*\(\s*\)/);
  });

  it("exports stopOutboxRelay()", () => {
    expect(RELAY).toMatch(/export\s+function\s+stopOutboxRelay\s*\(\s*\)/);
  });

  it("exports getOutboxRelayStats() that returns counts by status", () => {
    expect(RELAY).toMatch(/export\s+async\s+function\s+getOutboxRelayStats/);
    expect(RELAY).toContain('FILTER (WHERE status = \'pending\')');
    expect(RELAY).toContain('FILTER (WHERE status = \'failed_retry\')');
    expect(RELAY).toContain('FILTER (WHERE status = \'processed\')');
    expect(RELAY).toContain('FILTER (WHERE status = \'dead\')');
  });

  it("startOutboxRelay is a no-op when config.outboxRelayActive is false", () => {
    // The early return on `!config.outboxRelayActive` keeps the
    // default behaviour identical to before P2.1 landed.
    expect(RELAY).toContain("if (!config.outboxRelayActive)");
    expect(RELAY).toContain("relay NOT starting (default behaviour)");
  });

  it("startOutboxRelay is also a no-op under the test runner", () => {
    expect(RELAY).toContain("if (config.isTest)");
  });

  it("uses FOR UPDATE SKIP LOCKED so concurrent workers don't dispatch the same row", () => {
    expect(RELAY).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("P2.6 — claims atomically (UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING)", () => {
    // Regression guard for the auto-commit lock-gap bug: the claim must
    // be a SINGLE statement that flips pending → 'processing' so the row
    // lock genuinely spans the state change. A two-statement
    // SELECT-then-UPDATE releases the lock between them and double-
    // dispatches across replicas.
    expect(RELAY).toMatch(/UPDATE event_outbox[\s\S]{0,200}SET status = 'processing'/);
    expect(RELAY).toMatch(/WHERE id IN \([\s\S]{0,300}FOR UPDATE SKIP LOCKED[\s\S]{0,40}\)\s*RETURNING/);
  });

  it("P2.6 — reaps stale 'processing' claims back to pending", () => {
    expect(RELAY).toContain("reapStaleClaims");
    expect(RELAY).toMatch(/status = 'processing'[\s\S]{0,200}"claimedAt" < now\(\)/);
    expect(RELAY).toContain("STALE_CLAIM_MS");
  });

  it("P2.6 — exports runOutboxRelayOnce() for ops drain + deterministic tests", () => {
    expect(RELAY).toMatch(/export\s+async\s+function\s+runOutboxRelayOnce/);
  });

  it("P2.6 — exposes internal helpers for the live-DB integration suite", () => {
    expect(RELAY).toContain("export const __outboxRelayInternals");
    expect(RELAY).toMatch(/claimBatch[\s\S]{0,120}reapStaleClaims[\s\S]{0,120}markProcessed[\s\S]{0,120}markFailure/);
  });

  it("respects config.outboxRelayMaxAttempts via SQL filter + dead promotion", () => {
    expect(RELAY).toContain("attempts < $1");
    expect(RELAY).toContain('status = $1'); // markFailure UPDATE
    expect(RELAY).toContain('"dead"');
    expect(RELAY).toContain("promoted to dead after max attempts");
  });

  it("dispatchFromOutbox is what the relay actually calls (NOT regular emit)", () => {
    // Regression guard — if a future refactor switches the call back to
    // eventBus.emit, every replay would re-INSERT and the relay would
    // never drain.
    expect(RELAY).toContain("eventBus.dispatchFromOutbox");
    expect(RELAY).not.toMatch(/eventBus\.emit\s*\(/);
  });

  it("logs a loud warning when the relay starts (because double-dispatch is still possible)", () => {
    expect(RELAY).toContain("STARTING");
    expect(RELAY).toContain("WILL double-dispatch");
  });

  it("setInterval is bounded by inFlight guard so slow ticks don't overlap", () => {
    expect(RELAY).toContain("let inFlight");
    expect(RELAY).toContain("if (inFlight) return");
  });
});

describe("P2.1 — worker.ts wires the relay + exposes /outbox-stats", () => {
  it("worker imports startOutboxRelay + stopOutboxRelay + getOutboxRelayStats", () => {
    expect(WORKER).toContain("startOutboxRelay");
    expect(WORKER).toContain("stopOutboxRelay");
    expect(WORKER).toContain("getOutboxRelayStats");
  });

  it("worker boot calls startOutboxRelay()", () => {
    expect(WORKER).toMatch(/startOutboxRelay\s*\(\s*\)/);
  });

  it("worker shutdown calls stopOutboxRelay() BEFORE stopping the cron scheduler", () => {
    // Stop the relay first so an in-flight tick doesn't try to log
    // through pino after the worker has started tearing it down.
    const stopRelayIdx = WORKER.indexOf("stopOutboxRelay()");
    const stopCronIdx = WORKER.indexOf("stopCronScheduler()");
    expect(stopRelayIdx).toBeGreaterThan(-1);
    expect(stopCronIdx).toBeGreaterThan(-1);
    expect(stopRelayIdx).toBeLessThan(stopCronIdx);
  });

  it("worker exposes /outbox-stats endpoint", () => {
    expect(WORKER).toContain('"/outbox-stats"');
    expect(WORKER).toContain("getOutboxRelayStats()");
  });
});
