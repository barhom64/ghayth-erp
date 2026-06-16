/**
 * Properties — maintenance billed to a third-party owner GL contract.
 *
 * Per the doctrine: maintenance falls on the OWNER. If we own the
 * property → the existing `postMaintenanceExpenseGL` already handles
 * it (debits maintenance expense against the property's cost centre).
 * But when we MANAGE a property for a third party, the maintenance
 * is a receivable from that owner — they will pay us. The output
 * is a tax invoice on the owner.
 *
 * This test locks the journal-line shape for
 * `propertiesEngine.postMaintenanceOwnerBillingGL` before the engine
 * method ships. PR-7a is engine + test only; the routing decision
 * (which engine method to call) belongs to PR-7b — it'll read
 * property_buildings.ownerType or rental_contracts.contractType
 * ('management') to pick the path.
 *
 * Bookkeeping invariant:
 *   - DR property_owner_receivable           = cost + VAT  (gross)
 *   - CR property_maintenance_payable        = cost
 *   - CR vat_output                          = VAT  (when commercial,
 *     i.e. owner is VAT-registered and we issue a tax invoice)
 * The "issue a tax invoice" step is operational — the GL posts as
 * soon as the maintenance is completed; the invoice document is
 * a follow-up artifact that PR-7b emits to the owner.
 *
 * Every account code resolves through `resolveAccountCode` so the
 * `accounting_mappings` overrides take effect; the mock returns
 * 1141/2161/2312 — codes that DIFFER from the engine's fallbacks
 * (1140/2160/2200) so a regression bypassing the seam would fail
 * the byCode lookups.
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
        property_owner_receivable: "1141",
        property_maintenance_payable: "2161",
        vat_output: "2312",
      };
      return map[operationType] ?? fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({
    journalId: 9100,
    ref: "JE-MAINT-OWNER-1",
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

describe("postMaintenanceOwnerBillingGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postMaintenanceOwnerBillingGL).toBe(
      "function",
    );
  });
});

describe("postMaintenanceOwnerBillingGL — no-VAT path (small service / unregistered owner)", () => {
  it("emits exactly two balanced lines: DR owner receivable, CR maintenance payable", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 901,
      propertyId: 12,
      unitId: 55,
      ownerId: 200,
      totalCost: 3_000,
      type: "كهرباء",
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    expect(byCode["1141"]).toBeDefined();
    expect(byCode["1141"].debit).toBe(3_000);
    expect(byCode["1141"].credit).toBe(0);

    expect(byCode["2161"]).toBeDefined();
    expect(byCode["2161"].debit).toBe(0);
    expect(byCode["2161"].credit).toBe(3_000);

    expect(byCode["2312"]).toBeUndefined();
  });
});

describe("postMaintenanceOwnerBillingGL — with VAT", () => {
  it("emits three lines: DR owner receivable (gross), CR maint payable (net), CR VAT", async () => {
    // Net cost 4,000; VAT 600 (15%); gross 4,600.
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 911,
      propertyId: 12,
      unitId: 55,
      ownerId: 200,
      totalCost: 4_000,
      vatAmount: 600,
      type: "سباكة",
    });

    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(3);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // Receivable carries the GROSS — what the tax invoice bills.
    expect(byCode["1141"].debit).toBe(4_600);
    // Maintenance payable still equals the NET cost — what we owe
    // the vendor or our internal team. VAT is OUR liability to ZATCA,
    // not the vendor's.
    expect(byCode["2161"].credit).toBe(4_000);
    // VAT is its own liability line.
    expect(byCode["2312"].credit).toBe(600);

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

  it("treats a zero vatAmount as no-VAT (only 2 lines, no zero-amount line)", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 912,
      propertyId: 12,
      unitId: 55,
      ownerId: 200,
      totalCost: 3_000,
      vatAmount: 0,
      type: "كهرباء",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);
  });
});

describe("postMaintenanceOwnerBillingGL — dimensions policy", () => {
  it("tags every line with propertyId + ownerId (clientId) + optional unitId", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 921,
      propertyId: 21,
      unitId: 88,
      ownerId: 201,
      totalCost: 5_000,
      vatAmount: 750,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.propertyId).toBe(21);
      expect(line.unitId).toBe(88);
      expect(line.clientId).toBe(201); // owner subledger — AR aging keys off this
    }
  });

  it("omits unitId when not supplied (building-level maintenance)", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 922,
      propertyId: 21,
      ownerId: 201,
      totalCost: 5_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.unitId).toBeUndefined();
    }
  });
});

describe("postMaintenanceOwnerBillingGL — sourceType + guard contract", () => {
  it("posts with sourceType=maintenance_requests + a deterministic sourceKey distinct from the company-paid path", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 1001,
      propertyId: 12,
      ownerId: 200,
      totalCost: 1_000,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("maintenance_requests");
    expect(request.sourceId).toBe(1001);
    // sourceKey differs from postMaintenanceExpenseGL's
    // `property:maintenance:<id>` so the dedupe guard treats the
    // two postings as separate events — a maintenance request that
    // gets reclassified from "we pay" to "owner pays" would
    // (correctly) post a new entry rather than colliding.
    expect(request.sourceKey).toBe("property:maintenance_owner:1001");
    expect(request.guardTable).toBe("maintenance_requests");
    expect(request.guardId).toBe(1001);
  });
});

describe("postMaintenanceOwnerBillingGL — account codes flow through resolveAccountCode", () => {
  it("resolves every operationType through the mappings seam, not literal constants", async () => {
    await propertiesEngine.postMaintenanceOwnerBillingGL(ctx, {
      id: 1101,
      propertyId: 12,
      ownerId: 200,
      totalCost: 2_500,
      vatAmount: 375,
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_owner_receivable",
      "debit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_maintenance_payable",
      "credit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "vat_output",
      "credit",
      expect.any(String),
    );
  });
});
