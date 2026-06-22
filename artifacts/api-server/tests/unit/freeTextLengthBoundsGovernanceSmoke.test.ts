/**
 * حدّ أعلى لطول حقول النصّ الحرّ — دفعة الحوكمة (متابعة #2891/#2893). ~38 حقلًا عبر
 * مخطّطات الحوكمة (سياسات/مخاطر/مراجعات/امتثال/CAPA) كانت z.string() بلا .max():
 * title 500، description/findings/scope/mitigationPlan/rootCause/correctiveAction/
 * preventiveAction 5000، notes 2000. حدود سخيّة. اختبار ثابت — لا حقل نصّ حرّ بلا حدّ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GOV = readFileSync(join(import.meta.dirname!, "../../src/routes/governance.ts"), "utf8");

describe("free-text length bounds — governance", () => {
  it("no unbounded free-text field remains across all governance schemas", () => {
    const unbounded = /(title|description|notes|findings|mitigationPlan|rootCause|correctiveAction|preventiveAction|scope): z\.string\(\)(\.min\(1[^)]*\))?(\.optional\(\))?(\.nullable\(\))?,/;
    expect(unbounded.test(GOV)).toBe(false);
  });
  it("CAPA action fields + audit findings are capped at 5000", () => {
    expect((GOV.match(/(rootCause|correctiveAction|preventiveAction|findings|mitigationPlan): z\.string\(\)\.max\(5000,/g) || []).length).toBeGreaterThanOrEqual(8);
  });
  it("titles are capped at 500 (required + optional)", () => {
    expect((GOV.match(/title: z\.string\(\)(\.min\(1[^)]*\))?\.max\(500,/g) || []).length).toBeGreaterThanOrEqual(8);
  });
});
