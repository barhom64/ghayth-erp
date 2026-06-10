import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * U-01 — Service Boundary Lock smoke for umrah finance writes.
 *
 * Wave 1 of #2080 (UMRAH GOVERNANCE P0). Inspection-only PR: this test
 * FREEZES the current (clean) state of finance-related writes in umrah
 * routes + FE pages. It does NOT extract or fix anything — fixing is
 * not needed at the moment of this PR because the inspection confirmed
 * zero violations on main. See:
 *
 *   docs/governance/umrah-inventory-organization-repair/findings/
 *     U-01_finance_boundary.md
 *
 * What this smoke pins (and what each pin means):
 *
 *   §A routes/umrah.ts
 *     - Zero direct GL helper calls (createGuardedJournalEntry,
 *       createJournalEntry).
 *     - Zero direct INSERT/UPDATE/DELETE on journal_entries / journal_lines.
 *     - Read-only mentions of journal_entries / journal_lines are
 *       SENTINEL'D at the known count (2 SELECT/JOIN sites: penalty
 *       link display + NUSK wallet aggregation). Any new read needs a
 *       deliberate bump and a justification in the PR that bumps it.
 *
 *   §B routes/umrah-entities.ts
 *     - Same boundary invariants: zero GL helper calls, zero direct
 *       writes to journal_*. (Reads are present for statement /
 *       reclassify summary aggregations and are not sentinel'd here.)
 *
 *   §C pages/umrah/**
 *     - The FE never references the ledger tables or GL helpers.
 *
 * Why a smoke and not an integration test: this is a Service Boundary
 * Lock — a structural invariant about *which file is allowed to talk to
 * GL primitives*, not a behavioural one about a posting outcome. A grep
 * over the source is exactly the right shape for it, and it runs in
 * milliseconds inside guard.
 *
 * Failure mode by design: any future PR that opens a new GL write path
 * inside an umrah route (or wires a GL helper into an FE page) will
 * fail one of these assertions BEFORE the change can land. Fixing the
 * failure means either:
 *   - moving the new write into a proper engine and importing it (the
 *     correct path, consistent with §6/§6.2/§5 PRs), OR
 *   - explicitly bumping the sentinel in this file with a comment
 *     justifying the new read (for read-only sentinels only — write
 *     assertions must stay at zero).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
const ROUTE_UMRAH_ENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);

// Walk pages/umrah/** recursively and read every .tsx / .ts file.
function collectUmrahFePageSources(): Array<{ path: string; src: string }> {
  const base = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah");
  const out: Array<{ path: string; src: string }> = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
        out.push({ path: full, src: readFileSync(full, "utf8") });
      }
    }
  }
  walk(base);
  return out;
}

const FE_PAGES = collectUmrahFePageSources();

// ─────────────────────────────────────────────────────────────────────────────
// §A — routes/umrah.ts (~3,750 lines on the inspected revision)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-01 §A — routes/umrah.ts has zero finance-write boundary leaks", () => {
  it("contains zero calls to createGuardedJournalEntry", () => {
    // A direct GL call from a route means the route is doing engine
    // work. The umrah finance dorces (sales / NUSK purchase /
    // commission / reclassify) all live in engines under
    // lib/umrah*Engine.ts; routes should be thin wrappers only.
    const calls = ROUTE_UMRAH.match(/\bcreateGuardedJournalEntry\s*\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it("contains zero calls to createJournalEntry (unguarded GL helper)", () => {
    // createJournalEntry skips the financial-posting guard. Even
    // engines should prefer the Guarded variant; a route calling the
    // unguarded one is a strictly worse violation.
    const calls = ROUTE_UMRAH.match(/\bcreateJournalEntry\s*\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it("contains zero direct write SQL to journal_entries / journal_lines", () => {
    expect(ROUTE_UMRAH).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(ROUTE_UMRAH).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    expect(ROUTE_UMRAH).not.toMatch(/DELETE\s+FROM\s+journal_(entries|lines)/i);
  });

  it("read-only references to journal_entries / journal_lines stay at the known count", () => {
    // Two SELECT/JOIN sites today:
    //   1) LEFT JOIN journal_entries on pen."journalEntryId" — penalty
    //      list display shows the linked GL entry id.
    //   2) JOIN journal_entries via supplier_payment_allocations —
    //      NUSK wallet balance aggregation.
    // Any third reference needs a deliberate sentinel bump WITH a
    // justification comment. The sentinel is the gate.
    const mentions = ROUTE_UMRAH.match(/\bjournal_(entries|lines)\b/g) ?? [];
    expect(mentions.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — routes/umrah-entities.ts (~5,836 lines on the inspected revision)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-01 §B — routes/umrah-entities.ts has zero finance-write boundary leaks", () => {
  it("contains zero calls to createGuardedJournalEntry", () => {
    // The reclassify-revenue endpoint is a textbook thin wrapper:
    //   await reclassifyRevenueForInvoices(scope, body);
    // No JE building in the route, no Guarded helper call from here.
    const calls = ROUTE_UMRAH_ENT.match(/\bcreateGuardedJournalEntry\s*\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it("contains zero calls to createJournalEntry (unguarded GL helper)", () => {
    const calls = ROUTE_UMRAH_ENT.match(/\bcreateJournalEntry\s*\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it("contains zero direct write SQL to journal_entries / journal_lines", () => {
    expect(ROUTE_UMRAH_ENT).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(ROUTE_UMRAH_ENT).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    expect(ROUTE_UMRAH_ENT).not.toMatch(/DELETE\s+FROM\s+journal_(entries|lines)/i);
  });

  // Note: read-only references in this route are NOT sentinel'd
  // because the file already has several legitimate aggregation
  // SELECT sites (statements, reclassify summary) and the surface is
  // large enough that a strict sentinel would churn on unrelated PRs.
  // The write-side assertions above are the real boundary lock; reads
  // here are inspected ad-hoc when they appear in diffs.
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — pages/umrah/** (FE)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-01 §C — FE umrah pages have zero finance-write boundary references", () => {
  it("scanned at least the expected number of source files (defence against an empty walk)", () => {
    // If the page directory moves or the path resolver breaks, the
    // walk returns nothing and every `for` loop below passes vacuously.
    // This assertion fails loudly in that case.
    expect(FE_PAGES.length).toBeGreaterThanOrEqual(30);
  });

  it("no FE page references journal_entries or journal_lines", () => {
    for (const { path, src } of FE_PAGES) {
      expect(
        src.match(/\bjournal_(entries|lines)\b/),
        `unexpected GL table reference in FE page: ${path}`,
      ).toBeNull();
    }
  });

  it("no FE page references createGuardedJournalEntry or createJournalEntry", () => {
    for (const { path, src } of FE_PAGES) {
      expect(
        src.match(/\bcreate(Guarded)?JournalEntry\b/),
        `unexpected GL helper reference in FE page: ${path}`,
      ).toBeNull();
    }
  });
});
