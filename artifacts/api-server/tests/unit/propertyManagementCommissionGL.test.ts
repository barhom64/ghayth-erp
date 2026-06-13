/**
 * Properties — management commission collection GL contract test.
 *
 * The third activity branch from #1999 (`management`) — we collect
 * rent on behalf of a third-party owner and keep a commission. This
 * is fundamentally different from `residential_rent` /
 * `commercial_rent`: the rent isn't OUR revenue, it's the owner's;
 * only the commission is.
 *
 * Locks the journal-line shape `propertiesEngine.postManagementCollectionGL`
 * must emit, line by line, BEFORE the engine method ships — so the
 * implementation is wedged in to satisfy the contract, not the other
 * way around. PR-6a is engine + test only; the route and the owner
 * payout statement land in PR-6b.
 *
 * Bookkeeping invariant:
 *   - DR property_cash                       = rent collected (gross)
 *   - CR property_owner_payable              = rent - commission
 *   - CR property_management_commission      = commission
 * The owner liability is what flows into the periodic owner
 * statement; the commission is what hits our P&L immediately.
 *
 * Every account code resolves through `resolveAccountCode` so the
 * operator's `accounting_mappings` overrides take effect; the mock
 * here returns codes that DIFFER from the engine's fallbacks (1101 /
 * 2151 / 4131) so a regression that bypassed the seam and wrote the
 * literal fallbacks would visibly fail.
 *
 * Commission rate is per-contract and lives in the data layer; the
 * engine only takes the resolved commission amount. PR-6b adds the
 * column to rental_contracts and the route reads/multiplies before
 * calling the engine.
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
      const map: Record<string, string> = {
        property_cash: "1101",
        property_owner_payable: "2151",
        property_management_commission: "4131",
      };
      return map[operationType] ?? fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({
    journalId: 8001,
    ref: "JE-MGMT-1",
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

describe("postManagementCollectionGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postManagementCollectionGL).toBe("function");
  });
});

describe("postManagementCollectionGL — happy path", () => {
  it("splits collected rent into owner payable + commission revenue", async () => {
    // Tenant pays 10,000. Commission is 800 (8%). Owner gets 9,200.
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 501,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 10_000,
      commissionAmount: 800,
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(3);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // Cash debited for the FULL rent — what hit our bank.
    expect(byCode["1101"]).toBeDefined();
    expect(byCode["1101"].debit).toBe(10_000);
    expect(byCode["1101"].credit).toBe(0);

    // Owner payable credited for rent minus our cut — what we owe
    // the owner; this is the line the periodic owner statement
    // aggregates.
    expect(byCode["2151"]).toBeDefined();
    expect(byCode["2151"].debit).toBe(0);
    expect(byCode["2151"].credit).toBe(9_200);

    // Commission credited as OUR revenue — hits P&L immediately.
    expect(byCode["4131"]).toBeDefined();
    expect(byCode["4131"].debit).toBe(0);
    expect(byCode["4131"].credit).toBe(800);
  });

  it("balances debits and credits with non-trivial decimals", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 502,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 12_345.67,
      commissionAmount: 987.65,
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
    expect(sumDebit).toBeCloseTo(12_345.67, 2);
  });

  it("never leaks the commission into the owner payable line", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 503,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 5_000,
      commissionAmount: 500,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );
    expect(byCode["2151"].credit).toBe(4_500); // 5000 - 500
    expect(byCode["4131"].credit).toBe(500);
    expect(byCode["2151"].credit + byCode["4131"].credit).toBe(5_000);
  });
});

describe("postManagementCollectionGL — zero commission edge case", () => {
  it("emits exactly two lines when commission is zero (owner pays nothing)", async () => {
    // Pro-bono / introductory month — full rent flows to owner, no
    // commission earned. Engine must NOT emit a zero-amount commission
    // line because the financial engine refuses zero-amount lines.
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 511,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 10_000,
      commissionAmount: 0,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);
    const codes = request.lines.map((l: { accountCode: string }) => l.accountCode);
    expect(codes).toContain("1101");
    expect(codes).toContain("2151");
    expect(codes).not.toContain("4131");
  });
});

describe("postManagementCollectionGL — dimensions policy", () => {
  it("tags every line with propertyId + contractId for drilldowns", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 521,
      contractId: 88,
      propertyId: 21,
      ownerId: 200,
      tenantId: 44,
      rentAmount: 8_000,
      commissionAmount: 640,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.propertyId).toBe(21);
      expect(line.contractId).toBe(88);
    }
  });

  it("tags owner_payable with the OWNER's clientId so the owner statement aggregates", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 522,
      contractId: 88,
      propertyId: 21,
      ownerId: 201,
      tenantId: 44,
      rentAmount: 8_000,
      commissionAmount: 640,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const ownerLine = request.lines.find(
      (l: { accountCode: string }) => l.accountCode === "2151",
    );
    expect(ownerLine).toBeDefined();
    expect(ownerLine!.clientId).toBe(201);
  });

  it("tags the cash line with the TENANT's clientId so per-tenant collections drill", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 523,
      contractId: 88,
      propertyId: 21,
      ownerId: 201,
      tenantId: 44,
      rentAmount: 8_000,
      commissionAmount: 640,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const cashLine = request.lines.find(
      (l: { accountCode: string }) => l.accountCode === "1101",
    );
    expect(cashLine).toBeDefined();
    expect(cashLine!.clientId).toBe(44);
  });
});

describe("postManagementCollectionGL — sourceType/sourceKey/guard contract", () => {
  it("posts with sourceType=property_management_collections and a deterministic sourceKey", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 601,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 10_000,
      commissionAmount: 800,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("property_management_collections");
    expect(request.sourceId).toBe(601);
    expect(request.sourceKey).toBe("property:mgmt_collection:601");
    expect(request.guardTable).toBe("property_management_collections");
    expect(request.guardId).toBe(601);
  });
});

describe("postManagementCollectionGL — account codes flow through resolveAccountCode", () => {
  it("resolves every operationType through the mappings seam", async () => {
    await propertiesEngine.postManagementCollectionGL(ctx, {
      id: 701,
      contractId: 77,
      propertyId: 12,
      ownerId: 200,
      tenantId: 33,
      rentAmount: 5_000,
      commissionAmount: 400,
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_cash",
      "debit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_owner_payable",
      "credit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_management_commission",
      "credit",
      expect.any(String),
    );
  });
});
