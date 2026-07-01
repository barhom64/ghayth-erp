/**
 * page-status-badge — resolveStatus tests. Batch 7 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * STATUS_MAP + resolveStatus are the single source of truth behind every status
 * chip in the app: a status string (+ optional domain) maps to one canonical
 * Arabic label + tone. resolveStatus checks the requested domain first, then the
 * `shared` block, then scans every domain, and returns null if nothing matches.
 * Pure logic — no render, no mocks.
 */
import { describe, it, expect } from "vitest";
import { resolveStatus, STATUS_MAP } from "@workspace/ui-core";

describe("resolveStatus — the status-resolution SSOT", () => {
  it("resolves a shared status when no domain is given", () => {
    expect(resolveStatus("approved")).toMatchObject({ label: "معتمد", tone: "success" });
  });

  it("prefers the domain definition over shared for the same key", () => {
    // shared.rejected = «مرفوض» (masc.); custody.rejected = «مرفوضة» (fem.)
    expect(resolveStatus("rejected", "custody")).toMatchObject({ label: "مرفوضة" });
    expect(resolveStatus("rejected")).toMatchObject({ label: "مرفوض" });
  });

  it("falls back to shared when the requested domain lacks the status", () => {
    // the `zatca` domain has no «approved» → resolves via shared
    expect(resolveStatus("approved", "zatca")).toMatchObject({ label: "معتمد", tone: "success" });
  });

  it("scans every domain as a last resort when no domain is given", () => {
    // «won» exists only in the `legal_case` domain, not in shared
    expect(resolveStatus("won")).toMatchObject({ label: "ربح", tone: "success" });
  });

  it("returns null for a status that exists nowhere", () => {
    expect(resolveStatus("definitely_not_a_status_xyz")).toBeNull();
  });

  it("STATUS_MAP is the canonical Arabic-label + tone source", () => {
    expect(STATUS_MAP.shared.draft).toMatchObject({ label: "مسودة", tone: "muted" });
  });
});
