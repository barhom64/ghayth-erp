/**
 * PR-6 (#2077) — Employee 360° tabs pin.
 *
 * The deep audit (docs/hr/HR_FIVE_AREAS_DEEP_AUDIT.md §١) flagged
 * three missing sections on the employee detail page:
 *   • الوثائق — endpoint GET /employees/documents existed but the
 *     page never called it.
 *   • النشاط — no audit_logs reading on the page; HR forensics had
 *     to leave to /audit-logs.
 *   • التقييم — institutional score lived as a widget on the
 *     overview tab + a separate /hr/employees/:id/score page; no
 *     tab inside the 360 that surfaces history with rationale.
 *
 * PR-6 wires the three tabs to existing endpoints, adds tab status
 * badges («مكتمل / ناقص / يحتاج إجراء / غير مصرح») across all 17
 * tabs, and shows operational summaries inside each tab (not just
 * deep links). Pure aggregation — no new backend.
 *
 * Source-only test; the 4-persona journey is the behavioural proof.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);

describe("PR-6 (#2077) — the 17-tab spine includes the 3 newly-added tabs", () => {
  for (const t of [
    { key: "documents", label: "الوثائق" },
    { key: "evaluation", label: "التقييم" },
    { key: "activity", label: "النشاط" },
  ]) {
    it(`tab «${t.label}» exists in TABS with key=${t.key}`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`key: "${t.key}",\\s*label: "${t.label}"`));
    });
    it(`tab «${t.label}» renders a content block`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`activeTab === "${t.key}"`));
    });
    it(`tab «${t.label}» has a data-testid attribute for the persona journey`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`data-testid="tab-content-${t.key}"`));
    });
  }
});

describe("PR-6 (#2077) — each new tab consumes an EXISTING endpoint (no new backend)", () => {
  it("documents reads /employees/documents (the endpoint the audit said was unused)", () => {
    expect(PAGE_SRC).toMatch(/useApiQuery<any>\(\s*\["employee-documents-list",[\s\S]{0,80}"\/employees\/documents"/);
  });
  it("activity reads /audit-logs/employees/:id (admin-gated server-side)", () => {
    expect(PAGE_SRC).toMatch(/useApiQuery<any>\(\s*\["employee-activity-audit",[\s\S]{0,120}\/audit-logs\/employees\/\$\{id\}/);
  });
  it("evaluation reads PR-4's /employees/:id/scoring/history endpoint", () => {
    expect(PAGE_SRC).toMatch(/useApiQuery<any>\(\s*\["employee-scoring-history",[\s\S]{0,160}\/employees\/\$\{id\}\/scoring\/history/);
  });
});

describe("PR-6 (#2077) — each query is gated on activeTab so it only fires when needed", () => {
  // The doctrine forbids «pay-on-page-load for sections the operator
  // never opens». Each query carries `enabled: !!id && activeTab === X`
  // so a session that only views the overview pays exactly ONE call
  // (the /employees/:id base call) — not three.
  it("documents query is gated on activeTab === 'documents'", () => {
    expect(PAGE_SRC).toMatch(/employee-documents-list[\s\S]{0,200}enabled: !!id && activeTab === "documents"/);
  });
  it("activity query is gated on activeTab === 'activity'", () => {
    expect(PAGE_SRC).toMatch(/employee-activity-audit[\s\S]{0,200}enabled: !!id && activeTab === "activity"/);
  });
  it("evaluation query is gated on activeTab === 'evaluation'", () => {
    expect(PAGE_SRC).toMatch(/employee-scoring-history[\s\S]{0,200}enabled: !!id && activeTab === "evaluation"/);
  });
});

describe("PR-6 (#2077) — tab status badge system covers all 4 spec states", () => {
  it("TabStatus union spans the 4 mandated states", () => {
    expect(PAGE_SRC).toMatch(/type TabStatus = "complete" \| "missing" \| "action_needed" \| "forbidden"/);
  });
  it("Arabic labels match the spec verbatim", () => {
    for (const label of ["مكتمل", "ناقص", "يحتاج إجراء", "غير مصرح"]) {
      expect(PAGE_SRC).toContain(label);
    }
  });
  it("every tab button carries a `data-tab-status` attribute (for the journey assertion)", () => {
    expect(PAGE_SRC).toMatch(/data-tab-status=\{status\}/);
  });
  it("the tab status map (tabStatus) declares all 17 tab keys", () => {
    // The map is typed as Record<TabKey, TabStatus> — TypeScript
    // enforces exhaustiveness. We confirm presence of each key in
    // source so a careless deletion is still surfaced as a smoke
    // failure (TypeScript would also catch it at type-check time).
    for (const k of ["overview", "info", "documents", "titles", "account", "roles", "contract", "attendance", "leaves", "custodies", "payroll", "violations", "evaluation", "tasks", "trainings", "activity", "finance"]) {
      expect(PAGE_SRC).toMatch(new RegExp(`\\s${k}:\\s`));
    }
  });
});

describe("PR-6 (#2077) — each new tab shows operational summary (not just deep links)", () => {
  it("documents tab surfaces the 4 government IDs inline (iqama, passport, work permit, …)", () => {
    expect(PAGE_SRC).toMatch(/الهوية \/ الإقامة[\s\S]{0,400}انتهاء الإقامة[\s\S]{0,400}رقم الجواز[\s\S]{0,400}رخصة العمل/);
  });
  it("documents tab flags expiring documents (within 90 days) as «يحتاج إجراء»", () => {
    expect(PAGE_SRC).toMatch(/expiringDocs[\s\S]{0,300}msIn90Days/);
  });
  it("evaluation tab shows the 6 dimension scores inline (not just a link)", () => {
    expect(PAGE_SRC).toMatch(/disciplineScore[\s\S]{0,200}activityScore[\s\S]{0,200}productivityScore[\s\S]{0,200}qualityScore[\s\S]{0,200}managerScore[\s\S]{0,200}developmentScore/);
  });
  it("evaluation tab links to the PR-4 detail page (the «full breakdown»)", () => {
    expect(PAGE_SRC).toMatch(/href=\{`\/hr\/employees\/\$\{id\}\/score`\}/);
  });
  it("activity tab handles 403 (forbidden) with «غير مصرح» state — not a crash", () => {
    expect(PAGE_SRC).toMatch(/activityForbidden \?[\s\S]{0,300}لا تملك صلاحية عرض سجل النشاط/);
    expect(PAGE_SRC).toMatch(/admin\.audit:view/);
  });
});

describe("PR-6 (#2077) — doctrine: documents endpoint is filtered client-side (no new backend)", () => {
  it("documents are filtered by employeeId in JS (since /employees/documents returns company-wide)", () => {
    expect(PAGE_SRC).toMatch(/allDocs[\s\S]{0,200}\.filter\(\(d: any\) => String\(d\.employeeId\) === String\(id\)\)/);
  });
});

describe("PR-6 (#2077) — no new useApiMutation on the new tabs (read-only surfaces)", () => {
  // The new tabs are PURE display. Edits to documents/evaluations/audit
  // happen on the canonical screens that own those mutations
  // (/hr/documents, /hr/employees/:id/score, /audit-logs). The page
  // links to them.
  it("the page does NOT add a mutation hook on the new tab content blocks", () => {
    // Pin the absence of useApiMutation INSIDE the three new content
    // blocks. The JSX blocks open with `{activeTab === "X" && (` —
    // matching from that exact shape avoids capturing the earlier
    // `enabled: !!id && activeTab === "X"` lines on the queries.
    const docBlock = PAGE_SRC.match(/\{activeTab === "documents" && \([\s\S]*?\n      \)\}/)?.[0] || "";
    const evalBlock = PAGE_SRC.match(/\{activeTab === "evaluation" && \([\s\S]*?\n      \)\}/)?.[0] || "";
    const actBlock = PAGE_SRC.match(/\{activeTab === "activity" && \([\s\S]*?\n      \)\}/)?.[0] || "";
    expect(docBlock, "documents block extracted").not.toBe("");
    expect(evalBlock, "evaluation block extracted").not.toBe("");
    expect(actBlock, "activity block extracted").not.toBe("");
    expect(docBlock).not.toMatch(/useApiMutation/);
    expect(evalBlock).not.toMatch(/useApiMutation/);
    expect(actBlock).not.toMatch(/useApiMutation/);
  });
});
