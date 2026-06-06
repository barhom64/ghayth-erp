import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P2 quick-win — outbox purge must be status-aware ──────────────────────
//
// The senior architectural review's finding #3: purgeAgedOutboxEntries
// deletes by age WITHOUT filtering on status. Today (phase 1, in-process
// emitter) this is fine because every row is effectively a write-once
// log entry — by the time it's "aged" the in-process listeners have
// already fired. But when phase-3 (the outbox relay) lands, a 'pending'
// row genuinely represents an undelivered event — purging by age would
// silently drop business events (orders, invoices, audit logs).
//
// This is the cheap half of P2: making the filter status-aware NOW so
// the relay can be flipped on later with a one-line env-flag toggle
// instead of having to remember to also fix the purge in the same PR.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const EVENT_BUS = read("artifacts/api-server/src/lib/eventBus.ts");

describe("P2 — purgeAgedOutboxEntries is status-aware", () => {
  it("DELETE filters on status IN ('processed', 'dead')", () => {
    // Find the purge function then check the SQL it emits.
    const idx = EVENT_BUS.indexOf("export async function purgeAgedOutboxEntries");
    expect(idx).toBeGreaterThan(-1);
    const block = EVENT_BUS.slice(idx, idx + 1500);
    expect(block).toMatch(/DELETE FROM event_outbox/);
    expect(block).toMatch(/status IN \('processed', 'dead'\)/);
  });

  it("does NOT delete rows with status = 'pending'", () => {
    // Even on aged rows. The status whitelist is processed + dead;
    // 'pending' is implicitly excluded.
    const idx = EVENT_BUS.indexOf("export async function purgeAgedOutboxEntries");
    const block = EVENT_BUS.slice(idx, idx + 1500);
    // Exactly one DELETE in the function (single SQL statement). The
    // SQL is multi-line so we just count the `DELETE FROM event_outbox`
    // prefix.
    const matches = block.match(/DELETE FROM event_outbox/g) ?? [];
    expect(matches.length).toBe(1);
    // And it has the AND status clause.
    expect(block).toMatch(/AND status IN/);
    // And the status whitelist excludes 'pending'.
    expect(block).not.toMatch(/'pending'/);
  });

  it("retains the age-based predicate (purge IS still age-bound)", () => {
    const idx = EVENT_BUS.indexOf("export async function purgeAgedOutboxEntries");
    const block = EVENT_BUS.slice(idx, idx + 1500);
    expect(block).toContain("make_interval(days => $1)");
  });

  it("function comment explicitly calls out the phase-3 relay path", () => {
    // Keeps the explanation visible for the next reviewer.
    const commentIdx = EVENT_BUS.indexOf("STATUS-AWARE");
    expect(commentIdx).toBeGreaterThan(-1);
    const block = EVENT_BUS.slice(commentIdx, commentIdx + 1500);
    expect(block).toContain("relay");
    expect(block).toContain("'pending'");
  });
});
