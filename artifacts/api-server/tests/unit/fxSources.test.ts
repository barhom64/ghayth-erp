import { describe, it, expect, vi } from "vitest";

// Hoisted: mocks the DB so dailyFxRateFetch runs entirely in-memory.
// Real cron paths hit Postgres via rawQuery / rawExecute; integration
// tests will cover the SQL side once that harness exists.
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async (sql: string) => {
    if (sql.includes("FROM companies")) {
      return [{ id: 1 }, { id: 2 }];
    }
    return [];
  }),
  rawExecute: vi.fn(async () => ({ affectedRows: 1, insertId: undefined })),
}));

import { parseEcbXml, ecbSource } from "../../src/lib/fx/source-fetchers/ecb.js";
import { samaSource, SamaNotConfiguredError } from "../../src/lib/fx/source-fetchers/sama.js";
import { manualSource } from "../../src/lib/fx/source-fetchers/manual.js";
import { dailyFxRateFetch } from "../../src/lib/fx/jobs.js";
import type { RateSource } from "../../src/lib/fx/source-fetchers/types.js";

const ECB_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
                 xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-05-09'>
      <Cube currency='USD' rate='1.0850'/>
      <Cube currency='JPY' rate='168.45'/>
      <Cube currency='GBP' rate='0.8520'/>
      <Cube currency='AED' rate='3.985'/>
      <Cube rate='3.6500' currency='QAR'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB XML parser", () => {
  it("extracts the reference date from the inner <Cube>", () => {
    const rates = parseEcbXml(ECB_FIXTURE);
    expect(rates.length).toBeGreaterThan(0);
    expect(rates.every((r) => r.effectiveDate === "2026-05-09")).toBe(true);
  });

  it("emits FetchedRate rows in the EUR → CCY direction", () => {
    const rates = parseEcbXml(ECB_FIXTURE);
    expect(rates.every((r) => r.fromCurrency === "EUR")).toBe(true);
    const usd = rates.find((r) => r.toCurrency === "USD");
    expect(usd?.rate).toBe(1.085);
    const jpy = rates.find((r) => r.toCurrency === "JPY");
    expect(jpy?.rate).toBe(168.45);
  });

  it("tolerates flipped attribute order (rate before currency)", () => {
    const rates = parseEcbXml(ECB_FIXTURE);
    const qar = rates.find((r) => r.toCurrency === "QAR");
    expect(qar).toBeDefined();
    expect(qar?.rate).toBe(3.65);
  });

  it("tags every row with source='ecb' for the audit log", () => {
    const rates = parseEcbXml(ECB_FIXTURE);
    expect(rates.every((r) => r.source === "ecb")).toBe(true);
  });

  it("throws on a malformed envelope (missing <Cube time>)", () => {
    expect(() => parseEcbXml("<not-ecb/>")).toThrow(/Cube time/);
  });
});

describe("SAMA fetcher (not yet wired)", () => {
  it("throws SamaNotConfiguredError so the orchestrator falls back", async () => {
    await expect(samaSource.fetchLatest()).rejects.toBeInstanceOf(SamaNotConfiguredError);
  });

  it("the error message points operators to the design plan", async () => {
    try {
      await samaSource.fetchLatest();
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).toContain("not yet wired");
      expect((err as Error).message).toContain("sama.ts");
    }
  });
});

describe("Manual fetcher", () => {
  it("returns an empty array (soft no-op) so the chain continues", async () => {
    const rates = await manualSource.fetchLatest();
    expect(rates).toEqual([]);
  });
});

describe("dailyFxRateFetch — orchestration", () => {
  it("falls back from a failing source to the next in the chain", async () => {
    const failing: RateSource = {
      name: "failing",
      fetchLatest: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const stub: RateSource = {
      name: "stub",
      fetchLatest: vi.fn(async () => [
        { fromCurrency: "EUR", toCurrency: "USD", rate: 1.08, effectiveDate: "2026-05-09", source: "stub" },
      ]),
    };

    const out = await dailyFxRateFetch([failing, stub]);

    expect(out.errors).toContain("failing: network down");
    expect(out.sourcesUsed).toContain("stub");
    // 2 companies × 1 rate each = 2 persists
    expect(out.ratesPersisted).toBe(2);
  });

  it("ignores SamaNotConfiguredError silently (expected fallback)", async () => {
    const ok: RateSource = {
      name: "ok",
      fetchLatest: vi.fn(async () => [
        { fromCurrency: "EUR", toCurrency: "USD", rate: 1.08, effectiveDate: "2026-05-09", source: "ok" },
      ]),
    };

    const out = await dailyFxRateFetch([samaSource, ok]);
    expect(out.errors.find((e) => e.includes("sama"))).toBeUndefined();
    expect(out.sourcesUsed).toContain("ok");
  });

  it("returns 'no source returned any rates' when every source is empty", async () => {
    const empty: RateSource = { name: "empty", fetchLatest: async () => [] };
    const out = await dailyFxRateFetch([empty]);
    expect(out.errors[0]).toContain("no source returned any rates");
    expect(out.ratesPersisted).toBe(0);
  });
});
