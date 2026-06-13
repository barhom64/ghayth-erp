/**
 * Properties — property sale GL contract test.
 *
 * Property sale is the fourth Properties activity branch (#1999) and
 * the first one whose journal entry was missing entirely from the
 * engine. This test locks down what `propertiesEngine.postSaleGL`
 * must emit, line by line, BEFORE the engine function lands — so
 * the engine implementation is wedged in to satisfy the contract,
 * not the other way around.
 *
 * The sale of a building is fundamentally different from rent
 * revenue:
 *   - It REMOVES an asset from the books rather than booking a
 *     periodic income — so the building's book value comes out
 *     of 1520 (property_building_asset) as a credit.
 *   - The CASH received is debited to the sale receivable (the
 *     buyer pays it, the bank settles it later).
 *   - The DELTA between sale price and book value is the
 *     realised gain (CR property_sale_gain) or loss (DR
 *     property_sale_loss). One direction only — never both.
 *   - When VAT applies (commercial property sale), the tax line
 *     is split out the same way commercial rent does it: receivable
 *     carries the gross, revenue/asset side is net, the VAT
 *     liability is a separate CR to vat_output.
 *
 * Every account code resolves through `financialEngine.resolveAccountCode`
 * so an operator's `accounting_mappings` row beats the engine's
 * fallback. The mock here returns codes that DIFFER from the
 * fallbacks; a regression that bypasses the seam would fail the
 * lookup assertions visibly.
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
      // Distinct codes per operation — a regression that wrote
      // the engine's literal fallback would be caught by the
      // byCode lookups below.
      const map: Record<string, string> = {
        property_sale_receivable: "1132",
        property_building_asset: "1521",
        vat_output: "2311",
        property_sale_gain: "4911",
        property_sale_loss: "6911",
      };
      return map[operationType] ?? fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({
    journalId: 7001,
    ref: "JE-SALE-1",
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

describe("postSaleGL — exists on the engine", () => {
  it("is callable", () => {
    expect(typeof propertiesEngine.postSaleGL).toBe("function");
  });
});

describe("postSaleGL — gain path (sale price > book value)", () => {
  it("emits three lines: DR receivable, CR asset, CR gain", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 401,
      propertyId: 12,
      buyerId: 90,
      salePrice: 1_500_000,
      bookValue: 1_000_000,
      saleDate: "2026-03-01",
    });

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(3);

    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // Sale receivable carries the full sale price (gross). No VAT in
    // this scenario, so gross == net.
    expect(byCode["1132"]).toBeDefined();
    expect(byCode["1132"].debit).toBe(1_500_000);
    expect(byCode["1132"].credit).toBe(0);

    // Asset comes off the books at its CARRYING VALUE — not the sale
    // price. Crediting the original cost (1521) removes the asset.
    expect(byCode["1521"]).toBeDefined();
    expect(byCode["1521"].debit).toBe(0);
    expect(byCode["1521"].credit).toBe(1_000_000);

    // The gain is the delta — sale price - book value. Realised gains
    // are revenue, credit side.
    expect(byCode["4911"]).toBeDefined();
    expect(byCode["4911"].debit).toBe(0);
    expect(byCode["4911"].credit).toBe(500_000);

    // Never a loss line on a gain path.
    expect(byCode["6911"]).toBeUndefined();
  });

  it("balances debits and credits", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 402,
      propertyId: 12,
      buyerId: 90,
      salePrice: 1_200_000.75,
      bookValue: 800_000.25,
      saleDate: "2026-03-01",
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
});

describe("postSaleGL — loss path (sale price < book value)", () => {
  it("emits three lines: DR receivable, DR loss, CR asset", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 411,
      propertyId: 13,
      buyerId: 90,
      salePrice: 800_000,
      bookValue: 1_000_000,
      saleDate: "2026-03-15",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(3);
    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    expect(byCode["1132"]).toBeDefined();
    expect(byCode["1132"].debit).toBe(800_000);

    // Asset still removed at book value, regardless of loss.
    expect(byCode["1521"]).toBeDefined();
    expect(byCode["1521"].credit).toBe(1_000_000);

    // The shortfall is a realised loss — expense, debit side.
    expect(byCode["6911"]).toBeDefined();
    expect(byCode["6911"].debit).toBe(200_000);
    expect(byCode["6911"].credit).toBe(0);

    // Never a gain line on a loss path.
    expect(byCode["4911"]).toBeUndefined();
  });
});

describe("postSaleGL — break-even path (salePrice === bookValue)", () => {
  it("emits exactly two lines, no gain or loss line", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 421,
      propertyId: 14,
      buyerId: 90,
      salePrice: 1_000_000,
      bookValue: 1_000_000,
      saleDate: "2026-04-01",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(2);
    const codes = request.lines.map((l: { accountCode: string }) => l.accountCode);
    expect(codes).toContain("1132");
    expect(codes).toContain("1521");
    expect(codes).not.toContain("4911");
    expect(codes).not.toContain("6911");
  });
});

describe("postSaleGL — commercial sale with VAT", () => {
  it("splits gross into net asset/gain calc and a separate VAT line", async () => {
    // `salePrice` is the GROSS the buyer pays — same convention as
    // the rent route's `paidAmount` (#PR-4). Engine subtracts VAT
    // to derive the net before computing the gain.
    // Gross 1,725,000 = 1,500,000 net + 225,000 VAT @ 15%.
    // Book value 1,000,000 → realised gain = 1,500,000 - 1,000,000 = 500,000.
    await propertiesEngine.postSaleGL(ctx, {
      id: 431,
      propertyId: 15,
      buyerId: 90,
      salePrice: 1_725_000,
      bookValue: 1_000_000,
      vatAmount: 225_000,
      saleDate: "2026-05-01",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.lines).toHaveLength(4);
    const byCode = Object.fromEntries(
      request.lines.map((l: { accountCode: string }) => [l.accountCode, l]),
    );

    // Receivable is the GROSS (net + VAT).
    expect(byCode["1132"].debit).toBe(1_725_000);
    // Asset still removed at book value.
    expect(byCode["1521"].credit).toBe(1_000_000);
    // VAT is its own liability line.
    expect(byCode["2311"]).toBeDefined();
    expect(byCode["2311"].credit).toBe(225_000);
    // Gain is computed off the NET sale price, not the gross.
    expect(byCode["4911"].credit).toBe(500_000);

    // Balance.
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
});

describe("postSaleGL — dimensions + sourceType policy", () => {
  it("tags every line with propertyId + clientId (buyer) so per-property P&L drills", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 441,
      propertyId: 16,
      buyerId: 91,
      salePrice: 2_000_000,
      bookValue: 1_500_000,
      saleDate: "2026-06-01",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    for (const line of request.lines) {
      expect(line.propertyId).toBe(16);
      expect(line.clientId).toBe(91);
    }
  });

  it("posts with sourceType=property_sales and a deterministic sourceKey", async () => {
    await propertiesEngine.postSaleGL(ctx, {
      id: 451,
      propertyId: 17,
      buyerId: 92,
      salePrice: 900_000,
      bookValue: 900_000,
      saleDate: "2026-07-01",
    });
    const request = postJournalEntryMock.mock.calls[0]![0]!;
    expect(request.sourceType).toBe("property_sales");
    expect(request.sourceId).toBe(451);
    expect(request.sourceKey).toBe("property:sale:451");
    // guardTable is the same — the sale row protects against double-post.
    expect(request.guardTable).toBe("property_sales");
    expect(request.guardId).toBe(451);
  });
});

describe("postSaleGL — account codes flow through resolveAccountCode", () => {
  it("resolves every operationType through the mappings seam, not literal constants", async () => {
    // Gross 1,265,000 = 1,100,000 net + 165,000 VAT.
    // Gain = 1,100,000 - 900,000 = 200,000 > 0 → gain side resolves.
    await propertiesEngine.postSaleGL(ctx, {
      id: 461,
      propertyId: 18,
      buyerId: 93,
      salePrice: 1_265_000,
      bookValue: 900_000,
      vatAmount: 165_000,
      saleDate: "2026-08-01",
    });
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_sale_receivable",
      "debit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_building_asset",
      "credit",
      expect.any(String),
    );
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "vat_output",
      "credit",
      expect.any(String),
    );
    // Gain side called because salePrice > bookValue + vatAmount?
    // Actually gain = salePrice - bookValue = 200,000 (positive)
    expect(resolveAccountCodeMock).toHaveBeenCalledWith(
      2,
      "property_sale_gain",
      "credit",
      expect.any(String),
    );
  });
});
