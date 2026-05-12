import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Final batch of native-dialog cleanup. The audit's original counts
 * were 3 × prompt + 8 × confirm + 2 × alert. After #283 + #287 + #290
 * + this PR the pages/ tree should be at 0/0/0.
 *
 * Migrations in this PR (8 sites):
 *
 *   admin/rbac-v2-sod-tab.tsx          → ConfirmDeleteDialog
 *   settings/workflow-definitions-tab  → ConfirmDeleteDialog
 *   settings/branches-tab.tsx          → ConfirmDeleteDialog
 *   settings/companies-tab.tsx         → ConfirmDeleteDialog
 *   settings.tsx (CrudSection)         → ConfirmDeleteDialog (generic — endpoint-driven)
 *   daily-close.tsx                    → AlertDialog (normal + force-close modes)
 *   hr/discipline-regulation.tsx       → AlertDialog (reseed defaults)
 *   finance/year-end-close.tsx         → AlertDialog (most destructive — locks the year)
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function callsConfirm(src: string): boolean {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /(?<![A-Za-z_$])(?:window\.)?confirm\s*\(/.test(stripped);
}

describe("admin/rbac-v2-sod-tab — delete via ConfirmDeleteDialog", () => {
  const SRC = read("admin/rbac-v2-sod-tab.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("imports ConfirmDeleteDialog", () => {
    expect(SRC).toContain('import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog"');
  });
  it("tracks rule being deleted as typed state", () => {
    expect(SRC).toContain("useState<SodRule | null>(null)");
  });
  it("wires dialog with rbac_sod_rule type + correct deletePath + invalidateKeys", () => {
    expect(SRC).toMatch(/type:\s*"rbac_sod_rule"/);
    expect(SRC).toMatch(/deletePath=\{`\/rbac\/v2\/sod\/\$\{deletingRule\?\.id\}`\}/);
    expect(SRC).toMatch(/invalidateKeys=\{\[\["rbac-sod"\]\]\}/);
  });
});

describe("settings/workflow-definitions-tab — delete via ConfirmDeleteDialog", () => {
  const SRC = read("settings/workflow-definitions-tab.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("removes the now-dead handleDelete + inline apiFetch", () => {
    // The original handleDelete is gone (DELETE moved into the dialog).
    expect(SRC).not.toMatch(/const handleDelete = async \(id: number\) => \{/);
  });
  it("mounts ConfirmDeleteDialog with workflow_definition type", () => {
    expect(SRC).toMatch(/type:\s*"workflow_definition"/);
  });
});

describe("settings/branches-tab — delete via ConfirmDeleteDialog", () => {
  const SRC = read("settings/branches-tab.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("invalidates settings-branches on success", () => {
    expect(SRC).toMatch(/invalidateKeys=\{\[\["settings-branches"\]\]\}/);
  });
  it("calls refreshFilters() in onDeleted (cross-tenant filter pickers depend on it)", () => {
    expect(SRC).toContain("refreshFilters()");
  });
});

describe("settings/companies-tab — delete via ConfirmDeleteDialog", () => {
  const SRC = read("settings/companies-tab.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("uses company entity type + invalidates correctly", () => {
    expect(SRC).toMatch(/type:\s*"company"/);
    expect(SRC).toMatch(/invalidateKeys=\{\[\["settings-companies"\]\]\}/);
  });
});

describe("settings.tsx (CrudSection) — generic delete via ConfirmDeleteDialog (endpoint-driven)", () => {
  const SRC = read("settings.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("forwards the CrudSection's endpoint + queryKey into the dialog", () => {
    // CrudSection is reused across every settings sub-tab (currencies,
    // banks, departments, …) — the dialog must pick up `endpoint` and
    // `queryKey` from props, not hardcode them.
    expect(SRC).toContain("type: queryKey");
    expect(SRC).toMatch(/deletePath=\{`\$\{endpoint\}\/\$\{deletingItem\?\.id\}`\}/);
    expect(SRC).toMatch(/invalidateKeys=\{\[\[queryKey\]\]\}/);
  });
});

describe("daily-close — close (normal + force) via AlertDialog", () => {
  const SRC = read("daily-close.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("preserves both close paths (normal + force) via typed state", () => {
    expect(SRC).toContain('useState<null | "normal" | "force">(null)');
  });
  it("dialog title + description switch on closeMode", () => {
    expect(SRC).toContain("تجاوز قسري — إقفال اليوم");
    expect(SRC).toContain("إقفال اليوم");
    // The action calls closeMut.mutate with `force` derived from
    // closeMode, not from a separate state variable.
    expect(SRC).toMatch(/const force = closeMode === "force";/);
  });
});

describe("hr/discipline-regulation — reseed defaults via AlertDialog", () => {
  const SRC = read("hr/discipline-regulation.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("preserves reseedMut call on confirm", () => {
    // Old: confirm() → reseedMut.mutate({}); inline.
    // New: AlertDialogAction onClick → setReseedAsk(false); reseedMut.mutate({});
    expect(SRC).toMatch(/reseedMut\.mutate\(\{\}\)/);
  });
});

describe("finance/year-end-close — most destructive op via AlertDialog", () => {
  const SRC = read("finance/year-end-close.tsx");
  it("no longer calls confirm()", () => { expect(callsConfirm(SRC)).toBe(false); });
  it("interpolates the year being closed into the dialog title", () => {
    expect(SRC).toMatch(/تأكيد إقفال السنة المالية \{year\}/);
  });
  it("preserves the 'preview first' guard before opening the dialog", () => {
    // The original flow refused to call confirm() unless preview ran.
    // The migration must keep that guard in place — opening the dialog
    // before previewing leaves a hole.
    expect(SRC).toMatch(/if \(!preview\) \{[\s\S]*setConfirmingClose\(true\);/);
  });
});

describe("pages/ — confirm() is now extinct", () => {
  // Defence-in-depth: anything that re-introduces confirm() in any
  // page-level file flips this assertion.
  const ALL_PAGES = [
    "admin/rbac-v2-sod-tab.tsx",
    "settings/workflow-definitions-tab.tsx",
    "settings/branches-tab.tsx",
    "settings/companies-tab.tsx",
    "settings.tsx",
    "daily-close.tsx",
    "hr/discipline-regulation.tsx",
    "finance/year-end-close.tsx",
  ];
  it.each(ALL_PAGES)("%s contains no confirm() call", (p) => {
    expect(callsConfirm(read(p))).toBe(false);
  });
});
