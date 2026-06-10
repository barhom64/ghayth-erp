/**
 * Properties — rent revenue GL contract test.
 *
 * Locks down the journal-line shape `propertiesEngine.postRentRevenueGL`
 * actually posts for a rent payment, including the VAT path that
 * commercial contracts will take once the route hooks the rate in.
 * The point of this test isn't to prove HTTP success — it's to prove
 * the LEDGER is right line-by-line:
 *   - DR rent_receivable = amount + VAT
 *   - CR rent_revenue    = amount (net, no VAT)
 *   - CR vat_output      = VAT (only when vatAmount > 0)
 *   - SUM(debit) === SUM(credit)        (the dual-entry invariant)
 * It also confirms the account codes flow through `resolveAccountCode`
 * (so the operator's accounting_mappings overrides take effect), not
 * a hard-coded constant in the engine.
 *
 * Mock seam: `financialEngine.postJournalEntry` is intercepted so we
 * capture the exact `lines` array the engine builds. The interception
 * happens BEFORE `propertiesEngine` is imported so the engine's static
 * `import` of financialEngine binds to the mock.
 *
 * This test is the gate the product owner asked for: nothing that
 * adds or moves a journal line ships without an assertion of the
 * actual lines it produces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock hoists above all top-level statements, so the mock factory
// can't close over locally-declared vars. vi.hoisted wraps the mock
// state in a hoisted block we can both refer to from the factory and
// import-then-inspect from the test body.
const { resolveAccountCodeMock, postJournalEntryMock } = vi.hoisted(() => {
  const resolveAccountCodeMock = vi.fn(
    async (
      _companyId: number,
      operationType: string,
      _side: "debit" | "credit",
      fallback: string,
    ) => {
      // Return per-operation codes that differ from the hard-coded
      // fallbacks so a regression where the engine bypasses
      // resolveAccountCode and writes the literal fallback would
      // visibly fail.
      const map: Record<string, string> = {
        rent_receivable: "1131",
        rent_revenue: "4121",
        vat_output: "2310",
        property_maintenance_expense: "6411",
        property_maintenance_payable: "2111",
      };
      return map[operationType] ?? fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({
    journalId: 9001,
    ref: "JE-TEST-1",
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

describe("postRentRevenueGL — no-VAT path (residential)", () => {
  it("posts exactly two balanced lines when vatAmount is omitted", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 501,
      contractId: 77,
      propertyId: 12,
      amount: 1000,
      tenantId: 33,
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);

    const [debit, credit] = request.lines;
    expect(debit.accountCode).toBe("1131"); // resolveAccountCode used
    expect(debit.debit).toBe(1000);
    expect(debit.credit).toBe(0);
    expect(credit.accountCode).toBe("4121");
    expect(credit.debit).toBe(0);
    expect(credit.credit).toBe(1000);
  });

  it("ignores a zero vatAmount as if absent", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 502,
      contractId: 77,
      propertyId: 12,
      amount: 1000,
      vatAmount: 0,
      tenantId: 33,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);
    expect(request.lines.some((l) => l.accountCode === "2310")).toBe(false);
  });
});

describe("postRentRevenueGL — VAT path (commercial)", () => {
  it("emits three lines: DR receivable (gross), CR revenue (net), CR VAT (tax)", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 601,
      contractId: 77,
      propertyId: 12,
      amount: 1000,
      vatAmount: 150,
      tenantId: 33,
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(3);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // Receivable carries the GROSS amount (the tenant owes amount + VAT).
    expect(byCode["1131"]).toBeDefined();
    expect(byCode["1131"].debit).toBe(1150);
    expect(byCode["1131"].credit).toBe(0);

    // Revenue is the NET (post-VAT) amount — the company books only what
    // it actually earned, not the tax it's collecting on behalf of ZATCA.
    expect(byCode["4121"]).toBeDefined();
    expect(byCode["4121"].debit).toBe(0);
    expect(byCode["4121"].credit).toBe(1000);

    // VAT output is the tax line — what the company will eventually
    // remit to ZATCA. Crediting it now records the liability.
    expect(byCode["2310"]).toBeDefined();
    expect(byCode["2310"].debit).toBe(0);
    expect(byCode["2310"].credit).toBe(150);
  });

  it("balances debits and credits down to the riyal", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 602,
      contractId: 77,
      propertyId: 12,
      amount: 8765.43,
      vatAmount: 1314.81, // ~15% of 8765.43
      tenantId: 33,
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
    expect(sumDebit).toBeCloseTo(10080.24, 2);
  });

  it("propagates clientId, contractId, propertyId on every line for the dimensions policy", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 603,
      contractId: 88,
      propertyId: 21,
      amount: 5000,
      vatAmount: 750,
      tenantId: 44,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.clientId).toBe(44);
      expect(line.contractId).toBe(88);
      expect(line.propertyId).toBe(21);
    }
  });

  it("routes through resolveAccountCode for every line — accounting_mappings overrides apply", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 604,
      contractId: 99,
      propertyId: 30,
      amount: 1000,
      vatAmount: 150,
      tenantId: 55,
    });
    // The mock returns 1131/4121/2310; if the engine had bypassed
    // resolveAccountCode and written the literal fallbacks (1200/4100/2200),
    // the byCode lookup above would have failed already.
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "rent_receivable",
      "debit",
      "1200",
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "rent_revenue",
      "credit",
      "4100",
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "vat_output",
      "credit",
      "2200",
    );
  });
});

describe("VAT split arithmetic (gross → net + tax, matches what /payments/:id/pay computes)", () => {
  // The route's VAT-inclusive split mirrors what the engine expects.
  // We don't import the route handler here (it's a fat express function),
  // but we DO assert the math the route runs so the contract is locked
  // in two places: the engine expects `amount` to be the NET pre-tax
  // revenue, and the route is what converts the gross receipt into
  // that net using a configurable rate.
  const split = (gross: number, ratePct: number) => {
    const net = Math.round((gross / (1 + ratePct / 100)) * 100) / 100;
    const vat = Math.round((gross - net) * 100) / 100;
    return { net, vat, gross };
  };

  it("at 15%: 1150 gross → 1000 net + 150 VAT (the canonical example)", () => {
    const s = split(1150, 15);
    expect(s.net).toBe(1000);
    expect(s.vat).toBe(150);
  });

  it("at 0%: gross == net, no VAT (operator-overridden rate)", () => {
    const s = split(1000, 0);
    expect(s.net).toBe(1000);
    expect(s.vat).toBe(0);
  });

  it("rounds to halalas, gross still equals net + vat", () => {
    const s = split(10080.24, 15); // mirrors the balanced-test gross
    expect(s.net + s.vat).toBeCloseTo(s.gross, 2);
  });

  it("at 5% (a hypothetical lower rate): 1050 gross → 1000 net + 50 VAT", () => {
    const s = split(1050, 5);
    expect(s.net).toBe(1000);
    expect(s.vat).toBe(50);
  });
});

describe("postRentRevenueGL — sourceType/sourceKey contract", () => {
  it("keeps sourceType=rent_payments so verify-property-rent-journey.sh keeps matching", async () => {
    await propertiesEngine.postRentRevenueGL(ctx, {
      id: 701,
      contractId: 77,
      propertyId: 12,
      amount: 1000,
      tenantId: 33,
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("rent_payments");
    expect(request.sourceId).toBe(701);
    expect(request.sourceKey).toBe("property:rent:701");
  });
});
