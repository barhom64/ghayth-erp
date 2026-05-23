import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 42 — umrah/commission-plan-editor simulator panel. 58 of
 * ~280 forms now on FormShell + zod.
 *
 * Partial migration of the page: the 4-field commission simulator
 * (totalMutamers / avgProfitPerVisa / salesPercent / avgSalePrice)
 * is migrated. The bigger `plan` editor (tiers array, excludedMonths,
 * conditions) stays on useState — multi-section form with its own
 * TiersEditor that warrants a separate batch.
 *
 * Schema enforces non-negative integers for totalMutamers,
 * non-negative numbers for the rest, and salesPercent ∈ [0, 100].
 *
 * §3.4 compliant (inline tab content, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "umrah/commission-plan-editor.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("umrah/commission-plan-editor — simulator on FormShell + zod", () => {
  it("imports the FormShell stack + zod", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormGrid");
    expect(SRC).toContain('from "zod"');
  });

  it("simSchema validates the 4 simulator inputs", () => {
    expect(SRC).toContain("simSchema = z.object(");
    expect(SRC).toMatch(/^\s*totalMutamers:\s*z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/m);
    expect(SRC).toMatch(/^\s*avgProfitPerVisa:\s*z\.coerce\.number\(\)\.nonnegative\(\)/m);
    expect(SRC).toMatch(/^\s*salesPercent:\s*z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/m);
    expect(SRC).toMatch(/^\s*avgSalePrice:\s*z\.coerce\.number\(\)\.nonnegative\(\)/m);
  });

  it("removes the simulator useState({totalMutamers, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*totalMutamers:\s*0\s*,\s*avgProfitPerVisa/);
  });

  it("runSim takes a typed SimForm + POSTs to the simulate endpoint", () => {
    expect(SRC).toContain("type SimForm = z.infer<typeof simSchema>");
    expect(SRC).toContain("const runSim = async (values: SimForm)");
    // Batch 43 replaced plan.id with planRowId after the plan
    // editor itself moved into FormShell — either match is fine.
    expect(SRC).toMatch(/apiFetch\(`\/umrah\/commission-plans\/\$\{(plan\.id|planRowId)\}\/simulate`/);
  });

  it("simBusy + simResult preserved as parent useState (status flags, not form data)", () => {
    expect(SRC).toMatch(/const \[simResult, setSimResult\] = useState<any>\(null\)/);
    expect(SRC).toMatch(/const \[simBusy, setSimBusy\] = useState\(false\)/);
  });

  it("simulator's parent page (plan editor) — migrated in batch 43", () => {
    // Originally this test guarded that the plan editor stayed on
    // useState. Batch 43 (#TBD) followed and migrated the plan
    // editor itself to FormShell + useFieldArray. The simSchema
    // and SimForm type still live in the same file, but the plan
    // state now goes through useFormContext.
    expect(SRC).toContain("planSchema = z.object(");
    expect(SRC).toContain("type PlanForm = z.infer<typeof planSchema>");
  });

  it("FormShell renders the submit button — replaces the GuardedButton onClick={runSim}", () => {
    expect(SRC).not.toMatch(/onClick=\{runSim\}/);
    expect(SRC).toContain('submitLabel={simBusy ? "جاري التشغيل..." : "تشغيل المحاكاة"}');
  });

  it("stays inline tab content — §3.4 (no modal)", () => {
    // Tab content is inline by definition; just verify no Dialog
    // crept in.
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
