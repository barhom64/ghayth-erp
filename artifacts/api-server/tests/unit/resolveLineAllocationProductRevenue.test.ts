import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── FIN-SUB-06 (#2102) — product-revenue folded INTO resolveLineAllocation ──
//
// Before #2102 the product-revenue account was bolted on AFTER the resolver
// at the two invoice call sites:
//   acct = res.resolvedAccountCode
//        || productRevenueCodes.get(productId)   // <- post-resolver bolt-on
//        || invRevenueCode;
// so direct resolveLineAllocation callers never got product revenue. #2102
// moves that lookup INSIDE resolveLineAllocation at the SAME precedence
// point, fed by a batch-loaded map injected via AllocationInput, so EVERY
// caller resolves the identical account:
//   manual pin  >  matching rule  >  product revenue  >  caller generic.
//
// These are PURE unit tests: rawdb is mocked so the resolver runs in-memory.
// `rules query → []` reproduces the "no matching rule" branch (the only
// branch where product revenue is consulted — a pin or a rule always wins).

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn();
  const withTransaction = vi.fn(async (fn: () => Promise<any>) => fn());
  return { rawQuery, rawExecute, withTransaction };
});

import { resolveLineAllocation } from "../../src/lib/accountingAllocation.js";
import { rawQuery } from "../../src/lib/rawdb.js";

const mockRawQuery = rawQuery as unknown as ReturnType<typeof vi.fn>;

/** Make every rawQuery call return [] — i.e. no allocation rules match,
 *  no chart-of-accounts row, no cost centre. This is the branch where the
 *  product-revenue fallback is the ONLY account source. */
function noRulesMatch() {
  mockRawQuery.mockReset();
  mockRawQuery.mockResolvedValue([]);
}

/** Return a single matching invoice rule that points at revenueAccountId=77,
 *  then resolve that id to code '4111'. Used to prove a rule still wins over
 *  product revenue. */
function ruleMatchesRevenue4111() {
  mockRawQuery.mockReset();
  mockRawQuery
    // Step 2 — candidate rules
    .mockResolvedValueOnce([
      {
        id: 9,
        name: "generic invoice",
        documentType: "invoice",
        lineType: null,
        activityType: null,
        entityType: null,
        conditionsJson: null,
        debitAccountId: null,
        creditAccountId: null,
        revenueAccountId: 77,
        expenseAccountId: null,
        assetAccountId: null,
        inventoryAccountId: null,
        vatAccountId: null,
        costCenterStrategy: "none",
        dimensionStrategyJson: null,
        requiresEntityLink: false,
        priority: 100,
      },
    ])
    // lookupAccountCode → code for accountId 77
    .mockResolvedValueOnce([{ code: "4111" }])
    // resolveCostCenter (strategy 'none' returns early, no query) — but be
    // defensive in case the resolver issues anything else.
    .mockResolvedValue([]);
}

const baseInput = {
  companyId: 1,
  documentType: "invoice",
  lineType: "product",
  sourceTable: "invoice_lines",
  sourceLineId: 1,
} as const;

beforeEach(() => {
  noRulesMatch();
});

describe("#2102 — product revenue resolved INSIDE resolveLineAllocation", () => {
  it("uses the product-revenue code when no rule matches and the line has a productId", async () => {
    noRulesMatch();
    const res = await resolveLineAllocation({
      ...baseInput,
      productId: 42,
      productRevenueCodes: new Map([[42, "4150"]]),
      dimensions: { productId: 42 },
    });
    // The account is now the PRODUCT's revenue code...
    expect(res.resolvedAccountCode).toBe("4150");
    // ...but the STATUS stays 'unmapped' — no rule/pin matched. This is a
    // posting-account fallback, not a successful mapping (so the enforce
    // gate + preview warnings behave exactly as before #2102).
    expect(res.status).toBe("unmapped");
  });

  it("falls back to productId from dimensions when input.productId is absent", async () => {
    noRulesMatch();
    const res = await resolveLineAllocation({
      ...baseInput,
      productRevenueCodes: new Map([[42, "4150"]]),
      dimensions: { productId: 42 },
    });
    expect(res.resolvedAccountCode).toBe("4150");
  });
});

