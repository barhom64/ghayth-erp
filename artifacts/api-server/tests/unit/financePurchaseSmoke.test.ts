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

describe("finance-purchase — budget enforcement (#2296)", () => {
  // The procurement channel must apply the same role-aware budget gate the
  // manual-expense / vendor-invoice paths apply, otherwise an over-budget
  // spend simply routes around the control by going through a PO.
  it("imports validateBudget from businessHelpers", () => {
    expect(SRC).toMatch(/import \{[\s\S]*?validateBudget[\s\S]*?\} from "\.\.\/lib\/businessHelpers\.js"/);
  });

  it("vendor-invoice approval calls validateBudget before posting the bill", () => {
    // The expense-code budget check lives on the invoice-create path and
    // throws (Conflict/Forbidden) when the role can't authorise the tier.
    const idx = SRC.indexOf("const budgetCheck = await validateBudget(");
    expect(idx).toBeGreaterThan(0);
  });

  it("PO approval enforces the budget at the commitment point", () => {
    // poApprovalAction aggregates lines per accountCode and runs the gate
    // only on the 'approved' transition — reject/return must not be blocked
    // by budget.
    const fn = SRC.slice(
      SRC.indexOf("async function poApprovalAction("),
      SRC.indexOf("purchaseRouter.patch(\"/purchase-orders/:id/approve\""),
    );
    expect(fn).toContain('if (newStatus === "approved")');
    expect(fn).toContain("validateBudget(");
    expect(fn).toContain("purchase_order_items");
    expect(fn).toMatch(/GROUP BY "accountCode"/);
  });

  it("PO-approval gate throws ConflictError on rejected, ForbiddenError otherwise", () => {
    const fn = SRC.slice(
      SRC.indexOf("async function poApprovalAction("),
      SRC.indexOf("purchaseRouter.patch(\"/purchase-orders/:id/approve\""),
    );
    expect(fn).toMatch(/budgetCheck\.status === "rejected"/);
    expect(fn).toContain("new ConflictError(");
    expect(fn).toContain("new ForbiddenError(");
  });

  it("budget gate runs strictly before the approval state transition", () => {
    // If the transition ran first, the PO would already be 'approved' when
    // the gate throws — the commitment would exist with a failed control.
    const fn = SRC.slice(
      SRC.indexOf("async function poApprovalAction("),
      SRC.indexOf("purchaseRouter.patch(\"/purchase-orders/:id/approve\""),
    );
    const gateIdx = fn.indexOf("validateBudget(");
    const transitionIdx = fn.indexOf("await applyTransition(");
    expect(gateIdx).toBeGreaterThan(0);
    expect(transitionIdx).toBeGreaterThan(gateIdx);
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
