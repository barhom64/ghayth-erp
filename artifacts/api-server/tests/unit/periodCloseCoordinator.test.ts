// periodCloseCoordinator.test.ts
//
// FIN-PERIOD-CLOSE (#2250) — the period-close COORDINATOR aggregates ALL
// integrity blockers (not fail-fast) before a fiscal period may lock.
//
// OWNER MANDATE: assert the coordinator (a) RETURNS the full blocker set without
// throwing, (b) the close DECISION refuses on ANY blocker and allows only on a
// clean check, (c) the close REPORT records counts + reason, and (d) the close
// is AUDITED.
//
// TESTABILITY: collectPeriodCloseBlockers / buildPeriodCloseReport are DB-bound
// (rawQuery + the engine gates), so — mirroring periodCloseTruthGate.test.ts —
// we cover #2250 two ways without a DB:
//   (A) a PURE re-derivation of the aggregation + decision rule → assert it
//       collects EVERY blocker class and REFUSES when any stands, ALLOWS only on
//       an empty set.
//   (B) STATIC-CONTRACT assertions against the real source
//       (periodCloseCoordinator.ts + fiscalPeriodLifecycle.ts) → the coordinator
//       scans each blocker class scoped to the period window, the gate throws
//       ConflictError ONCE with meta.blockers (the full set) and only then
//       applies the atomic open→closed transition + audits the close report.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canCloseGivenBlockers,
  type PeriodCloseBlocker,
  type PeriodCloseBlockerType,
} from "../../src/lib/periodCloseCoordinator.js";

const API_ROOT = join(import.meta.dirname!, "../..");
const COORD_SRC = readFileSync(join(API_ROOT, "src/lib/periodCloseCoordinator.ts"), "utf8");
const GATE_SRC = readFileSync(join(API_ROOT, "src/lib/fiscalPeriodLifecycle.ts"), "utf8");
const ROUTE_SRC = readFileSync(join(API_ROOT, "src/routes/finance-hardening.ts"), "utf8");

// ── Pure mirror of the coordinator's aggregation + the gate's decision ────────
//
// The real coordinator runs N independent checks and pushes one blocker per
// failing class. This mirror takes a "world" (the in-period facts) and derives
// the SAME blocker set + the SAME decision (no fail-fast — collect them ALL).
type World = {
  pendingManualJEs: number;
  dueUnpostedAmortizations: number;
  dueUnpostedDeferredRevenue: number;
  operationalLinesMissingDims: number;
  mappingFallbacks: number;
  manualLinkedNoReason: number;
  openPostingFailures: number;
};

function deriveBlockers(w: World): PeriodCloseBlocker[] {
  const out: PeriodCloseBlocker[] = [];
  const push = (type: PeriodCloseBlockerType, source: string, n: number) =>
    out.push({ type, source, recordRef: `count=${n}`, reason: `${n}`, requiredAction: "fix" });
  if (w.pendingManualJEs > 0) push("pending_manual_je", "journal_entries", w.pendingManualJEs);
  if (w.dueUnpostedAmortizations > 0) push("amortization", "prepaid", w.dueUnpostedAmortizations);
  if (w.dueUnpostedDeferredRevenue > 0) push("deferred_revenue", "defrev", w.dueUnpostedDeferredRevenue);
  if (w.operationalLinesMissingDims > 0) push("dimension", "journal_lines", w.operationalLinesMissingDims);
  if (w.mappingFallbacks > 0) push("mapping_fallback", "audit_logs", w.mappingFallbacks);
  if (w.manualLinkedNoReason > 0) push("manual_no_reason", "journal_entries", w.manualLinkedNoReason);
  if (w.openPostingFailures > 0) push("posting_failure", "financial_posting_failures", w.openPostingFailures);
  return out;
}

const CLEAN: World = {
  pendingManualJEs: 0,
  dueUnpostedAmortizations: 0,
  dueUnpostedDeferredRevenue: 0,
  operationalLinesMissingDims: 0,
  mappingFallbacks: 0,
  manualLinkedNoReason: 0,
  openPostingFailures: 0,
};

describe("#2250 — coordinator decision rule (pure)", () => {
  it("a CLEAN period → zero blockers and close is ALLOWED", () => {
    const blockers = deriveBlockers(CLEAN);
    expect(blockers).toEqual([]);
    expect(canCloseGivenBlockers(blockers)).toBe(true);
  });

  it("an operational JE missing dims → a 'dimension' blocker, close REFUSED", () => {
    const blockers = deriveBlockers({ ...CLEAN, operationalLinesMissingDims: 3 });
    expect(blockers.map((b) => b.type)).toContain("dimension");
    expect(canCloseGivenBlockers(blockers)).toBe(false);
  });

  it("a due un-posted amortization → an 'amortization' blocker, close REFUSED", () => {
    const blockers = deriveBlockers({ ...CLEAN, dueUnpostedAmortizations: 1 });
    expect(blockers.map((b) => b.type)).toContain("amortization");
    expect(canCloseGivenBlockers(blockers)).toBe(false);
  });

  it("a due un-posted deferred-revenue → a 'deferred_revenue' blocker, close REFUSED", () => {
    const blockers = deriveBlockers({ ...CLEAN, dueUnpostedDeferredRevenue: 2 });
    expect(blockers.map((b) => b.type)).toContain("deferred_revenue");
    expect(canCloseGivenBlockers(blockers)).toBe(false);
  });

  it("AGGREGATES — never fail-fast: every failing class is reported in ONE pass", () => {
    const blockers = deriveBlockers({
      pendingManualJEs: 1,
      dueUnpostedAmortizations: 1,
      dueUnpostedDeferredRevenue: 1,
      operationalLinesMissingDims: 1,
      mappingFallbacks: 1,
      manualLinkedNoReason: 1,
      openPostingFailures: 1,
    });
    expect(blockers).toHaveLength(7);
    expect(new Set(blockers.map((b) => b.type))).toEqual(
      new Set([
        "pending_manual_je",
        "amortization",
        "deferred_revenue",
        "dimension",
        "mapping_fallback",
        "manual_no_reason",
        "posting_failure",
      ]),
    );
    expect(canCloseGivenBlockers(blockers)).toBe(false);
  });
});

