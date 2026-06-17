/**
 * Properties — contract tests for three engine GL functions that
 * existed on main but had ZERO assertion of the actual lines they
 * post. Same `vi.hoisted` + financial-engine mock pattern as the
 * four newer tests in #2039/#2042/#2043/#2044, applied to:
 *
 *   1. postBuildingAssetGL      — building asset capitalisation
 *      (DR property_building_asset / CR purchase cash). Called from
 *      POST /properties/buildings when purchasePrice > 0.
 *
 *   2. postEarlyTerminationGL   — early-termination penalty
 *      (DR rent_receivable / CR early_termination_revenue). Called
 *      from POST /properties/contracts/:id/terminate when a penalty
 *      is owed.
 *
 *   3. postOwnerPayoutGL        — settles owner liability
 *      (DR owner_payable / CR cash). Called from owner-payout
 *      handler when we actually pay the third-party owner.
 *
 * Each test locks the lines, the account-code resolution, the
 * sourceType/sourceKey/guardTable contract, and the dimensions
 * carried — so a regression that bypasses the engine seam or drops
 * a balance invariant fails visibly.
 *
 * Per #2088 doctrine: these tests are PRE-merge work (no
 * dependency on the queued 12-PR wave). They cover engine
 * functions that already exist on main and will keep existing
 * across every queued merge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveAccountCodeMock, postJournalEntryMock } = vi.hoisted(() => {
  const resolveAccountCodeMock = vi.fn(
    async (
      _companyId: number,
      operationType: string,
      _side: "debit" | "credit",
      fallback: string,
    ) => {
      // Codes deliberately DIFFER from the engine fallbacks so any
      // regression that wrote the literal default would fail the
      // byCode lookups below.
      const map: Record<string, string> = {
        property_building_asset: "1241",
        property_building_purchase_cash: "1112",
        rent_receivable: "1131",
        early_termination_revenue: "4151",
        owner_payable: "2151",
        cash: "1011",
      };
      return map[operationType] ?? fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({
    journalId: 9999,
    ref: "JE-MOCK",
  }));
  return { resolveAccountCodeMock, postJournalEntryMock };
});

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: resolveAccountCodeMock,
    postJournalEntry: postJournalEntryMock,
  },
}));

import { propertiesEngine } from "../../src/lib/engines/propertiesEngine.js";

const ctx = { companyId: 2, branchId: 5, createdBy: 100 };

beforeEach(() => {
  resolveAccountCodeMock.mockClear();
  postJournalEntryMock.mockClear();
});

// ═══════════════════════════════════════════════════════════════════
// postBuildingAssetGL
// ═══════════════════════════════════════════════════════════════════

describe("postBuildingAssetGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postBuildingAssetGL).toBe("function");
  });
});

describe("postBuildingAssetGL — happy path", () => {
  it("emits exactly two balanced lines: DR asset / CR cash", async () => {
    await propertiesEngine.postBuildingAssetGL(ctx, {
      id: 77,
      purchasePrice: 5_000_000,
      name: "برج اختبار",
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    expect(byCode["1241"]).toBeDefined();
    expect(byCode["1241"].debit).toBe(5_000_000);
    expect(byCode["1241"].credit).toBe(0);

    expect(byCode["1112"]).toBeDefined();
    expect(byCode["1112"].debit).toBe(0);
    expect(byCode["1112"].credit).toBe(5_000_000);
  });

  it("balances debits and credits with a non-trivial decimal price", async () => {
    await propertiesEngine.postBuildingAssetGL(ctx, {
      id: 78,
      purchasePrice: 8_765_432.55,
      name: "مجمّع 7",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const sumDebit = request.lines.reduce(
      (s: number, l: { debit: number }) => s + l.debit,
      0,
    );
    const sumCredit = request.lines.reduce(
      (s: number, l: { credit: number }) => s + l.credit,
      0,
    );
    expect(sumDebit).toBeCloseTo(sumCredit, 2);
  });

  it("tags both lines with propertyId so per-building drilldowns work", async () => {
    await propertiesEngine.postBuildingAssetGL(ctx, {
      id: 91,
      purchasePrice: 2_500_000,
      name: "برج الواحة",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.propertyId).toBe(91);
    }
  });

  it("posts with sourceType=property_building + a deterministic sourceKey", async () => {
    await propertiesEngine.postBuildingAssetGL(ctx, {
      id: 12,
      purchasePrice: 1_000_000,
      name: "م",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("property_building");
    expect(request.sourceId).toBe(12);
    expect(request.sourceKey).toBe("property:building_asset:12");
    expect(request.guardTable).toBe("property_buildings");
    expect(request.guardId).toBe(12);
    expect(request.ref).toBe("BLDG-12");
  });

  it("resolves account codes through resolveAccountCode (operator mappings override)", async () => {
    await propertiesEngine.postBuildingAssetGL(ctx, {
      id: 99,
      purchasePrice: 1,
      name: "x",
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_building_asset",
      "debit",
      "1240",
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_building_purchase_cash",
      "credit",
      "1111",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// postEarlyTerminationGL
// ═══════════════════════════════════════════════════════════════════

describe("postEarlyTerminationGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postEarlyTerminationGL).toBe("function");
  });
});

describe("postEarlyTerminationGL — happy path", () => {
  it("emits exactly two balanced lines: DR receivable / CR penalty revenue", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 22,
      propertyId: 7,
      tenantId: 44,
      penaltyAmount: 6_000,
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // DR rent_receivable — the tenant owes the penalty.
    expect(byCode["1131"]).toBeDefined();
    expect(byCode["1131"].debit).toBe(6_000);
    expect(byCode["1131"].credit).toBe(0);

    // CR early_termination_revenue — distinct from the regular rent
    // revenue line so the income statement separates one-off penalty
    // income from recurring rent.
    expect(byCode["4151"]).toBeDefined();
    expect(byCode["4151"].debit).toBe(0);
    expect(byCode["4151"].credit).toBe(6_000);
  });

  it("balances debits and credits", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 23,
      propertyId: 7,
      tenantId: 44,
      penaltyAmount: 1_234.56,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const sumDebit = request.lines.reduce(
      (s: number, l: { debit: number }) => s + l.debit,
      0,
    );
    const sumCredit = request.lines.reduce(
      (s: number, l: { credit: number }) => s + l.credit,
      0,
    );
    expect(sumDebit).toBeCloseTo(sumCredit, 2);
  });

  it("tags every line with propertyId + contractId + clientId (tenant)", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 33,
      propertyId: 11,
      tenantId: 55,
      penaltyAmount: 3_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.propertyId).toBe(11);
      expect(line.contractId).toBe(33);
      expect(line.clientId).toBe(55);
    }
  });

  it("omits clientId cleanly when tenantId is null (no orphan dim)", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 34,
      propertyId: 12,
      tenantId: null,
      penaltyAmount: 2_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.clientId).toBeUndefined();
    }
  });

  it("posts with sourceType=rental_contracts + a deterministic sourceKey distinct from rent collection", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 41,
      propertyId: 9,
      tenantId: 60,
      penaltyAmount: 1_500,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("rental_contracts");
    expect(request.sourceId).toBe(41);
    // distinct from postRentRevenueGL's `property:rent:<id>` so the
    // dedupe guard treats the two as unrelated postings against the
    // same contract.
    expect(request.sourceKey).toBe("property:termination:41");
    expect(request.guardTable).toBe("rental_contracts");
    expect(request.guardId).toBe(41);
    expect(request.ref).toBe("JE-TERM-41");
  });

  it("resolves account codes through resolveAccountCode", async () => {
    await propertiesEngine.postEarlyTerminationGL(ctx, {
      contractId: 50,
      propertyId: 1,
      tenantId: 1,
      penaltyAmount: 100,
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "rent_receivable",
      "debit",
      "1132",
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "early_termination_revenue",
      "credit",
      "4130",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// postOwnerPayoutGL
// ═══════════════════════════════════════════════════════════════════

describe("postOwnerPayoutGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postOwnerPayoutGL).toBe("function");
  });
});

describe("postOwnerPayoutGL — happy path", () => {
  it("emits exactly two balanced lines: DR owner_payable / CR cash", async () => {
    await propertiesEngine.postOwnerPayoutGL(ctx, {
      payoutId: 101,
      ownerId: 200,
      period: "2026-05",
      amount: 27_500,
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // DR owner_payable — clears the liability the management
    // collections accrued on the owner_payable line (see
    // postManagementCollectionGL in #2043).
    expect(byCode["2151"]).toBeDefined();
    expect(byCode["2151"].debit).toBe(27_500);
    expect(byCode["2151"].credit).toBe(0);

    // CR cash — bank goes down by the same amount.
    expect(byCode["1011"]).toBeDefined();
    expect(byCode["1011"].debit).toBe(0);
    expect(byCode["1011"].credit).toBe(27_500);
  });

  it("balances debits and credits with a non-trivial decimal", async () => {
    await propertiesEngine.postOwnerPayoutGL(ctx, {
      payoutId: 102,
      ownerId: 200,
      period: "2026-06",
      amount: 12_345.67,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const sumDebit = request.lines.reduce(
      (s: number, l: { debit: number }) => s + l.debit,
      0,
    );
    const sumCredit = request.lines.reduce(
      (s: number, l: { credit: number }) => s + l.credit,
      0,
    );
    expect(sumDebit).toBeCloseTo(sumCredit, 2);
  });

  it("includes the period in the description so the owner statement reconciles to a month", async () => {
    await propertiesEngine.postOwnerPayoutGL(ctx, {
      payoutId: 103,
      ownerId: 201,
      period: "2026-07",
      amount: 5_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.description).toContain("2026-07");
    expect(request.description).toContain("201");
  });

  it("posts with sourceType=property_owner_payouts + a deterministic sourceKey", async () => {
    await propertiesEngine.postOwnerPayoutGL(ctx, {
      payoutId: 201,
      ownerId: 300,
      period: "2026-08",
      amount: 10_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("property_owner_payouts");
    expect(request.sourceId).toBe(201);
    expect(request.sourceKey).toBe("property:owner_payout:201");
    expect(request.guardTable).toBe("property_owner_payouts");
    expect(request.guardId).toBe(201);
    expect(request.ref).toBe("JE-OWNERPAY-201");
  });

  it("resolves account codes through resolveAccountCode (operator mappings override)", async () => {
    await propertiesEngine.postOwnerPayoutGL(ctx, {
      payoutId: 301,
      ownerId: 400,
      period: "2026-09",
      amount: 1,
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "owner_payable",
      "debit",
      "2150",
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "cash",
      "credit",
      "1111",
    );
  });
});
