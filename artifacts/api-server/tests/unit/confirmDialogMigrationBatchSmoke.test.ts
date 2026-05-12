import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch migration of native `window.confirm()` calls. Per the audit
 * ("8 × confirm + 2 × alert + 3 × prompt" — the prompts landed in
 * #283 + #287), this PR handles 3 of the confirm sites:
 *
 *   properties-owners.tsx   (delete owner)      → ConfirmDeleteDialog
 *   hr/public-holidays.tsx  (delete holiday)    → ConfirmDeleteDialog
 *   warehouse/inventory-count.tsx (approve run) → AlertDialog (non-delete)
 *
 * Delete flows pick up the existing ConfirmDeleteDialog (with
 * impact-preview + 409-blocker surfacing). The non-delete approval
 * flow uses a fresh AlertDialog inline — keeping the existing
 * confirmApprove() apiFetch + toast path unchanged.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Match `confirm(` at word boundary as an actual call, after stripping
// comments — the page may still legitimately mention confirm() in a
// doc-comment explaining what the old code did.
function callsConfirm(src: string): boolean {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  return /(?<![A-Za-z_$])(?:window\.)?confirm\s*\(/.test(stripped);
}

describe("properties-owners — delete via ConfirmDeleteDialog", () => {
  const SRC = read("properties-owners.tsx");

  it("no longer calls confirm()", () => {
    expect(callsConfirm(SRC)).toBe(false);
  });

  it("imports ConfirmDeleteDialog", () => {
    expect(SRC).toContain(
      'import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog"',
    );
  });

  it("tracks the owner being deleted as typed state", () => {
    expect(SRC).toContain(
      "useState<{ id: number; name: string } | null>(null)",
    );
  });

  it("mounts ConfirmDeleteDialog with the right entity type + invalidate keys", () => {
    expect(SRC).toMatch(/type:\s*"property_owner"/);
    expect(SRC).toMatch(/deletePath=\{`\/properties\/owners\/\$\{deletingOwner\?\.id\}`\}/);
    expect(SRC).toMatch(/invalidateKeys=\{\[\["property-owners"\]\]\}/);
  });

  it("removes the stale useApiMutation import (delete now goes through the dialog)", () => {
    expect(SRC).not.toContain("useApiMutation");
  });
});

describe("hr/public-holidays — delete via ConfirmDeleteDialog", () => {
  const SRC = read("hr/public-holidays.tsx");

  it("no longer calls confirm()", () => {
    expect(callsConfirm(SRC)).toBe(false);
  });

  it("imports ConfirmDeleteDialog", () => {
    expect(SRC).toContain(
      'import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog"',
    );
  });

  it("removes the now-dead deleteMut + handleDelete pair", () => {
    // The old deleteMut + handleDelete combo is gone; the dialog owns
    // the DELETE. openDeleteDialog now just sets state.
    expect(SRC).not.toContain('"/hr/public-holidays/${body.id}"');
    expect(SRC).toContain("openDeleteDialog");
  });

  it("mounts ConfirmDeleteDialog with the right entity type", () => {
    expect(SRC).toMatch(/type:\s*"public_holiday"/);
    expect(SRC).toMatch(/deletePath=\{`\/hr\/public-holidays\/\$\{deletingHoliday\?\.id\}`\}/);
  });
});

describe("warehouse/inventory-count — approval via AlertDialog (non-delete)", () => {
  const SRC = read("warehouse/inventory-count.tsx");

  it("no longer calls confirm()", () => {
    expect(callsConfirm(SRC)).toBe(false);
  });

  it("imports AlertDialog primitives (no ConfirmDeleteDialog — not a delete)", () => {
    expect(SRC).toContain('from "@/components/ui/alert-dialog"');
    expect(SRC).toContain("AlertDialogAction");
    expect(SRC).toContain("AlertDialogCancel");
    expect(SRC).not.toContain("ConfirmDeleteDialog");
  });

  it("tracks the count being approved as typed state, not closure capture", () => {
    expect(SRC).toContain("useState<number | null>(null)");
    expect(SRC).toContain("setApproveTargetId");
  });

  it("preserves the existing apiFetch+toast behaviour inside confirmApprove()", () => {
    // The migration only swaps the input gate (native confirm → AlertDialog).
    // The actual approval call (apiFetch POST + toast) stays as-is so the
    // warning-on-success branch and the inventory adjustment count still work.
    expect(SRC).toMatch(/const confirmApprove = async \(countId: number\) => \{/);
    expect(SRC).toMatch(/\/warehouse\/inventory-counts\/\$\{countId\}\/approve/);
  });
});
