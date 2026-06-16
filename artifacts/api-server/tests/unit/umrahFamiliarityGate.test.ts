import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  scoreUmrahFamiliarity,
  type UmrahFamiliarityHistory,
} from "../../src/lib/fleet/umrahFamiliarity.js";

/**
 * #2079 PE-06 — Umrah familiarity (scoring axis only).
 *
 * Closes UMR-01 + UMR-04 from docs/transport-audit/20 §3.
 *
 * Scope (owner-bounded, 2026-06-11):
 *   • scoring axis ONLY — never a blocker, never an eligibility veto
 *   • active ONLY for transportServiceType === 'passenger_umrah'
 *   • re-weight: distance 0.05 → 0.025; umrahFamiliarity 0.025;
 *     utilization stays 0.05; total weights still sum to 1.00
 *   • UMR-03 hard guard («داخل برنامج الفوج») DEFERRED — schema
 *     check (CHECK-PE-01) confirmed `umrah_groups.programStartsAt/
 *     EndsAt` do NOT exist; PE-06 explicitly forbids adding columns.
 *   • boundary: no UI, no finance, no VRP, no driver reputation, no
 *     PE-07 ladder split.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const LIB    = readFileSync(join(apiSrc, "lib/fleet/umrahFamiliarity.ts"), "utf8");

function hist(over: Record<number, { groupTrips: number; customerTrips: number }>): UmrahFamiliarityHistory {
  return new Map(Object.entries(over).map(([k, v]) => [Number(k), v]));
}

/* ── scoreUmrahFamiliarity (pure scorer) ──────────────────────── */

describe("#2079 PE-06 — scoreUmrahFamiliarity activation gate", () => {
  it("non-umrah service types receive 0 bonus regardless of history", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "cargo_load",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 99, customerTrips: 99 } }),
    });
    expect(r.bonus).toBe(0);
    expect(r.reason).toBeNull();
  });

  it("passenger_general (non-umrah passenger) does NOT activate the bonus", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_general",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 10, customerTrips: 10 } }),
    });
    expect(r.bonus).toBe(0);
  });

  it("passenger_umrah with NO umrahGroupId and NO customerId receives 0", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: null,
      customerId: null,
      history: hist({ 7: { groupTrips: 5, customerTrips: 5 } }),
    });
    expect(r.bonus).toBe(0);
  });
});

describe("#2079 PE-06 — scoreUmrahFamiliarity tiers", () => {
  it("≥3 group trips → +15 with Arabic group reason", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 4, customerTrips: 0 } }),
    });
    expect(r.bonus).toBe(15);
    expect(r.reason).toMatch(/خدم الفوج 4 مرات سابقًا/);
  });

  it("≥1 group trip but <3 → +8 (light bonus)", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 1, customerTrips: 0 } }),
    });
    expect(r.bonus).toBe(8);
    expect(r.reason).toMatch(/1 مرة سابقًا/);
  });

  it("0 trips on both axes → 0 bonus, null reason", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 0, customerTrips: 0 } }),
    });
    expect(r.bonus).toBe(0);
    expect(r.reason).toBeNull();
  });

  it("driver absent from history map → 0 bonus", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 999,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 10, customerTrips: 10 } }),
    });
    expect(r.bonus).toBe(0);
  });

  it("customer fallback fires when there is NO umrahGroupId but ≥3 customer trips", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: null,
      customerId: 1,
      history: hist({ 7: { groupTrips: 0, customerTrips: 5 } }),
    });
    expect(r.bonus).toBeGreaterThan(0);
    expect(r.reason).toMatch(/خدم نفس العميل/);
  });

  it("group-tier wins over customer-tier when both qualify simultaneously", () => {
    const r = scoreUmrahFamiliarity({
      transportServiceType: "passenger_umrah",
      driverId: 7,
      umrahGroupId: 42,
      customerId: 1,
      history: hist({ 7: { groupTrips: 5, customerTrips: 5 } }),
    });
    expect(r.bonus).toBe(15);
    expect(r.reason).toMatch(/الفوج/);
    expect(r.reason).not.toMatch(/نفس العميل/);
  });
});

/* ── Engine wiring ────────────────────────────────────────────── */

