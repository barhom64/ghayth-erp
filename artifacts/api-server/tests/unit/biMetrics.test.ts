/**
 * BI — محرك حساب KPI الآمن (قائمة بيضاء، لا تقييم صيغ حرّة).
 *
 * يثبت: (1) المؤشّرات مفاتيح معروفة فقط؛ (2) الحساب يمرّر companyId للاستعلام؛
 * (3) المفتاح المجهول يُرفض (لا حساب اعتباطي)؛ (4) لا eval/Function في المصدر.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { rawQueryMock } = vi.hoisted(() => ({ rawQueryMock: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({ rawQuery: rawQueryMock }));

import { BI_METRICS, biMetricKeys, computeBiMetric } from "../../src/lib/biMetrics.js";

beforeEach(() => rawQueryMock.mockReset());

describe("biMetrics — قائمة بيضاء", () => {
  it("تضمّ مؤشّرات حقيقية معروفة ولا تقبل غيرها", () => {
    const keys = biMetricKeys().map((m) => m.key);
    expect(keys).toContain("active_employees");
    expect(keys).toContain("total_revenue");
    expect(keys).toContain("open_tickets");
    expect(BI_METRICS.has("active_employees")).toBe(true);
    expect(BI_METRICS.has("drop table users")).toBe(false);
    expect(BI_METRICS.has("__proto__")).toBe(false);
  });

  it("كل مؤشّر له تسمية ووحدة", () => {
    for (const m of biMetricKeys()) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.unit.length).toBeGreaterThan(0);
    }
  });
});

describe("computeBiMetric — حساب آمن مُتفلتِر بالشركة", () => {
  it("يحسب مؤشّرًا معروفًا ويمرّر companyId للاستعلام", async () => {
    rawQueryMock.mockResolvedValueOnce([{ v: 42 }]);
    const value = await computeBiMetric("active_employees", 7);
    expect(value).toBe(42);
    const [sql, params] = rawQueryMock.mock.calls[0]!;
    expect(sql).toMatch(/"companyId"\s*=\s*\$1/);
    expect(params).toEqual([7]);
  });

  it("يعيد 0 عند غياب القيمة (لا NaN)", async () => {
    rawQueryMock.mockResolvedValueOnce([{ v: null }]);
    expect(await computeBiMetric("total_revenue", 1)).toBe(0);
    rawQueryMock.mockResolvedValueOnce([]);
    expect(await computeBiMetric("total_revenue", 1)).toBe(0);
  });

  it("يرفض المفتاح المجهول (لا حساب اعتباطي)", async () => {
    await expect(computeBiMetric("1; DROP TABLE x", 1)).rejects.toThrow(/UNKNOWN_METRIC/);
    expect(rawQueryMock).not.toHaveBeenCalled();
  });
});

describe("biMetrics — لا تقييم صيغ حرّة (أمان)", () => {
  it("المصدر خالٍ من eval / new Function", () => {
    const src = readFileSync(join(import.meta.dirname!, "../../src/lib/biMetrics.ts"), "utf8");
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/new\s+Function\s*\(/);
  });
});