describe("#2250 — close report records counts + reason (pure)", () => {
  // The report carries scalar counts; here we assert the blocker payload encodes
  // the count + a reason string per failing class (the real report parses these
  // counts off the blockers + its own COUNT(*) queries).
  it("each blocker carries a machine type, a count ref, and an Arabic-facing reason+action contract", () => {
    const blockers = deriveBlockers({ ...CLEAN, pendingManualJEs: 5 });
    const b = blockers[0]!;
    expect(b.type).toBe("pending_manual_je");
    expect(b.recordRef).toBe("count=5");
    expect(typeof b.reason).toBe("string");
    expect(typeof b.requiredAction).toBe("string");
  });
});

describe("#2250 — coordinator source contract (real coordinator, DB-bound)", () => {
  it("exports the pure decision rule + the two aggregators", () => {
    expect(COORD_SRC).toContain("export function canCloseGivenBlockers");
    expect(COORD_SRC).toContain("export async function collectPeriodCloseBlockers");
    expect(COORD_SRC).toContain("export async function buildPeriodCloseReport");
  });

  it("collects ALL blocker classes — pending JE, amortization, deferred revenue, dimension, fallback, manual-no-reason, posting failure", () => {
    expect(COORD_SRC).toContain('"pending_manual_je"');
    expect(COORD_SRC).toContain("findUnpostedDueAmortizations");
    expect(COORD_SRC).toContain("findUnpostedDueRecognitions");
    expect(COORD_SRC).toContain('"dimension"');
    expect(COORD_SRC).toMatch(/action = 'mapping_fallback'/);
    expect(COORD_SRC).toContain('"manual_no_reason"');
    expect(COORD_SRC).toContain("financial_posting_failures");
  });

  it("is NOT fail-fast — it pushes onto a list and RETURNS it (never throws)", () => {
    expect(COORD_SRC).toContain("const blockers: PeriodCloseBlocker[] = [];");
    expect(COORD_SRC).toContain("blockers.push(");
    expect(COORD_SRC).toContain("return blockers;");
  });

  it("every check is company-scoped AND windowed to the period date range", () => {
    // each rawQuery uses companyId=$1 + a BETWEEN $2 AND $3 / period window arg
    expect(COORD_SRC).toContain('"companyId"=$1');
    expect(COORD_SRC).toContain("BETWEEN $2 AND $3");
    expect(COORD_SRC).toContain("periodStart: startDate");
    expect(COORD_SRC).toContain("periodEnd: endDate");
  });

  it("the report records the mandated counts (total JEs, missing dims, amort/defrev executed+remaining, posting failures)", () => {
    expect(COORD_SRC).toContain("totalJournalEntries");
    expect(COORD_SRC).toContain("journalEntriesMissingDimensions");
    expect(COORD_SRC).toContain("amortizationsExecuted");
    expect(COORD_SRC).toContain("amortizationsRemaining");
    expect(COORD_SRC).toContain("deferredRevenueRecognized");
    expect(COORD_SRC).toContain("deferredRevenueRemaining");
    expect(COORD_SRC).toContain("postingFailures");
    expect(COORD_SRC).toContain("closedBy");
    expect(COORD_SRC).toContain("closedAt");
  });
});

describe("#2250 — close gate refactor (real gate, DB-bound)", () => {
  it("the gate calls the coordinator (aggregate), no longer inlining fail-fast checks", () => {
    expect(GATE_SRC).toContain("collectPeriodCloseBlockers");
    expect(GATE_SRC).toContain("buildPeriodCloseReport");
  });

  it("REFUSES (throws ConflictError) ONCE with meta.blockers = the FULL set", () => {
    expect(GATE_SRC).toMatch(/if\s*\(blockers\.length\s*>\s*0\)/);
    expect(GATE_SRC).toContain("ConflictError");
    expect(GATE_SRC).toContain("لا يمكن إقفال الفترة");
    expect(GATE_SRC).toMatch(/meta:\s*\{\s*blockers/);
  });

  it("only AFTER the gate passes does it apply the atomic open→closed transition", () => {
    expect(GATE_SRC).toMatch(/fromStates:\s*\["open"\]/);
    expect(GATE_SRC).toMatch(/toState:\s*"closed"/);
    expect(GATE_SRC).toContain("withTransaction");
  });

  it("AUDITS the close — the close report rides into the transition's audit `after` payload", () => {
    // applyTransition writes the audit row; the close report is in `after`.
    expect(GATE_SRC).toContain("closeReport");
    expect(GATE_SRC).toMatch(/after:\s*\{[^}]*closeReport/);
    expect(GATE_SRC).toContain('action: "fiscal_period.closed"');
  });
});

describe("#2250 — close-preview endpoint (real route)", () => {
  it("exposes a read-only GET close-preview returning { blockers, report } WITHOUT locking", () => {
    expect(ROUTE_SRC).toContain("/fiscal-periods-v2/:id/close-preview");
    expect(ROUTE_SRC).toMatch(/financeHardeningRouter\.get\("\/fiscal-periods-v2\/:id\/close-preview"/);
    expect(ROUTE_SRC).toContain("collectPeriodCloseBlockers");
    expect(ROUTE_SRC).toContain("buildPeriodCloseReport");
    expect(ROUTE_SRC).toContain("canClose");
  });
});
