/**
 * PR-10 (#2077) — Closure Gate: «الامتثال والجزاءات» link gated
 * behind explicit discipline/violations grants.
 *
 * The product rule is «لا تظهر للمستخدم شيئًا لا يستطيع فتحه». The
 * backend already 403s anyone without the grant; this UX pin makes the
 * sidebar hide the link too for those personas (most importantly
 * payroll_officer, whose lane is الرواتب فقط).
 *
 * The pin is a registry-shape pin, not a render pin: rebuilding the
 * sidebar runtime was forbidden by the PR-10 scope. We assert the
 * data the existing filter consumes — its semantics are tested
 * elsewhere (sidebar-layout) and this just verifies we configured the
 * parent + every discipline child correctly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const NAV = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");

/** Slice the «الامتثال والجزاءات» group block from the registry. */
function complianceGroup(): string {
  const start = NAV.indexOf('label: "الامتثال والجزاءات"');
  expect(start, "compliance group not found in registry").toBeGreaterThan(-1);
  // Group block ends at the next `]},` after `children: [`.
  const end = NAV.indexOf("]},", start);
  return NAV.slice(start, end + 3);
}

describe("PR-10 (#2077) — «الامتثال والجزاءات» gate", () => {
  const block = complianceGroup();

  it("parent gate is permMode:any over the violations/discipline feature keys", () => {
    // permMode:"any" so a user with any one of the four perms still
    // sees the link; otherwise it hides. hr_manager has hr:* projected
    // → wildcard satisfies → still visible (proven live in section E).
    expect(block).toMatch(/perm: \["hr\.violations:view", "hr\.violations:list", "hr\.discipline:view", "hr\.discipline:list"\], permMode: "any"/);
  });

  it("every discipline-flavoured child carries the discipline perm gate", () => {
    for (const label of ["المحاضر التأديبية", "تصعيد العقوبات", "لائحة الانضباط"]) {
      const re = new RegExp(`label: "${label}"[^}]*perm: \\["hr\\.discipline:view","hr\\.discipline:list"\\][^}]*permMode: "any"`);
      expect(block, `${label} missing discipline perm`).toMatch(re);
    }
  });

  it("every violations-flavoured child carries the violations perm gate", () => {
    // HR-REV-7 (#2226): «إدارة المخالفات» (/hr/violations/management) أُزيل من
    // القائمة (دمج إلى /hr/violations المبوّبة؛ المسار يبقى deep-link). البقية
    // ما زالت تحمل بوابة المخالفات.
    for (const label of ["نظرة عامة على المخالفات", "الرصد التلقائي"]) {
      const re = new RegExp(`label: "${label}"[^}]*perm: \\["hr\\.violations:view","hr\\.violations:list"\\][^}]*permMode: "any"`);
      expect(block, `${label} missing violations perm`).toMatch(re);
    }
  });

  it("Saudization + WPS stay on their own perms (finance/payroll personas keep them)", () => {
    expect(block).toMatch(/السعودة \(نطاقات\)[\s\S]*perm: \["hr\.saudization:view","hr\.saudization:list"\]/);
    expect(block).toMatch(/WPS \/ مدد \/ بنوك[\s\S]*perm: \["hr\.payroll\.wps:view","hr\.payroll\.wps:list"\]/);
  });

  it("group still routes at /hr/violations (registry path-doubling guard)", () => {
    // The audit-route-doubling check fails on duplicated mounts; the
    // gate is metadata-only, the path stays the canonical one.
    expect(block).toMatch(/path: "\/hr\/violations"/);
  });
});
