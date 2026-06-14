import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-06 — drift guard for the shared transport status
 * dictionary (artifacts/ghayth-erp/src/lib/transport-status-labels.ts).
 *
 * The SPA dictionary must cover every value declared in the server-
 * side enums so the operator never sees a raw English status fall
 * through to the UI. This test scrapes the canonical server enums
 * directly from the route files (no JSON contract layer to drift
 * from) and asserts every value has an Arabic label entry.
 *
 * Server-side sources of truth:
 *   • BOOKING_STATUSES   ← artifacts/api-server/src/routes/transport-bookings.ts
 *   • DISPATCH_STATUSES  ← same file
 *   • CARGO_STATUSES     ← artifacts/api-server/src/routes/cargo.ts
 *   • LEG status check   ← artifacts/api-server/src/migrations/271_transport_planning_engine.sql
 *
 * When the server adds / renames a status, this test fails until
 * the dictionary is updated. The fallback in `statusLabel()` keeps
 * runtime safe, but the test refuses the drift in code review.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const apiSrc   = join(repoRoot, "artifacts/api-server/src");
const spaSrc   = join(repoRoot, "artifacts/ghayth-erp/src");

const DICT = readFileSync(join(spaSrc, "lib/transport-status-labels.ts"), "utf8");

function readEnumArray(file: string, name: string): string[] {
  const src = readFileSync(file, "utf8");
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`Cannot find ${name} in ${file}`);
  return [...m[1].matchAll(/["']([a-z_]+)["']/g)].map((mm) => mm[1]);
}

/* ── booking + dispatch (transport-bookings.ts) ──────────────── */

describe("#2079 TA-T18-06 — booking + dispatch enums covered", () => {
  const bookings  = readEnumArray(join(apiSrc, "routes/transport-bookings.ts"), "BOOKING_STATUSES");
  const dispatch  = readEnumArray(join(apiSrc, "routes/transport-bookings.ts"), "DISPATCH_STATUSES");

  it("BOOKING_STATUSES is the full 10-state machine (sanity)", () => {
    expect(bookings.length).toBeGreaterThanOrEqual(10);
  });

  it("every booking status has an Arabic label in the SPA dictionary", () => {
    for (const s of bookings) {
      expect(DICT, `booking status "${s}" missing from dictionary`)
        .toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    }
  });

  it("every dispatch status has an Arabic label in the SPA dictionary", () => {
    for (const s of dispatch) {
      expect(DICT, `dispatch status "${s}" missing from dictionary`)
        .toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    }
  });
});

/* ── cargo (cargo.ts) ────────────────────────────────────────── */

describe("#2079 TA-T18-06 — cargo enum covered", () => {
  const cargo = readEnumArray(join(apiSrc, "routes/cargo.ts"), "CARGO_STATUSES");

  it("CARGO_STATUSES is the 15-state cargo lifecycle", () => {
    expect(cargo.length).toBeGreaterThanOrEqual(14);
  });

  it("every cargo status has an Arabic label in the SPA dictionary", () => {
    for (const s of cargo) {
      expect(DICT, `cargo status "${s}" missing from dictionary`)
        .toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    }
  });
});

/* ── leg (transport_itinerary_legs check) ────────────────────── */

describe("#2079 TA-T18-06 — itinerary leg enum covered", () => {
  const mig = readFileSync(
    join(apiSrc, "migrations/271_transport_planning_engine.sql"),
    "utf8",
  );
  const checkBlock = mig.match(/transport_leg_status_check[\s\S]+?ARRAY\[([\s\S]+?)\]/)?.[1] ?? "";
  const legStatuses = [...checkBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  it("the leg CHECK constraint declares at least 7 states", () => {
    expect(legStatuses.length).toBeGreaterThanOrEqual(7);
  });

  it("every leg status has an Arabic label in the SPA dictionary", () => {
    for (const s of legStatuses) {
      expect(DICT, `leg status "${s}" missing from dictionary`)
        .toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    }
  });
});

/* ── vehicle (SPA canonical options) ─────────────────────────── */

describe("#2079 TA-T18-06 — vehicle status canonical options covered", () => {
  // fleet_vehicles.status doesn't have a CHECK enum in migrations
  // (legacy column); the canonical option set lives in the SPA at
  // pages/create/fleet/vehicle-status-change.tsx.
  const ui = readFileSync(
    join(spaSrc, "pages/create/fleet/vehicle-status-change.tsx"),
    "utf8",
  );
  const opts = [...ui.matchAll(/value:\s*["']([a-z_]+)["']/g)].map((m) => m[1]);

  it("the SPA canonical option list is non-empty", () => {
    expect(opts.length).toBeGreaterThanOrEqual(4);
  });

  it("every canonical vehicle status has an Arabic label in the dictionary", () => {
    for (const s of opts) {
      expect(DICT, `vehicle status "${s}" missing from dictionary`)
        .toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    }
  });
});

/* ── rental (fleet_rental_contracts) ─────────────────────────── */

describe("#2079 TA-T18-06 — rental contract states covered", () => {
  // The CHECK is informal in the migration (VARCHAR DEFAULT 'draft'),
  // and the canonical set comes from the SPA filter strip + the two
  // derived sub-stages classified client-side (#2001 / #2002).
  const REQUIRED = ["draft", "active", "completed", "cancelled"];
  for (const s of REQUIRED) {
    it(`rental status "${s}" is covered`, () => {
      expect(DICT).toMatch(new RegExp(`(?:["']${s}["']|\\b${s}\\b)\\s*:\\s*\\{\\s*label:\\s*["'].+?["']`));
    });
  }

  it("derived sub-stages (awaiting_handover/awaiting_return) are also in the dictionary", () => {
    expect(DICT).toMatch(/awaiting_handover/);
    expect(DICT).toMatch(/awaiting_return/);
  });
});

/* ── consumer wiring ─────────────────────────────────────────── */

describe("#2079 TA-T18-06 — three audit-flagged surfaces consume the dictionary", () => {
  const vehicleCtxCard = readFileSync(join(spaSrc, "components/shared/vehicle-context-card.tsx"), "utf8");
  const meDriver       = readFileSync(join(spaSrc, "pages/fleet/me-driver.tsx"), "utf8");
  const rentals        = readFileSync(join(spaSrc, "pages/fleet/rental-contracts.tsx"), "utf8");

  it("vehicle-context-card imports statusLabel and dropped its local STATUS_LABELS map", () => {
    expect(vehicleCtxCard).toMatch(/from "@\/lib\/transport-status-labels"/);
    expect(vehicleCtxCard).toMatch(/statusLabel\("vehicle", data\.status\)/);
    expect(vehicleCtxCard).not.toMatch(/const STATUS_LABELS:\s*Record<string,\s*\{\s*label:\s*string;\s*className:/);
  });

  it("me-driver imports statusLabel and dropped its local CARGO_STATUS map", () => {
    expect(meDriver).toMatch(/from "@\/lib\/transport-status-labels"/);
    expect(meDriver).toMatch(/statusLabel\("cargo", m\.status\)/);
    expect(meDriver).not.toMatch(/const CARGO_STATUS:\s*Record<string,/);
  });

  it("rental-contracts derives filter labels from the dictionary", () => {
    expect(rentals).toMatch(/from "@\/lib\/transport-status-labels"/);
    expect(rentals).toMatch(/statusLabel\("rental",/);
  });
});

/* ── boundary pins ──────────────────────────────────────────── */

describe("#2079 TA-T18-06 — boundary intact (lib is presentation-only)", () => {
  it("dictionary lib contains no finance / GL / journal / amount logic", () => {
    // The cargo enum has `ready_for_invoice` and `financially_closed`
    // as legitimate lifecycle states — they're status labels only,
    // never JE/GL hooks. We refuse genuine finance identifiers
    // (camelCased symbols, posting helpers, ledger fields).
    expect(DICT).not.toMatch(/journalEngine|generalLedger|postingEngine|financialEngine|invoiceLine|amount:\s|price:\s|cost:\s|revenue:\s/);
  });

  it("dictionary lib contains no VRP / Driver-Reputation hooks", () => {
    expect(DICT).not.toMatch(/reputationScore|driverReputation|vrp[A-Z]|optimizer[A-Z]/);
  });

  it("dictionary lib does NOT touch engine / migration / API symbols (presentation-only)", () => {
    expect(DICT).not.toMatch(/assignmentSuggestionEngine|migration|rawQuery|fetch\(/);
  });
});
