import { describe, it, expect } from "vitest";
import {
  fromLegacyExpenseForm,
  fromLegacyVoucherForm,
  fromLegacyInvoiceLine,
} from "../../src/lib/financeOperationContext.js";

describe("financeOperationContext — legacy adapters", () => {
  it("fromLegacyExpenseForm derives target + dims + money source", () => {
    const ctx = fromLegacyExpenseForm({
      companyId: 1,
      branchId: 5,
      sourceAccountCode: "1110",
      paymentMethod: "cash",
      relatedEntityType: "vehicle",
      relatedEntityId: 42,
      lineAllocation: { vehicleId: 42, manualOverrideReason: "صيانة طارئة" },
    });
    expect(ctx.operationType).toBe("expense");
    expect(ctx.moneySource?.accountCode).toBe("1110");
    expect(ctx.paymentMethod).toBe("cash");
    expect(ctx.allocationTarget).toBe("vehicle");
    expect(ctx.dimensions.vehicleId).toBe(42);
    expect(ctx.overrideReason).toBe("صيانة طارئة");
  });

  it("fromLegacyVoucherForm maps receipt vs payment", () => {
    const receipt = fromLegacyVoucherForm({ companyId: 1, type: "receipt", method: "bank_transfer", sourceAccountCode: "1120" });
    expect(receipt.operationType).toBe("receipt");
    expect(receipt.paymentMethod).toBe("bank_transfer");
    const payment = fromLegacyVoucherForm({ companyId: 1, type: "payment", method: "cash" });
    expect(payment.operationType).toBe("payment");
  });

  it("targetFromDims prefers the most specific dimension", () => {
    const propCtx = fromLegacyExpenseForm({ companyId: 1, lineAllocation: { propertyId: 7 } });
    expect(propCtx.allocationTarget).toBe("property");
    const projCtx = fromLegacyExpenseForm({ companyId: 1, lineAllocation: { projectId: 3 } });
    expect(projCtx.allocationTarget).toBe("project");
    const noneCtx = fromLegacyExpenseForm({ companyId: 1, lineAllocation: {} });
    expect(noneCtx.allocationTarget).toBe("none");
  });

  it("fromLegacyInvoiceLine maps the catalog + dims", () => {
    const dims = fromLegacyInvoiceLine({ companyId: 1, productId: 99, clientId: 8, costCenterId: 4 });
    expect(dims.productId).toBe(99);
    expect(dims.clientId).toBe(8);
    expect(dims.costCenterId).toBe(4);
  });
});
