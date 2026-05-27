// Smoke test for LineAllocationStatusBanner placement.
//   node --test scripts/src/check-allocation-detail-banner.test.mjs
//
// Ensures the inline allocation status banner is rendered on the
// document detail pages (invoice + purchase-order). This is what closes
// the loop between "approved doc has unmapped lines" and "user sees
// the warning on the doc itself with a one-click path to the fix".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "../..");
const COMPONENT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/line-allocation-status-banner.tsx"),
  "utf8",
);
const INVOICE_DETAIL = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/invoice-detail.tsx"),
  "utf8",
);
const PO_DETAIL = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/purchase-order-detail.tsx"),
  "utf8",
);

describe("LineAllocationStatusBanner component", () => {
  it("exports LineAllocationStatusBanner", () => {
    assert.match(COMPONENT, /export function LineAllocationStatusBanner/);
  });

  it("handles legacy docs gracefully (no allocationStatus on any line)", () => {
    // tracked.length === 0 → return null
    assert.ok(COMPONENT.includes("if (tracked.length === 0) return null;"));
  });

  it("counts unmapped + override + resolved", () => {
    assert.ok(COMPONENT.includes('allocationStatus === "unmapped"'));
    assert.ok(COMPONENT.includes('allocationStatus === "manual_override"'));
    assert.ok(COMPONENT.includes('allocationStatus === "resolved"'));
  });

  it("unmapped state links to rules + coverage", () => {
    assert.ok(COMPONENT.includes('href="/finance/allocation-rules"'));
    assert.ok(COMPONENT.includes('href="/finance/allocation-coverage"'));
  });

  it("override state links to overrides report", () => {
    assert.ok(COMPONENT.includes('href="/finance/overrides-report"'));
  });

  it("severity ordering: unmapped > override > resolved", () => {
    // The function returns early on unmapped > 0, then on override > 0,
    // then falls through to the resolved chip.
    const unmappedIdx = COMPONENT.indexOf("if (unmapped > 0)");
    const overrideIdx = COMPONENT.indexOf("if (override > 0)");
    assert.ok(unmappedIdx > 0 && overrideIdx > 0);
    assert.ok(unmappedIdx < overrideIdx, "unmapped branch must come first");
  });
});

describe("invoice-detail renders the banner", () => {
  it("imports LineAllocationStatusBanner", () => {
    assert.ok(INVOICE_DETAIL.includes('from "@/components/shared/line-allocation-status-banner"'));
  });
  it("renders the banner inside overview", () => {
    assert.match(INVOICE_DETAIL, /<LineAllocationStatusBanner\b[\s\S]{0,300}documentType="invoice"/);
  });
});

describe("purchase-order-detail renders the banner", () => {
  it("imports LineAllocationStatusBanner", () => {
    assert.ok(PO_DETAIL.includes('from "@/components/shared/line-allocation-status-banner"'));
  });
  it("renders the banner inside overview with documentType=purchase_order", () => {
    assert.match(PO_DETAIL, /<LineAllocationStatusBanner\b[\s\S]{0,200}documentType="purchase_order"/);
  });
});
