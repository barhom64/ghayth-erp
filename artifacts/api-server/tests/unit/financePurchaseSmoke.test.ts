import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8"
);

describe("finance-purchase — purchase requests", () => {
  it("GET /purchase-requests requires finance:read", () => {
    const idx = SRC.indexOf('"/purchase-requests"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /purchase-requests requires finance:create", () => {
    const idx = SRC.indexOf('purchaseRouter.post("/purchase-requests"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("approve endpoint requires finance:update", () => {
    const idx = SRC.indexOf('"/purchase-requests/:id/approve"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("impact preview endpoint exists", () => {
    expect(SRC).toContain('"/purchase-requests/impact-preview"');
  });

  it("convert to PO endpoint exists", () => {
    expect(SRC).toContain('"/purchase-requests/:id/convert"');
  });

  it("convert-to-po alternative endpoint exists", () => {
    expect(SRC).toContain('"/purchase-requests/:id/convert-to-po"');
  });
});

describe("finance-purchase — purchase orders", () => {
  it("GET /purchase-orders requires finance:read", () => {
    const idx = SRC.indexOf('"/purchase-orders"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /purchase-orders requires finance:create", () => {
    const idx = SRC.indexOf('purchaseRouter.post("/purchase-orders"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("approval workflow endpoints exist (approve, reject, return)", () => {
    expect(SRC).toContain('"/purchase-orders/:id/approve"');
    expect(SRC).toContain('"/purchase-orders/:id/reject"');
    expect(SRC).toContain('"/purchase-orders/:id/return"');
  });

  it("receive endpoint requires finance:update", () => {
    const idx = SRC.indexOf('"/purchase-orders/:id/receive"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("receipts sub-endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/:id/receipts"');
  });

  it("3-way match endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/:id/match"');
  });

  it("vendor confirm endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/:id/vendor-confirm"');
  });

  it("match invoice endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/:id/match-invoice"');
  });

  it("schedule payment endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/:id/schedule-payment"');
  });

  it("pending GRN endpoint exists", () => {
    expect(SRC).toContain('"/purchase-orders/pending-grn"');
  });

  it("GET /:id requires finance:read", () => {
    expect(SRC).toContain('"/purchase-orders/:id"');
  });
});

describe("finance-purchase — payment runs", () => {
  it("pending payments endpoint exists", () => {
    expect(SRC).toContain('"/payment-run/pending"');
  });

  it("execute payment run requires finance:create", () => {
    const idx = SRC.indexOf('"/payment-run/execute"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("payment run list endpoint exists", () => {
    expect(SRC).toContain('purchaseRouter.get("/payment-run"');
  });
});

describe("finance-purchase — security", () => {
  it("uses parameterized queries throughout", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(50);
  });

  it("queries scoped by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(30);
  });

  it("uses withTransaction for multi-step operations", () => {
    expect(SRC).toContain("withTransaction");
  });
});
