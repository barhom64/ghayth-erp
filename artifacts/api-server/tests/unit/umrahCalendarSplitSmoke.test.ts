import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 15 — umrah-entities.ts split smoke (operational calendar).
 *
 * Scope:
 *   - Carves the read-only operational calendar aggregator into a dedicated
 *     sub-router: artifacts/api-server/src/routes/umrah-calendar.ts
 *       GET /calendar/events
 *     plus the exported CalendarLayer type + CALENDAR_LAYER_META metadata.
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(calendarRouter)` so the API surface stays identical
 *     (path still resolves at /umrah/calendar/events).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *   - No ledger touch — the calendar is a read-only SELECT aggregator.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - The route is missing in the new file → §C fails.
 *   - The route accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-calendar.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 15 §A — umrah-calendar.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("carries the CalendarLayer type + CALENDAR_LAYER_META metadata", () => {
    expect(CHILD).toMatch(/export type CalendarLayer/);
    expect(CHILD).toMatch(/export const CALENDAR_LAYER_META: Record<CalendarLayer/);
  });

  it("is a read-only carve — no writes, no ledger posting, no audit/event helpers", () => {
    expect(CHILD).not.toMatch(/INSERT\s+INTO|rawExecute|withTransaction/);
    expect(CHILD).not.toMatch(/postNuskJournalEntries\s*\(|reclassifyRevenueForInvoices\s*\(/);
    expect(CHILD).not.toMatch(/createAuditLog\s*\(|auditFromRequest\s*\(|emitEvent\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 15 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+calendarRouter\s+from\s+["']\.\/umrah-calendar\.js["']/);
  });

  it("parent mounts the sub-router with router.use(calendarRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*calendarRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — The route lives in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 15 §C — the moved route is present in the child", () => {
  it('child declares router.get("/calendar/events", ...)', () => {
    expect(CHILD).toMatch(/router\.get\(\s*["']\/calendar\/events["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The route is GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 15 §D — parent no longer declares the moved route", () => {
  it('parent does NOT declare router.get("/calendar/events", ...)', () => {
    expect(PARENT).not.toMatch(/router\.get\(\s*["']\/calendar\/events["']/);
  });

  it("parent no longer defines CALENDAR_LAYER_META (moved with the route)", () => {
    expect(PARENT).not.toMatch(/export const CALENDAR_LAYER_META/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 15 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 2980 lines (was ~3207 before this carve, ~2892 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(2980);
  });
});
