import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 38 — admin/rbac-v2-jit-tab (Just-In-Time permission request
 * form). 54 of ~280 forms now on FormShell + zod.
 *
 * Combines #372's two new patterns:
 *
 * 1. **Dialog → inline Card**: the old `RequestDialog` shadcn modal
 *    is replaced by a toggleable inline Card above the tabs. §3.4.
 *
 * 2. **Dependent dropdowns**: action + scope option lists derive
 *    from the selected feature's `available_*` arrays. ActionField
 *    and ScopeField each watch `featureKey` and use `key=` remount
 *    so stale values can't survive a feature change.
 *
 * Also introduces tiny `useWatch` subcomponents for live readouts:
 *   - MinutesHint converts `requestedMinutes` to a human "X ساعة Y د".
 *   - JustificationCounter shows `justification.length / 500`.
 *
 * The DecisionDialog (approve / reject confirmation) stays as a
 * shadcn Dialog — it's a destructive-action confirm with a notes
 * field, not create/edit (§3.4 only forbids modals for create/edit).
 *
 * Schema enforces:
 *   - justification ≥ 10 chars (was a manual toast guard)
 *   - requestedMinutes coerced int, 5..1440
 *   - all 3 selects required
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "admin/rbac-v2-jit-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("admin/rbac-v2-jit-tab — RequestDialog → inline, DecisionDialog preserved", () => {
  it("imports the FormShell stack + useFormContext/useWatch + zod", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("jitRequestSchema enforces justification ≥10 and minutes 5..1440", () => {
    expect(SRC).toContain("jitRequestSchema = z.object(");
    expect(SRC).toMatch(/justification:\s*z\.string\(\)\.trim\(\)\.min\(10,/);
    expect(SRC).toMatch(/requestedMinutes:\s*z\.coerce\.number\(\)\.int\(\)\.min\(5\)\.max\(1440\)/);
  });

  it("RequestDialog REMOVED — replaced by inline JitRequestForm", () => {
    expect(stripComments(SRC)).not.toMatch(/function RequestDialog\(/);
    expect(SRC).toContain("function JitRequestForm(");
    expect(SRC).toMatch(/\{showRequest && \(\s*<Card/);
  });

  it("DecisionDialog preserved — destructive-action confirm, not create/edit", () => {
    // §3.4 only forbids modals for create/edit; approve/reject
    // confirms with a reason field are still allowed.
    expect(SRC).toContain("function DecisionDialog(");
  });

  it("dependent dropdowns via ActionField + ScopeField (useWatch + key remount)", () => {
    expect(SRC).toContain("function ActionField(");
    expect(SRC).toContain("function ScopeField(");
    expect(SRC).toMatch(/useWatch<JitRequestForm,\s*"featureKey">/);
    expect(SRC).toContain('key={`action-${selectedFeature}`}');
    expect(SRC).toContain('key={`scope-${selectedFeature}`}');
  });

  it("MinutesHint + JustificationCounter live readouts via useWatch", () => {
    expect(SRC).toContain("function MinutesHint()");
    expect(SRC).toContain("function JustificationCounter()");
    expect(SRC).toMatch(/useWatch<JitRequestForm,\s*"requestedMinutes">/);
    expect(SRC).toMatch(/useWatch<JitRequestForm,\s*"justification">/);
  });

  it("removes the imperative justification.length < 10 toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/form\.justification\.length < 10/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*featureKey:\s*""\s*,\s*action:\s*"view"/);
  });

  it("drops Input + Select imports — FormShell renders them", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("submit takes typed JitRequestForm + POSTs to /rbac/v2/jit/request", () => {
    expect(SRC).toContain("type JitRequestForm = z.infer<typeof jitRequestSchema>");
    expect(SRC).toContain("const submit = async (values: JitRequestForm)");
    expect(SRC).toContain('apiFetch("/rbac/v2/jit/request"');
  });

  it("inline Card is toggled by the parent showRequest state", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setShowRequest\(!showRequest\)\}/);
  });
});