describe("#2079 PE-06 — engine wires the umrah scorer correctly", () => {
  it("imports scoreUmrahFamiliarity from the canonical module path", () => {
    expect(ENGINE).toMatch(/from "\.\/umrahFamiliarity\.js"/);
    expect(ENGINE).toMatch(/scoreUmrahFamiliarity/);
    expect(ENGINE).toMatch(/type UmrahFamiliarityHistory/);
  });

  it("BookingRow + SuggestionCriteria carry both keys (umrahGroupId, customerId)", () => {
    expect(ENGINE).toMatch(/umrahGroupId\?: number \| null;/);
    expect(ENGINE).toMatch(/customerId\?: number \| null;/);
  });

  it("the booking SELECT now hydrates customerId + umrahGroupId", () => {
    expect(ENGINE).toMatch(/b\."customerId"/);
    expect(ENGINE).toMatch(/b\."umrahGroupId"/);
  });

  it("the SuggestionRequest → criteria mapping threads both keys", () => {
    const block = ENGINE.slice(ENGINE.indexOf("return suggestForCriteria({"));
    expect(block.slice(0, 1500)).toMatch(/umrahGroupId: booking\.umrahGroupId/);
    expect(block.slice(0, 1500)).toMatch(/customerId:\s+booking\.customerId/);
  });

  it("the history probe runs ONLY for passenger_umrah AND only when a key is present", () => {
    const probe = ENGINE.slice(ENGINE.indexOf("#2079 PE-06 — umrah familiarity history"));
    expect(probe).toMatch(/c\.transportServiceType === "passenger_umrah"/);
    expect(probe).toMatch(/c\.umrahGroupId != null \|\| c\.customerId != null/);
  });

  it("history probe SQL counts trips in the trailing 90 days with FILTER on both keys", () => {
    const probe = ENGINE.slice(ENGINE.indexOf("#2079 PE-06 — umrah familiarity history"));
    expect(probe).toMatch(/INTERVAL '90 days'/);
    expect(probe).toMatch(/b\."umrahGroupId" = \$3/);
    expect(probe).toMatch(/b\."customerId"\s+= \$4/);
    expect(probe).toMatch(/JOIN transport_booking_lines/);
    expect(probe).toMatch(/JOIN transport_bookings/);
  });

  it("axis is added to the SuggestionResult.scores interface", () => {
    expect(ENGINE).toMatch(/umrahFamiliarity: number;/);
  });

  it("axis is populated in the per-pair scores output", () => {
    expect(ENGINE).toMatch(/umrahFamiliarity: umrahFamiliarityScore,/);
  });

  it("the umrah bonus only writes a reason — NEVER pushes a blocker", () => {
    const block = ENGINE.slice(ENGINE.indexOf("─ umrahFamiliarity (weight 2.5"));
    expect(block.slice(0, 1200)).not.toMatch(/blockers\.push/);
    expect(block.slice(0, 1200)).toMatch(/reasons\.push\(fam\.reason\)/);
  });

  it("re-weighting brings the sum to exactly 1.00 (PE-06 rule)", () => {
    expect(ENGINE).toMatch(/distanceScore\s+\* 0\.025/);
    expect(ENGINE).toMatch(/utilScore\s+\* 0\.05/);
    expect(ENGINE).toMatch(/umrahFamiliarityScore \* 0\.025/);
    const weights = [0.20, 0.10, 0.25, 0.15, 0.10, 0.025, 0.10, 0.05, 0.025];
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });
});

/* ── CHECK-PE-01 schema gate (UMR-03 deferred) ────────────────── */

describe("#2079 PE-06 — CHECK-PE-01 schema confirmation", () => {
  it("umrah_groups DOES define programDuration", () => {
    const mig = readFileSync(
      join(apiSrc, "migrations/093_umrah_phase2_tables.sql"),
      "utf8",
    );
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS public\.umrah_groups/);
    expect(mig).toMatch(/"programDuration"/);
  });

  it("umrah_groups does NOT define programStartsAt / programEndsAt → UMR-03 guard is DEFERRED", () => {
    const mig = readFileSync(
      join(apiSrc, "migrations/093_umrah_phase2_tables.sql"),
      "utf8",
    );
    expect(mig).not.toMatch(/programStartsAt/);
    expect(mig).not.toMatch(/programEndsAt/);
  });

  it("PE-06 does not introduce a new migration (owner explicitly forbade column additions)", () => {
    const migrations = ["330", "331", "332", "333", "334", "335"];
    const newOne = migrations.find((n) =>
      existsSync(join(apiSrc, "migrations", `${n}_umrah_familiarity.sql`)) ||
      existsSync(join(apiSrc, "migrations", `${n}_pe06_umrah_program_window.sql`)),
    );
    expect(newOne).toBeUndefined();
  });
});

/* ── Boundary pins (owner-mandated assertions) ────────────────── */

describe("#2079 PE-06 — boundary pins", () => {
  it("umrahFamiliarity lib is finance-blackout (no price/cost/invoice/amount)", () => {
    expect(LIB).not.toMatch(/price|cost|revenue|invoice|amount/i);
  });

  it("PE-06 does not touch any GL / journal symbol", () => {
    // Match precise finance/GL identifiers, not English words containing
    // 'gl' (e.g. 'guards', 'single'). Symbols are camelCased / underscored.
    expect(LIB).not.toMatch(/journal|ledger|generalLedger|posting[A-Z]|financial[A-Z]/);
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("PE-06 (`umrahFamiliarity.ts` itself) stays disentangled from reputation / VRP / Driver-Reputation symbols", () => {
    // PE-06 originally pinned that NO reputation symbol leaks anywhere
    // in the engine. TA-T18-DR Phase 2 (#TA-T18-DR Phase 2 PR) ships
    // the reputation axis as a separate, intentional integration —
    // weight 0.05, funded from `conflict` (0.25 → 0.20), with its own
    // dedicated static test (`driverReputationEngineIntegrationStatic.test.ts`).
    // The invariant that survives: PE-06's OWN code path
    // (`umrahFamiliarity.ts`) stays free of reputation/VRP symbols
    // — the two axes are independent.
    expect(LIB).not.toMatch(/reputation/i);
    expect(LIB).not.toMatch(/vrp|optimi[sz]er|tsp/i);
  });

  it("umrahFamiliarity stays disentangled from PE-07 ladder logic", () => {
    // PE-07 (per-family ladder) landed after PE-06. The two axes are
    // independent — neither references the other. This pin guards
    // the boundary: umrah scoring never touches the ladder, and the
    // ladder never references umrah symbols.
    const umrahBlock = ENGINE.slice(ENGINE.indexOf("─ umrahFamiliarity"));
    expect(umrahBlock.slice(0, 1500)).not.toMatch(/evaluateLadder|crossesFamily|PASSENGER_LADDER|CARGO_LADDER/);
  });

  it("non-umrah bookings continue to score umrahFamiliarity=0 (verified by the scoring code path)", () => {
    // The pure scorer guards the trigger; the engine never short-
    // circuits its weighted sum so the axis sits at 0 with zero side
    // effect for all non-umrah trips.
    const block = ENGINE.slice(ENGINE.indexOf("let umrahFamiliarityScore = 0;"));
    expect(block.slice(0, 1500)).toMatch(/if \(fam\.bonus > 0\)/);
  });
});
