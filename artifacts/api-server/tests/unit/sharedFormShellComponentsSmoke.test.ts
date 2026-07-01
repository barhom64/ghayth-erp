import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared-component FormShell adoption smoke test.
 *
 * After the page-level forms migration crossed 50% adoption, the next
 * lever was migrating *shared* components that fan out across many
 * pages. Four were converted in the 2026-05-25 sweep:
 *
 *   • entity-comments add-comment row             — every detail page
 *   • entity-selects QuickCreateDialog            — 10+ entity pickers
 *   • detail-edit-delete-actions InlineEditCard   — 18 detail pages
 *   • approval-actions ApprovalActions            — 33 approval pages
 *
 * Reverting any one of these to local useState would silently regress
 * the indirect-FormShell counts in forms-migration-report.md and lose
 * VALIDATION_ERROR field-error forwarding for every consumer. This
 * file pins the FormShell import + the signature shape that distinguishes
 * a real FormShell adoption from the legacy useState pattern.
 */
const COMPONENTS = join(
  import.meta.dirname!,
  "../../../../artifacts/ghayth-erp/src/components",
);

function readSrc(relPath: string): string {
  return readFileSync(join(COMPONENTS, relPath), "utf8");
}

describe("shared/* components on FormShell", () => {
  it("entity-comments add-comment row uses FormShell + zod.string().min(1)", () => {
    const src = readSrc("shared/entity-comments.tsx");
    expect(src).toContain('from "@workspace/ui-core"');
    expect(src).toContain("FormShell");
    expect(src).toContain('z.string().min(1');
    // hideSubmit because the Send button has type="submit" and lives
    // inline in the flex row, not in the default footer.
    expect(src).toMatch(/<FormShell[\s\S]+hideSubmit/);
    // ctx.reset() replaces the manual setBody(""); the old useState pair
    // ({ body, sending }) is gone.
    expect(src).toContain("ctx.reset()");
    expect(src).not.toMatch(/useState<string>\(""\)\s*;\s*\/\/?\s*body/);
  });

  it("allow-create-drawer GenericCreateForm builds a runtime zod schema (absorbed QuickCreateDialog)", () => {
    // The field-driven create form was unified into AllowCreateDrawer's
    // GenericCreateForm (QuickCreateDialog retired); the FormShell + zod-from-
    // fields plumbing now lives here, hosted in the same drawer.
    const src = readSrc("shared/allow-create-drawer.tsx");
    expect(src).toContain("FormShell");
    expect(src).toContain("FormTextField");
    // Per-field schema construction — `required: true` becomes
    // z.string().min(1, "مطلوب"), otherwise plain z.string().
    expect(src).toContain("schemaShape");
    expect(src).toMatch(/z\.object\(schemaShape\)/);
    // Mounted only while the drawer is open ({open && …}), so inputs clear
    // between consecutive create flows without an explicit reset.
    expect(src).toMatch(/\{open && \(/);
  });

  it("detail-edit-delete-actions InlineEditCard owns its own FormShell", () => {
    const src = readSrc("shared/detail-edit-delete-actions.tsx");
    expect(src).toContain("FormShell");
    // The hook now exposes submitEdit(values) instead of form/setForm —
    // calling sites can't reach into the form state directly anymore.
    expect(src).toContain("submitEdit");
    expect(src).not.toMatch(/^\s*setForm,/m);
    // editSchema built from the declarative `fields` array, with date
    // ISO-string splitting preserved as a defaults transform.
    expect(src).toMatch(/const editSchema = z\.object\(schemaShape\)/);
  });

  it("approval-actions ApprovalActions uses a per-action zod schema", () => {
    const src = readSrc("approval-actions.tsx");
    expect(src).toContain('from "@workspace/ui-core"');
    expect(src).toContain("FormShell");
    // notesRequired flips the schema's notes field; referRequired flips
    // the referredTo field. Both are derived from `action`, and FormShell
    // remounts on key={action} so the schema re-seeds when the user
    // switches verbs.
    expect(src).toContain("notesRequired");
    expect(src).toContain("referRequired");
    expect(src).toMatch(/key=\{action\}/);
    // The "missing required field" toast guard is gone — zod handles it.
    expect(src).not.toMatch(/toast\(\{[\s\S]{0,80}يجب ذكر سبب الرفض/);
    // rateLimitAware is now on the submit button.
    expect(src).toMatch(/<Button\s+type="submit"[\s\S]{0,160}rateLimitAware/);
  });

  it("workflow-kit re-exports the migrated ApprovalActions surface", () => {
    const kit = readFileSync(
      join(
        import.meta.dirname!,
        "../../../../lib/workflow-kit/src/index.ts",
      ),
      "utf8",
    );
    // The kit is a re-export shim — once the migration was done in
    // artifacts/.../approval-actions.tsx every workflow-kit consumer
    // got the new shape for free. Pin the wiring so the shim doesn't
    // get redirected away.
    expect(kit).toContain("ApprovalActions");
    expect(kit).toContain(
      "../../../artifacts/ghayth-erp/src/components/approval-actions",
    );
  });
});

describe("useDirtyGuard shared hook", () => {
  const HOOK_SRC = readFileSync(
    join(
      import.meta.dirname!,
      "../../../../artifacts/ghayth-erp/src/hooks/use-dirty-guard.tsx",
    ),
    "utf8",
  );
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }
  const HOOK_CODE = stripComments(HOOK_SRC);

  it("hook lives under src/hooks/ and uses AlertDialog primitives", () => {
    // The hook is the canonical replacement for the OS-default
    // window.confirm() that used to fire from Dialog onOpenChange
    // handlers. The native-confirm-or-prompt lint rule is what blocks
    // regressions; this fixture pins the actual AlertDialog wiring so
    // the hook can't silently degrade back to window.confirm() the
    // way the lint rule's skip-list might allow.
    expect(HOOK_SRC).toContain('from "@/components/ui/alert-dialog"');
    expect(HOOK_SRC).toMatch(/export function useDirtyGuard\b/);
    expect(HOOK_SRC).toMatch(/guardedClose:\s*\(open:\s*boolean\)\s*=>\s*void/);
    expect(HOOK_SRC).toMatch(/discardDialog:\s*ReactNode/);
    // RTL + dark-mode wiring on the AlertDialog content
    expect(HOOK_SRC).toContain('dir="rtl"');
    // The hook itself must not CALL window.confirm — the lint rule
    // exempts use-lifecycle-action but not this file. The docstring
    // mentions "window.confirm(...)" in plain text to explain what
    // the hook replaces, so we strip comments before checking.
    expect(HOOK_CODE).not.toMatch(/window\.confirm\b/);
  });

  it("fiscal-periods-v2 imports the shared hook, not a local copy", () => {
    const page = readFileSync(
      join(
        import.meta.dirname!,
        "../../../../artifacts/ghayth-erp/src/pages/finance/fiscal-periods-v2.tsx",
      ),
      "utf8",
    );
    expect(page).toContain('from "@/hooks/use-dirty-guard"');
    expect(page).toContain("useDirtyGuard");
    // No leftover local definition of the same hook name.
    expect(page).not.toMatch(/^function useDirtyGuard\b/m);
    // And no leftover window.confirm — the migration is complete.
    expect(page).not.toMatch(/window\.confirm/);
  });
});
