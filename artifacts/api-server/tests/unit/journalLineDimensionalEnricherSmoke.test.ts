import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The deepest «النظام المالي متأصل» surface — auto-population of
 * journal_lines.costCenterId at posting time. Previous PRs created
 * the CCs and made them visible; this one closes the loop so every
 * future JE that touches a project / contract / vehicle / department
 * lands in the matching CC automatically.
 *
 * Three surfaces in this PR:
 *  1. lib/journalLineDimensionalEnricher — the pure resolver + cache
 *  2. lib/businessHelpers — invokes the enricher inside createJournalEntry
 *  3. routes/finance-cost-centers — backfill + coverage endpoints
 *  4. pages/finance/dimensional-routing — surfaces coverage + one-click backfill
 */

const ENRICHER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/journalLineDimensionalEnricher.ts"),
  "utf8",
);
const BH = readFileSync(
  join(import.meta.dirname!, "../../src/lib/businessHelpers.ts"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dimensional-routing.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Enricher — priority chain + cache + null-safe semantics
// ─────────────────────────────────────────────────────────────────────────────
describe("enrichJournalLineDimensions — resolution priority + safety", () => {
  it("declares the priority chain — project > contract > vehicle > department > branch", () => {
    const chain = ENRICHER.match(/const RESOLUTION_PRIORITY[\s\S]{0,500}\];/);
    expect(chain).toBeTruthy();
    const orderedTypes = ["project", "contract", "vehicle", "department", "branch"];
    let lastIdx = -1;
    for (const t of orderedTypes) {
      const i = chain![0].indexOf(`"${t}"`);
      expect(i).toBeGreaterThan(lastIdx);
      lastIdx = i;
    }
  });

  it("NEVER overrides an explicit operator-set costCenterId (audit-safe)", () => {
    // The first thing the function does — bail if costCenterId is
    // already set. Pinning this so a future refactor that adds
    // "validation" doesn't accidentally trample operator choices.
    expect(ENRICHER).toMatch(/if \(line\.costCenterId != null\) return line/);
  });

  it("ignores zero / negative / non-numeric id fields (defensive)", () => {
    expect(ENRICHER).toMatch(/typeof raw === "number" && raw > 0 \? raw : null/);
  });

  it("falls back to headerBranchId ONLY when no per-line dim matched (corporate-overhead path)", () => {
    expect(ENRICHER).toMatch(/Final fallback[\s\S]{0,500}ctx\.headerBranchId/);
  });

  it("PER-JE CACHE — same (entityType,entityId) lookup hits the cache, not the DB", () => {
    // The cache is the whole point — a 50-line invoice all routing to
    // the same project should only do ONE DB lookup, not 50.
    expect(ENRICHER).toMatch(/const key = `\$\{entityType\}:\$\{entityId\}`/);
    expect(ENRICHER).toMatch(/if \(cache\.has\(key\)\) return cache\.get\(key\) \?\? null/);
    expect(ENRICHER).toMatch(/cache\.set\(key, id\)/);
  });

  it("CC lookup is tenant + active scoped (defence in depth)", () => {
    expect(ENRICHER).toMatch(/"companyId" = \$1/);
    expect(ENRICHER).toMatch(/AND status != 'deleted'/);
    expect(ENRICHER).toMatch(/AND \("deletedAt" IS NULL\)/);
  });

  it("enrichJournalLines convenience wrapper accepts the array + builds a fresh cache", () => {
    expect(ENRICHER).toMatch(/export async function enrichJournalLines/);
    expect(ENRICHER).toMatch(/ccCache: new Map\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Wire-in — createJournalEntry calls the enricher
// ─────────────────────────────────────────────────────────────────────────────
describe("createJournalEntry — wires the enricher before the INSERT loop", () => {
  it("imports enrichJournalLines from the dedicated module", () => {
    // The import list widens over time (header inference, etc.). Pin
    // SHAPE: enrichJournalLines is in the named-imports list of the
    // dedicated module, regardless of what siblings show up next to it.
    expect(BH).toMatch(/import \{[^}]*enrichJournalLines[^}]*\} from "\.\/journalLineDimensionalEnricher\.js"/);
  });

  it("invokes the enricher with (client, lines, companyId, branchId) before the line-INSERT loop", () => {
    expect(BH).toMatch(/await enrichJournalLines\(client, params\.lines, params\.companyId, params\.branchId\)/);
  });

  it("the enricher runs INSIDE withTransaction — same SAVEPOINT as the INSERTs (atomicity)", () => {
    // Pin that the call sits between the header insert and the line
    // loop. Without this, a thrown enricher error would leave the
    // header committed and the lines orphaned. We match the LAST
    // occurrence of the call (not the first — comments now also
    // mention the function name) by searching with lastIndexOf.
    const headerIdx = BH.indexOf("headerResult.rows[0].id as number");
    const enrichIdx = BH.lastIndexOf("await enrichJournalLines(client, params.lines");
    const loopIdx = BH.lastIndexOf("for (const line of params.lines)");
    expect(headerIdx).toBeGreaterThan(0);
    expect(enrichIdx).toBeGreaterThan(headerIdx);
    expect(loopIdx).toBeGreaterThan(enrichIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backfill endpoint — closes the loop for historical JEs
// ─────────────────────────────────────────────────────────────────────────────
const BF = (() => {
  const m = FCC.match(/router\.post\("\/journal-lines\/backfill-dimensions"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("backfill handler not found");
  return m[0];
})();

describe("POST /finance/journal-lines/backfill-dimensions", () => {
  it("requires the update permission (write — patches journal_lines)", () => {
    expect(BF).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"update"\s*\}\)/);
  });

  it("declares the SAME priority chain as the runtime enricher (single source of truth)", () => {
    // Pinning per-entry — if these get out of sync, runtime JE
    // posting routes differently than backfill, which is exactly the
    // kind of silent divergence we want to refuse.
    const types = ["project", "contract", "vehicle", "department", "branch"];
    let lastIdx = -1;
    for (const t of types) {
      const i = BF.indexOf(`entityType: "${t}"`);
      expect(i).toBeGreaterThan(lastIdx);
      lastIdx = i;
    }
  });

  it("STRICT priority — each pass adds 'precedingFields IS NULL' guards so branch can't clobber project", () => {
    expect(BF).toMatch(/precedingFields\.map\(\(f\) => `jl\.\$\{f\} IS NULL`\)\.join\(" AND "\)/);
  });

  it("set-based UPDATE...FROM (cheap on large ledgers — one query per stage, not per row)", () => {
    // Critical perf signal — row-by-row would melt on 100k+ ledgers.
    expect(BF).toMatch(/UPDATE journal_lines jl\s+SET "costCenterId" = cc\.id\s+FROM journal_entries je, cost_centers cc/);
  });

  it("IDEMPOTENT — guards on costCenterId IS NULL so re-runs are no-ops", () => {
    expect(BF).toMatch(/jl\."costCenterId" IS NULL/);
  });

  it("tenant-safe — both the JE and the CC are gated on the scope's companyId", () => {
    expect(BF).toMatch(/je\."companyId" = \$1/);
    expect(BF).toMatch(/cc\."companyId" = \$1/);
  });

  it("audit-logs the bulk operation with per-stage counts", () => {
    expect(BF).toMatch(/action: "journal_lines\.backfill_dimensions"/);
    expect(BF).toMatch(/after: \{ stages, totalUpdated \}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Coverage endpoint — what the dashboard shows
// ─────────────────────────────────────────────────────────────────────────────
const COV = (() => {
  const m = FCC.match(/router\.get\("\/journal-lines\/dimensional-coverage"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("coverage handler not found");
  return m[0];
})();

describe("GET /finance/journal-lines/dimensional-coverage", () => {
  it("returns the 4 buckets — total / withCc / withDimensionButNoCc / orphanCorporate", () => {
    expect(COV).toMatch(/AS "totalLines"/);
    expect(COV).toMatch(/AS "withCc"/);
    expect(COV).toMatch(/AS "withDimensionButNoCc"/);
    expect(COV).toMatch(/AS "orphanCorporate"/);
  });

  it("computes coveragePct = withCc / totalLines (100 when empty — zero-entity tenant is 100%)", () => {
    expect(COV).toMatch(/totalLines > 0 \? Math\.round\(\(withCc \/ totalLines\) \* 100\) : 100/);
  });

  it("the 'any dimension' check covers all 5 routable fields — project / contract / vehicle / department / branch", () => {
    expect(COV).toMatch(/COALESCE\(jl\."projectId", jl\."contractId", jl\."vehicleId",\s*jl\."departmentId", jl\."branchId"\)/);
  });

  it("filter clauses use COUNT(*) FILTER (WHERE ...) — one scan, 3 buckets", () => {
    const filters = COV.match(/COUNT\(\*\) FILTER \(WHERE/g);
    expect(filters?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UI integration — coverage card + backfill button on the hub
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/dimensional-routing — JE coverage card + backfill button", () => {
  it("queries the new coverage endpoint", () => {
    expect(PAGE).toContain(`"/finance/journal-lines/dimensional-coverage"`);
  });

  it("backfill mutation hits the new endpoint and invalidates the coverage cache key", () => {
    expect(PAGE).toMatch(/"\/finance\/journal-lines\/backfill-dimensions"/);
    expect(PAGE).toContain('"dim-routing-line-coverage"');
  });

  it("coverage card renders only when data is present (no flash of empty state)", () => {
    expect(PAGE).toMatch(/\{coverage && \(/);
  });

  it("coverage percentage flips warning → success at 100% (visible signal)", () => {
    expect(PAGE).toMatch(/coverage\.coveragePct === 100 \? "text-status-success-foreground" : "text-status-warning-foreground"/);
  });

  it("'تأصيل كامل' badge appears at 100% — explicit positive feedback", () => {
    expect(PAGE).toContain("تأصيل كامل");
  });

  it("backfill button hidden when there's nothing to backfill (withDimensionButNoCc === 0)", () => {
    expect(PAGE).toMatch(/coverage\.withDimensionButNoCc > 0/);
  });

  it("orphan-corporate count surfaced — operator can see 'lines with no routable dim at all'", () => {
    expect(PAGE).toContain("قيود عامة (بدون بُعد)");
    expect(PAGE).toContain('data-testid="dim-routing-jl-orphan"');
  });

  it("stable testids — card + fixable count + orphan count + backfill button", () => {
    for (const id of [
      'data-testid="dim-routing-jl-coverage"',
      'data-testid="dim-routing-jl-fixable"',
      'data-testid="dim-routing-jl-orphan"',
      'data-testid="dim-routing-jl-backfill"',
    ]) {
      expect(PAGE).toContain(id);
    }
  });
});