describe("#2102 — precedence preserved (pin > rule > product revenue > generic)", () => {
  it("explicit accountCode override still WINS over product revenue", async () => {
    noRulesMatch();
    const res = await resolveLineAllocation({
      ...baseInput,
      accountCode: "9999", // operator pin
      productId: 42,
      productRevenueCodes: new Map([[42, "4150"]]),
      dimensions: { productId: 42 },
    });
    expect(res.status).toBe("manual_override");
    expect(res.resolvedAccountCode).toBe("9999");
    expect(res.resolvedAccountCode).not.toBe("4150");
  });

  it("a matching rule's account WINS over product revenue", async () => {
    ruleMatchesRevenue4111();
    const res = await resolveLineAllocation({
      ...baseInput,
      productId: 42,
      productRevenueCodes: new Map([[42, "4150"]]),
      dimensions: { productId: 42 },
    });
    expect(res.status).toBe("resolved");
    expect(res.resolvedAccountCode).toBe("4111");
    expect(res.resolvedAccountCode).not.toBe("4150");
  });

  it("product revenue is used only when there is no rule (the generic fallback stays at the call site)", async () => {
    noRulesMatch();
    // No product map entry for this productId → resolver returns null, so
    // the caller's generic invRevenueCode fallback (|| invRevenueCode at
    // the call site) still applies — unchanged.
    const res = await resolveLineAllocation({
      ...baseInput,
      productId: 999,
      productRevenueCodes: new Map([[42, "4150"]]),
      dimensions: { productId: 999 },
    });
    expect(res.resolvedAccountCode).toBeNull();
    expect(res.status).toBe("unmapped");
  });
});

describe("#2102 — regression: lines without product context are unchanged", () => {
  it("a line with NO productId and NO product map returns null account (legacy behavior)", async () => {
    noRulesMatch();
    const res = await resolveLineAllocation({
      ...baseInput,
      dimensions: {},
    });
    expect(res.resolvedAccountCode).toBeNull();
    expect(res.status).toBe("unmapped");
  });

  it("a productId WITHOUT an injected map returns null account (no product revenue applied)", async () => {
    noRulesMatch();
    const res = await resolveLineAllocation({
      ...baseInput,
      productId: 42,
      dimensions: { productId: 42 },
    });
    expect(res.resolvedAccountCode).toBeNull();
    expect(res.status).toBe("unmapped");
  });
});

// ─── Static — the bolt-on is GONE; product context flows through the resolver ─

describe("#2102 — finance-invoices.ts no longer applies productRevenueCodes AFTER the resolver", () => {
  const ROUTE = readFileSync(
    join(import.meta.dirname!, "../../src/routes/finance-invoices.ts"),
    "utf8",
  );

  it("the post-resolver bolt-on `|| productRevenueCodes.get(...)` after res.resolvedAccountCode is removed", () => {
    // The bolt-on consumed the map AFTER the resolver: `acct =
    // res.resolvedAccountCode || (... productRevenueCodes.get(...)) ||
    // invRevenueCode`. That `.get(` consumption is what must be gone — the
    // map is now passed INTO the resolver, never read post-resolution.
    expect(ROUTE).not.toContain("productRevenueCodes.get(");
  });

  it("the route fallback is now just resolver-output || generic", () => {
    expect(ROUTE).toMatch(/res\.resolvedAccountCode\s*\|\|\s*invRevenueCode/);
  });

  it("productRevenueCodes flows THROUGH resolveLineAllocation (injected on the input)", () => {
    expect(ROUTE).toMatch(/resolveLineAllocation\(\{[\s\S]*?productRevenueCodes[\s\S]*?\}\)/);
  });

  it("getProductRevenueCodes is still batch-loaded once per save (consumed via the resolver)", () => {
    expect(ROUTE).toContain("getProductRevenueCodes(");
  });
});
