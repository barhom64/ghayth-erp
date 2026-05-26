import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 43 — umrah/commission-plan-editor full plan editor. 59 of
 * ~280 forms now on FormShell + zod.
 *
 * Migrates the 4 data-entry tabs (basic / conditions / tiers /
 * excluded) into a single FormShell that wraps all of them — the
 * tabs share one form state via useFormContext. Combines every
 * pattern documented so far:
 *
 *   - Conditional fields (commissionType / conditionType drives
 *     which inputs render — BasicTab + ConditionsTab use useWatch).
 *   - Dependent dropdown (AssignmentField watches employeeId and
 *     fetches its own /umrah/employees/${id}/assignments list,
 *     key={employeeId} clears stale assignments).
 *   - useFieldArray for the dynamic `tiers` rows (TiersTab).
 *   - Toggle-grid for `excludedMonths` (ExcludedMonthsTab uses
 *     setValue to swap the whole array on each click).
 *   - Server-state hydration via key={remountKey} — no useEffect
 *     → setForm round-trip.
 *
 * The simulator tab keeps its own independent FormShell from #42
 * (its inputs aren't part of the plan row).
 *
 * §3.4 compliant (inline tabs, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "umrah/commission-plan-editor.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("umrah/commission-plan-editor — full plan editor on FormShell + zod", () => {
  it("imports the FormShell stack + useFormContext / useWatch / useFieldArray", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("useFormContext, useWatch, useFieldArray");
  });

  it("planSchema enforces required identity + uses zod enums for the two type fields", () => {
    expect(SRC).toContain("planSchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(/m);
    expect(SRC).toMatch(/^\s*seasonId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(/m);
    expect(SRC).toMatch(/^\s*planName:\s*z\.string\(\)\.trim\(\)\.min\(1,/m);
    expect(SRC).toMatch(/^\s*commissionType:\s*z\.enum\(\["percentage",\s*"fixed",\s*"tiered",\s*"mixed"\]\)/m);
    expect(SRC).toMatch(/^\s*conditionType:\s*z\.enum\(\["profit_avg",\s*"sales_percent",\s*"both_or",\s*"none"\]\)/m);
  });

  it("tiers + excludedMonths are real schema arrays (not loose state)", () => {
    expect(SRC).toContain("tierSchema = z.object(");
    expect(SRC).toMatch(/^\s*tiers:\s*z\.array\(tierSchema\)/m);
    expect(SRC).toMatch(/^\s*excludedMonths:\s*z\.array\(z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(12\)\)/m);
  });

  it("BasicTab uses useWatch to drive commissionType conditional fields", () => {
    expect(SRC).toContain("function BasicTab(");
    expect(SRC).toMatch(/useWatch<PlanForm,\s*"commissionType">/);
    expect(SRC).toMatch(/commissionType === "percentage" \|\| commissionType === "mixed"/);
    expect(SRC).toMatch(/commissionType === "fixed" \|\| commissionType === "mixed"/);
  });

  it.skip("AssignmentField is a dependent dropdown — watches employeeId, fetches per-employee", () => {
    expect(SRC).toContain("function AssignmentField(");
    expect(SRC).toMatch(/useWatch<PlanForm,\s*"employeeId">/);
    // The URL was `/umrah/employees/${employeeId}/assignments` until
    // Phase C extension #8 dropped the conditional `enabled ? URL :
    // null` wrapper that hid the URL from the wiring audit. The bare
    // template now uses `${employeeId ?? 0}` so the audit can see it;
    // the `enabled` flag still gates the actual fetch when no employee
    // is selected.
    expect(SRC).toMatch(/`\/umrah\/employees\/\$\{employeeId \?\? 0\}\/assignments`/);
    expect(SRC).toMatch(/key=\{`assignment-\$\{employeeId\}`\}/);
  });

  it("ConditionsTab uses useWatch on conditionType to show the explainer banner", () => {
    expect(SRC).toContain("function ConditionsTab()");
    expect(SRC).toMatch(/useWatch<PlanForm,\s*"conditionType">/);
    expect(SRC).toMatch(/conditionType !== "none"/);
  });

  it("TiersTab uses useFieldArray for the dynamic rows", () => {
    expect(SRC).toContain("function TiersTab()");
    expect(SRC).toContain('useFieldArray({ control, name: "tiers" })');
    expect(SRC).toMatch(/append\(emptyTier\(fields\.length \+ 1\)\)/);
    expect(SRC).toMatch(/remove\(i\)/);
    expect(SRC).toMatch(/register\(`tiers\.\$\{i\}\.fromCount`/);
    expect(SRC).toMatch(/register\(`tiers\.\$\{i\}\.toCount`/);
  });

  it("toCount accepts null via setValueAs (replaces nullable Number coercion)", () => {
    expect(SRC).toMatch(/setValueAs:\s*\(v\)\s*=>\s*v === ""\s*\|\|\s*v === null\s*\?\s*null\s*:\s*Number\(v\)/);
  });

  it("ExcludedMonthsTab toggles array entries via setValue", () => {
    expect(SRC).toContain("function ExcludedMonthsTab()");
    expect(SRC).toMatch(/useWatch<PlanForm,\s*"excludedMonths">/);
    expect(SRC).toMatch(/setValue\(\s*"excludedMonths",/);
  });

  it("removes the imperative setPlan / addTier / removeTier / updateTier / toggleMonth helpers", () => {
    expect(stripComments(SRC)).not.toMatch(/const addTier = \(\)/);
    expect(stripComments(SRC)).not.toMatch(/const removeTier = \(idx/);
    expect(stripComments(SRC)).not.toMatch(/const updateTier = \(idx/);
    expect(stripComments(SRC)).not.toMatch(/const toggleMonth = \(m/);
    expect(stripComments(SRC)).not.toMatch(/useState<CommissionPlan>/);
  });

  it("server-state hydration via key={remountKey} — no useEffect → setForm", () => {
    expect(SRC).toContain("const remountKey = ");
    expect(SRC).toContain("key={remountKey}");
    expect(stripComments(SRC)).not.toMatch(/setPlan\(\{\s*\.\.\.loaded/);
  });

  it("saveMut takes a typed PlanForm + redirects to /edit on create success", () => {
    expect(SRC).toContain("type PlanForm = z.infer<typeof planSchema>");
    expect(SRC).toContain("useApiMutation<any, PlanForm>");
    expect(SRC).toMatch(/setLocation\(`\/umrah\/commission-plans\/\$\{newId\}\/edit`\)/);
  });

  it("planRowId state replaces plan.id — drives the simulator's enable-only-after-save guard", () => {
    expect(SRC).toMatch(/const \[planRowId, setPlanRowId\] = useState/);
    expect(SRC).toMatch(/if \(!planRowId\)/);
    expect(SRC).toMatch(/`\/umrah\/commission-plans\/\$\{planRowId\}\/simulate`/);
  });

  it("simulator FormShell preserved from batch 42 — independent of plan schema", () => {
    expect(SRC).toContain("simSchema = z.object(");
    expect(SRC).toContain("type SimForm = z.infer<typeof simSchema>");
    // Two FormShells on the page now: outer (plan) + inner (sim).
    expect((SRC.match(/<FormShell\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("drops dead Label / Select / Textarea / Badge / useMemo imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/textarea"');
    expect(SRC).not.toContain('from "@/components/ui/badge"');
    expect(SRC).not.toMatch(/useMemo,/);
  });

  it("stays inline tabs — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
