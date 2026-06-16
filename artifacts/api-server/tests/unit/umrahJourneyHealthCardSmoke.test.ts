import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P7 — Dashboard journey-health panel smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.7):
 *   - New shared component `umrah-journey-health-card.tsx` reads
 *     /umrah/reports/recovery-hub (U-19-P6) and surfaces the 4 stuck
 *     buckets (imports / sub-agents / groups / invoices) on the
 *     umrah dashboard.
 *   - The dashboard page mounts the new card under the existing
 *     finance-hygiene card.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No new backend endpoint — reuses the U-19-P6 recovery hub.
 *   - No FE write path — `useApiQuery` only, no `apiFetch` mutations
 *     in this component.
 *
 * Failure modes pinned:
 *   - Component file is removed → §A fails.
 *   - Component drops a bucket → §B fails (operator misses a queue).
 *   - Component starts pointing at a different (wrong) endpoint → §C
 *     fails (the U-19-P6 recovery-hub contract is the integration
 *     point — moving it would silently break the panel).
 *   - Dashboard stops mounting the card → §D fails.
 *   - Component gains a POST/PUT/DELETE → §E fails (read-only break).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const CARD = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/umrah-journey-health-card.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/dashboard.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Card file exists + exports UmrahJourneyHealthCard
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P7 §A — umrah-journey-health-card.tsx is a valid React component", () => {
  it("exports `UmrahJourneyHealthCard`", () => {
    expect(CARD).toMatch(/export\s+function\s+UmrahJourneyHealthCard\s*\(/);
  });

  it("uses `useApiQuery` for the data read (no apiFetch — read-only)", () => {
    expect(CARD).toMatch(/useApiQuery/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — All 4 recovery-hub buckets are wired in the card
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P7 §B — card surfaces the 4 recovery-hub buckets", () => {
  for (const bucket of [
    "stuckImports",
    "unlinkedSubAgents",
    "uninvoicedGroups",
    "unpaidInvoices",
  ]) {
    it(`bucket '${bucket}' is referenced in the card`, () => {
      expect(CARD).toMatch(new RegExp(`["']?${bucket}["']?`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Card reads the correct endpoint (U-19-P6 recovery-hub)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P7 §C — card hits the U-19-P6 recovery-hub endpoint", () => {
  it("uses '/umrah/reports/recovery-hub' as the data source", () => {
    expect(CARD).toMatch(/["']\/umrah\/reports\/recovery-hub["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Dashboard mounts the card
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P7 §D — dashboard page mounts the card", () => {
  it("dashboard imports the component", () => {
    expect(DASHBOARD).toMatch(
      /import\s*\{\s*UmrahJourneyHealthCard\s*\}\s*from\s+["']@\/components\/shared\/umrah-journey-health-card["']/,
    );
  });

  it("dashboard renders the component", () => {
    expect(DASHBOARD).toMatch(/<UmrahJourneyHealthCard\s*\/?>/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Card is read-only (no FE write surface)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P7 §E — card has no write surface", () => {
  it("does NOT call apiFetch with a write method", () => {
    expect(CARD).not.toMatch(/apiFetch\s*\(/);
  });

  it("does NOT use POST/PUT/PATCH/DELETE literals", () => {
    expect(CARD).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  });
});
