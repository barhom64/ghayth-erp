/**
 * HR CSV export adoption ratchet.
 *
 * Closes audit gap T1-4 ("zero CSV export smoke tests for HR list
 * pages"). HR list pages should expose `onExportCSV` on their
 * AdvancedFilters bar so users can download the same filtered slice
 * they're viewing. The unified export helper (exportToCSV from
 * @workspace/ui-core) wraps the canonical exportRowsToCsv from
 * @/lib/unified-export — it adds the BOM, RFC-4180 escaping, and the
 * print_jobs telemetry row.
 *
 * The ratchet asserts that each page below imports `exportToCSV` and
 * wires it into `onExportCSV` on AdvancedFilters. If any page below
 * loses the prop, this guard fails so the regression is caught before
 * users discover the missing button.
 *
 * Extend the list as new pages adopt the pattern — the ratchet only
 * grows, never shrinks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGES_ROOT = join(
  REPO_ROOT,
  "artifacts",
  "ghayth-erp",
  "src",
  "pages",
);

// Each entry: the relative path under pages/ + the human label that
// must appear in the CSV column list (catches accidental empty header
// configs).
const ADOPTED_PAGES: ReadonlyArray<{ path: string; sampleHeader: string }> = [
  { path: "employees.tsx", sampleHeader: "الاسم" },
  { path: "hr/attendance.tsx", sampleHeader: "وقت الحضور" },
  { path: "hr/leaves.tsx", sampleHeader: "نوع الإجازة" },
  { path: "hr/training.tsx", sampleHeader: "عنوان البرنامج" },
  { path: "hr/documents.tsx", sampleHeader: "نوع الوثيقة" },
  { path: "hr/transfers.tsx", sampleHeader: "الفرع المنقول إليه" },
  { path: "hr/payroll.tsx", sampleHeader: "إجمالي الصافي" },
  { path: "hr/official-letters.tsx", sampleHeader: "رقم الخطاب" },
  { path: "hr/excuse-requests.tsx", sampleHeader: "تاريخ الاستئذان" },
  { path: "hr/performance.tsx", sampleHeader: "التقييم الإجمالي" },
  { path: "hr/expiring-documents.tsx", sampleHeader: "أيام للانتهاء" },
  { path: "hr/attendance-reports.tsx", sampleHeader: "إجمالي دقائق التأخر" },
  { path: "hr/shifts.tsx", sampleHeader: "تعيينات-الورديات" },
  { path: "hr/violations.tsx", sampleHeader: "رقم المحضر" },
  { path: "hr/evaluation-360.tsx", sampleHeader: "تقييم الزملاء" },
  { path: "hr/wps-runs.tsx", sampleHeader: "ملفات-WPS" },
  { path: "hr/onboarding-review.tsx", sampleHeader: "خطوات مكتملة" },
  { path: "hr/employee-activation.tsx", sampleHeader: "تنشيط-حسابات-الموظفين" },
  { path: "hr/recruitment.tsx", sampleHeader: "" },
  { path: "hr/turnover-report.tsx", sampleHeader: "" },
  { path: "hr/overtime.tsx", sampleHeader: "" },
  { path: "hr/exit-requests.tsx", sampleHeader: "" },
  { path: "hr/loans.tsx", sampleHeader: "" },
  // hr/violations-management.tsx retired (HR-REV-7) — its list + CSV export
  // moved into the «المخالفات الخام» tab of hr/violations.tsx (already listed
  // above), so adoption is still covered there.
  { path: "hr/salary-components.tsx", sampleHeader: "مكونات-الرواتب" },
  { path: "hr/idp.tsx", sampleHeader: "خطط-التطوير-الفردي" },
  { path: "hr/approval-chains.tsx", sampleHeader: "مراحل-الاعتماد" },
  { path: "hr/application-list.tsx", sampleHeader: "قائمة-المتقدمين" },
];

function readPage(rel: string): string {
  return readFileSync(join(PAGES_ROOT, rel), "utf8");
}

describe("HR CSV export — every listed page wires exportToCSV", () => {
  for (const { path, sampleHeader } of ADOPTED_PAGES) {
    describe(path, () => {
      const src = readPage(path);

      it("imports exportToCSV from @workspace/ui-core", () => {
        expect(src).toMatch(/exportToCSV[\s,}]/);
        expect(src).toContain('@workspace/ui-core');
      });

      it("either passes onExportCSV to AdvancedFilters or wires csvColumns into BulkActionsBar", () => {
        // Two valid wiring patterns ship today:
        //   1. <AdvancedFilters ... onExportCSV={...} />
        //   2. <BulkActionsBar ... actions={["export"]} csvColumns={[...]} />
        // Either way the user gets a CSV button. Pages that use neither
        // would silently lose the export functionality.
        const usesAdvancedFiltersExport = /onExportCSV\s*=\s*\{/.test(src);
        const usesBulkExport =
          /csvColumns\s*=\s*\[/.test(src) && /actions=\{[^}]*"export"[^}]*\]/.test(src);
        expect(
          usesAdvancedFiltersExport || usesBulkExport,
          `${path} must expose a CSV export path (AdvancedFilters.onExportCSV OR BulkActionsBar.csvColumns)`,
        ).toBe(true);
      });

      if (sampleHeader) {
        it(`column list mentions a real label ("${sampleHeader}")`, () => {
          expect(src).toContain(sampleHeader);
        });
      }
    });
  }

  // Floor lowered 28 → 27 once (HR-REV-7) when violations-management.tsx was
  // retired and its CSV export folded into violations.tsx. Otherwise grows-only.
  it("ratchet never shrinks — minimum 27 HR pages with CSV export", () => {
    expect(ADOPTED_PAGES.length).toBeGreaterThanOrEqual(27);
  });
});

// ─── exportToCSV API contract — column shape stays stable ───────────────────

describe("exportToCSV column descriptors use {key, label} pairs", () => {
  // The CSV writer reads `key` to pluck the field from each row and
  // `label` for the header cell. Anything else (raw strings, missing
  // either field) misformats the file. Pin the shape so future
  // refactors don't drop the keys silently.
  for (const { path } of ADOPTED_PAGES.slice(0, 4)) {
    it(`${path} CSV column literals carry key + label`, () => {
      const src = readPage(path);
      // The four pages above all use the exportToCSV(rows, [{key,label},...])
      // call shape. We don't try to parse the column array out — JSX
      // and embedded function literals defeat naive regex. Instead we
      // assert that close to the exportToCSV / csvColumns site, we
      // can find at least 3 `{ key:` + `label:` pairs.
      const keyCount = (src.match(/key\s*:\s*"[a-zA-Z]/g) ?? []).length;
      const labelCount = (src.match(/label\s*:\s*"/g) ?? []).length;
      expect(keyCount, `${path} should declare key: literals`).toBeGreaterThanOrEqual(3);
      expect(labelCount, `${path} should declare label: literals`).toBeGreaterThanOrEqual(3);
    });
  }
});
