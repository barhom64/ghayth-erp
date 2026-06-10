import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1812 — rental-contracts list FE sub-stage filters.
 *
 * The four backend statuses (draft / active / completed / cancelled)
 * don't tell the operator WHERE inside an active rental the contract
 * sits. R7 (handover) and R9 (return) are encoded as timestamps on
 * the active row — handoverAt / returnedAt — added by migration 282.
 * The list page derives two visible sub-stages from those timestamps:
 *
 *   awaiting_handover — active AND handoverAt IS NULL
 *   awaiting_return   — active AND handoverAt set AND returnedAt IS NULL
 *
 * Pure FE — no schema or route changes. This test pins the SPA file's
 * classifier + the user-visible labels so they don't drift away from
 * the user's mandate ("في انتظار التسليم" / "في انتظار الإرجاع").
 */

const SRC = readFileSync(
  join(
    import.meta.dirname!,
    "../../../ghayth-erp/src/pages/fleet/rental-contracts.tsx",
  ),
  "utf8",
);

describe("#1812 — rental sub-stage classifier (FE)", () => {
  it("declares the SubStage union with both new derived states", () => {
    expect(SRC).toMatch(/type SubStage =[\s\S]*"awaiting_handover"/);
    expect(SRC).toMatch(/type SubStage =[\s\S]*"awaiting_return"/);
  });

  it("classifier maps backend status active + null handoverAt → awaiting_handover", () => {
    expect(SRC).toMatch(/if \(r\.handoverAt == null\) return "awaiting_handover"/);
  });

  it("classifier maps backend status active + null returnedAt → awaiting_return", () => {
    expect(SRC).toMatch(/if \(r\.returnedAt == null\) return "awaiting_return"/);
  });

  it("classifier passes through the three non-active backend statuses", () => {
    expect(SRC).toMatch(/if \(r\.status === "cancelled"\) return "cancelled"/);
    expect(SRC).toMatch(/if \(r\.status === "completed"\) return "completed"/);
    expect(SRC).toMatch(/if \(r\.status === "draft"\) return "draft"/);
  });
});

describe("#1812 — rental sub-stage labels (Arabic strings the user dictated)", () => {
  it("uses the exact Arabic labels from the user's mandate", () => {
    expect(SRC).toContain("في انتظار التسليم");
    expect(SRC).toContain("في انتظار الإرجاع");
  });

  it("SUB_STAGE_LABEL maps both derived sub-stages", () => {
    expect(SRC).toMatch(/awaiting_handover: +"في انتظار التسليم"/);
    expect(SRC).toMatch(/awaiting_return: +"في انتظار الإرجاع"/);
  });
});

describe("#1812 — sub-stage filters reach the backend as status=active", () => {
  it("DERIVED_SUB_STAGES contains both", () => {
    expect(SRC).toMatch(/DERIVED_SUB_STAGES = new Set<string>\(\["awaiting_handover", "awaiting_return"\]\)/);
  });

  it("backend query collapses the two derived stages onto status=active", () => {
    expect(SRC).toMatch(/DERIVED_SUB_STAGES\.has\(status\) \? "active" : status/);
  });

  it("client-side narrows the loaded set via classify()", () => {
    expect(SRC).toMatch(/DERIVED_SUB_STAGES\.has\(status\) && classify\(r\) !== status/);
  });
});

describe("#1812 — KPI cards drive the same filter via click", () => {
  it("KpiCard accepts onClick + active highlight", () => {
    expect(SRC).toMatch(/interface KpiCardProps\b[\s\S]{0,300}onClick\?: \(\) => void/);
    expect(SRC).toMatch(/active\?: boolean/);
  });

  it("the two new KPI cards setStatus to the matching derived stage", () => {
    expect(SRC).toMatch(/setStatus\("awaiting_handover"\)/);
    expect(SRC).toMatch(/setStatus\("awaiting_return"\)/);
  });
});

describe("#1812 — row badge reflects sub-stage, not raw status", () => {
  it("row badge uses classify(r) for tone + label", () => {
    expect(SRC).toMatch(/SUB_STAGE_TONE\[classify\(r\)\]/);
    expect(SRC).toMatch(/SUB_STAGE_LABEL\[classify\(r\)\]/);
  });
  it("dead raw-status maps were removed (single source of truth = SUB_STAGE_*)", () => {
    expect(SRC).not.toMatch(/STATUS_LABEL: Record/);
    expect(SRC).not.toMatch(/STATUS_TONE: Record/);
  });
});
