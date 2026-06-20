/**
 * PO 3-way-match workflow actions UI smoke.
 *
 * finance-purchase.ts exposed vendor-confirm / match-invoice / schedule-payment
 * transitions with no UI (the PO page only showed match RESULTS). Pins the new
 * section, its three endpoints, the status gates, and its mount on the PO page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SECTION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/finance/purchase-order-match-section.tsx"),
  "utf8",
);
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/purchase-order-detail.tsx"),
  "utf8",
);

describe("PO match section — exists, wired to the three transitions", () => {
  it("exports PurchaseOrderMatchSection", () => {
    expect(SECTION_SRC).toMatch(/export function PurchaseOrderMatchSection\(/);
  });
  it("calls all three transition endpoints with the right verbs", () => {
    expect(SECTION_SRC).toMatch(/\/vendor-confirm`,\s*\n?\s*"PATCH"/);
    expect(SECTION_SRC).toMatch(/\/match-invoice`,\s*\n?\s*"POST"/);
    expect(SECTION_SRC).toMatch(/\/schedule-payment`,\s*\n?\s*"POST"/);
  });
  it("gates each action on the backend-allowed PO status", () => {
    expect(SECTION_SRC).toMatch(/\["pending", "sent"\]\.includes/);
    expect(SECTION_SRC).toMatch(/\["received", "partially_received"\]\.includes/);
    expect(SECTION_SRC).toMatch(/poStatus === "invoice_matched"/);
  });
  it("is mounted on the PO detail page", () => {
    expect(PAGE_SRC).toMatch(/import \{ PurchaseOrderMatchSection \}/);
    expect(PAGE_SRC).toMatch(/<PurchaseOrderMatchSection /);
  });
});
