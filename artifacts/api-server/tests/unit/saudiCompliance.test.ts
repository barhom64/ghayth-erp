import { describe, it, expect } from "vitest";
import {
  buildWpsFile,
  isSaudiIban,
} from "../../src/lib/saudi-compliance/wps/builder.js";
import { parseAckFile } from "../../src/lib/saudi-compliance/wps/parser.js";
import { classifyNitaqat } from "../../src/lib/saudi-compliance/nitaqat.js";
import {
  selectExpiringIqamas,
  IQAMA_ALERT_THRESHOLDS_DAYS,
} from "../../src/lib/saudi-compliance/iqama-alerts.js";
import type { WpsPayrollEntry } from "../../src/lib/saudi-compliance/types.js";

const VALID_IBAN_1 = "SA0380000000608010167519";
const VALID_IBAN_2 = "SA4420000001234567891234";

const ENTRIES: WpsPayrollEntry[] = [
  {
    employeeId: 1,
    iqamaOrId: "1234567890",
    iban: VALID_IBAN_1,
    amount: 5000,
    basicSalary: 4000,
    housingAllowance: 800,
    otherAllowances: 200,
    deductions: 0,
  },
  {
    employeeId: 2,
    iqamaOrId: "9876543210",
    iban: VALID_IBAN_2,
    amount: 7500,
    basicSalary: 6000,
    housingAllowance: 1200,
    otherAllowances: 300,
    deductions: 0,
  },
];

describe("WPS isSaudiIban — IBAN validation", () => {
  it("accepts a 24-char SA-prefixed alphanumeric string", () => {
    expect(isSaudiIban(VALID_IBAN_1)).toBe(true);
    expect(isSaudiIban(VALID_IBAN_2)).toBe(true);
  });

  it("strips whitespace and uppercases before checking", () => {
    // SA03 8000 0000 6080 1016 7519 — same IBAN, just spaced
    expect(isSaudiIban("sa03 8000 0000 6080 1016 7519")).toBe(true);
  });

  it("rejects wrong prefix", () => {
    expect(isSaudiIban("US0380000000608010167519")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isSaudiIban("SA038000000060801016")).toBe(false);
    expect(isSaudiIban("SA03800000006080101675199999")).toBe(false);
  });

  it("rejects non-alphanumeric characters", () => {
    expect(isSaudiIban("SA03-8000-0000-6080-1016-7519")).toBe(false);
  });

  it("handles non-string inputs", () => {
    expect(isSaudiIban(null as any)).toBe(false);
    expect(isSaudiIban(undefined as any)).toBe(false);
    expect(isSaudiIban(123 as any)).toBe(false);
  });
});

describe("buildWpsFile — generic pipe-delimited format", () => {
  const SUMMARY = {
    companyId: 1,
    period: "2026-05",
    bankCode: "NCB",
    vatNumber: "300000000000003",
    crNumber: "1010000001",
  };

  it("emits a header + one detail line per entry + a trailer", () => {
    const result = buildWpsFile({ summary: SUMMARY, entries: ENTRIES });
    const lines = result.fileBytes.trim().split("\n");
    expect(lines).toHaveLength(4); // H + 2 D + T
    expect(lines[0].startsWith("H|")).toBe(true);
    expect(lines[1].startsWith("D|")).toBe(true);
    expect(lines[2].startsWith("D|")).toBe(true);
    expect(lines[3].startsWith("T|")).toBe(true);
  });

  it("totals match the sum of entry amounts to 2dp", () => {
    const result = buildWpsFile({ summary: SUMMARY, entries: ENTRIES });
    expect(result.totalAmount).toBe(12500);
    expect(result.recordCount).toBe(2);
    expect(result.fileBytes).toContain("|12500.00|2");
  });

  it("encodes amounts to 2 decimal places, never as floats", () => {
    const result = buildWpsFile({
      summary: SUMMARY,
      entries: [
        { ...ENTRIES[0], amount: 1000.555, basicSalary: 1000.555 },
      ],
    });
    // 2dp rendering on each field
    expect(result.fileBytes).toMatch(/\|1000\.5[56]/); // 1000.55 or .56 depending on float
  });

  it("strips pipes and newlines from the remark to prevent injection", () => {
    const result = buildWpsFile({
      summary: SUMMARY,
      entries: [
        {
          ...ENTRIES[0],
          remark: "evil|injection\nT|0|0\nfoo",
        },
      ],
    });
    // Should contain exactly 3 lines (H + D + T) — the injected
    // T row must not survive sanitization.
    const lines = result.fileBytes.trim().split("\n");
    expect(lines).toHaveLength(3);
    // The remark in the D line should be sanitized (no pipes/newlines)
    expect(lines[1].split("|")).toHaveLength(11); // exactly the spec column count
  });

  it("rejects empty payroll", () => {
    expect(() => buildWpsFile({ summary: SUMMARY, entries: [] })).toThrow(/no entries/);
  });

  it("rejects malformed period", () => {
    expect(() =>
      buildWpsFile({ summary: { ...SUMMARY, period: "May 2026" }, entries: ENTRIES }),
    ).toThrow(/YYYY-MM/);
  });

  it("rejects non-positive amounts (catches negative payroll bug class)", () => {
    expect(() =>
      buildWpsFile({
        summary: SUMMARY,
        entries: [{ ...ENTRIES[0], amount: -100 }],
      }),
    ).toThrow(/amount/);
    expect(() =>
      buildWpsFile({
        summary: SUMMARY,
        entries: [{ ...ENTRIES[0], amount: 0 }],
      }),
    ).toThrow();
  });

  it("rejects invalid IBAN", () => {
    expect(() =>
      buildWpsFile({
        summary: SUMMARY,
        entries: [{ ...ENTRIES[0], iban: "BAD" }],
      }),
    ).toThrow(/IBAN/);
  });

  it("rejects per-bank formats until adapters land", () => {
    expect(() =>
      buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "ncb" }),
    ).toThrow(/per-bank format/);
  });
});

describe("parseAckFile — bank ack parser", () => {
  const ACK_OK = `H|1|2026-05|2|0
A|1234567890|SA0380000000608010167519|PAID|REF-001|
A|9876543210|SA4420000001234567891234|PAID|REF-002|
T|2`;

  const ACK_PARTIAL = `H|1|2026-05|1|1
A|1234567890|SA0380000000608010167519|PAID|REF-001|
A|9876543210|SA4420000001234567891234|FAILED||insufficient funds
T|2`;

  it("parses a clean OK file with header + lines + trailer", () => {
    const result = parseAckFile(ACK_OK);
    expect(result.header).toMatchObject({ companyId: "1", period: "2026-05", totalProcessed: 2 });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ status: "paid", bankRefNumber: "REF-001" });
    expect(result.lines[1].status).toBe("paid");
    expect(result.trailerCount).toBe(2);
  });

  it("captures the FAILED branch with errorMessage", () => {
    const result = parseAckFile(ACK_PARTIAL);
    expect(result.lines[1].status).toBe("failed");
    expect(result.lines[1].errorMessage).toBe("insufficient funds");
  });

  it.each([["UNKNOWN_STATUS"], ["WEIRD"]])("maps unknown status %s to 'rejected' (no silent paid)", (s) => {
    const ack = `H|1|2026-05|1|0\nA|1|SA0380000000608010167519|${s}|R|\nT|1`;
    expect(parseAckFile(ack).lines[0].status).toBe("rejected");
  });

  it("throws on missing header", () => {
    const ack = `A|1|SA0380000000608010167519|PAID|R|\nT|1`;
    expect(() => parseAckFile(ack)).toThrow(/missing header/);
  });

  it("throws when trailer count doesn't match line count", () => {
    const ack = `H|1|2026-05|2|0\nA|1|SA0380000000608010167519|PAID|R|\nT|99`;
    expect(() => parseAckFile(ack)).toThrow(/trailer count/);
  });

  it("rejects non-pipe text (HTML error page from bank's portal)", () => {
    expect(() => parseAckFile("<html><body>error</body></html>")).toThrow(/unknown row tag/);
  });
});

describe("classifyNitaqat — Saudization classifier", () => {
  it.each([
    [50, 100, "platinum"],
    [25, 100, "green"],
    [12, 100, "yellow"],
    [5, 100, "red"],
  ])("Saudis=%d / total=%d → %s for default sector", (saudis, total, expected) => {
    const r = classifyNitaqat({ saudiEmployees: saudis, totalEmployees: total });
    expect(r.category).toBe(expected);
  });

  it("computes saudizationPercent to 2dp", () => {
    const r = classifyNitaqat({ saudiEmployees: 1, totalEmployees: 3 });
    expect(r.saudizationPercent).toBe(33.33);
  });

  it("flags companies under 5 staff as exempt (green default)", () => {
    const r = classifyNitaqat({ saudiEmployees: 0, totalEmployees: 3 });
    expect(r.exempt).toBe(true);
    expect(r.category).toBe("green");
  });

  it("flags 0-staff companies as exempt without dividing by zero", () => {
    const r = classifyNitaqat({ saudiEmployees: 0, totalEmployees: 0 });
    expect(r.saudizationPercent).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it("uses sector-specific thresholds (construction is more lenient)", () => {
    // 7% saudization. Default → red. Construction → yellow.
    const def = classifyNitaqat({ saudiEmployees: 7, totalEmployees: 100 });
    const con = classifyNitaqat({ saudiEmployees: 7, totalEmployees: 100, sector: "construction" });
    expect(def.category).toBe("red");
    expect(con.category).toBe("yellow");
  });

  it("rejects negative or non-finite headcount", () => {
    expect(() => classifyNitaqat({ saudiEmployees: -1, totalEmployees: 10 })).toThrow();
    expect(() => classifyNitaqat({ saudiEmployees: 5, totalEmployees: -1 })).toThrow();
    expect(() =>
      classifyNitaqat({ saudiEmployees: Number.NaN, totalEmployees: 10 }),
    ).toThrow();
  });

  it("rejects saudiEmployees > totalEmployees (data integrity)", () => {
    expect(() =>
      classifyNitaqat({ saudiEmployees: 11, totalEmployees: 10 }),
    ).toThrow(/cannot exceed/);
  });
});

describe("selectExpiringIqamas — alert threshold matcher", () => {
  it("returns only employees crossing one of the spec thresholds today", () => {
    const result = selectExpiringIqamas({
      asOfDate: "2026-05-09",
      employees: [
        { employeeId: 1, iqamaExpiry: "2026-08-07" }, // 90 days
        { employeeId: 2, iqamaExpiry: "2026-07-08" }, // 60 days
        { employeeId: 3, iqamaExpiry: "2026-06-08" }, // 30 days
        { employeeId: 4, iqamaExpiry: "2026-05-23" }, // 14 days
        { employeeId: 5, iqamaExpiry: "2026-05-16" }, // 7 days
        { employeeId: 6, iqamaExpiry: "2026-05-10" }, // 1 day
        { employeeId: 7, iqamaExpiry: "2026-05-29" }, // 20 days — NOT a threshold
        { employeeId: 8, iqamaExpiry: "2026-04-09" }, // expired
      ],
    });

    const ids = result.map((r) => r.employeeId).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.every((r) => r.isThreshold)).toBe(true);
  });

  it("ignores employees with null iqamaExpiry (Saudis don't have one)", () => {
    const result = selectExpiringIqamas({
      asOfDate: "2026-05-09",
      employees: [
        { employeeId: 1, iqamaExpiry: null },
        { employeeId: 2, iqamaExpiry: undefined },
      ],
    });
    expect(result).toEqual([]);
  });

  it("rejects malformed asOfDate", () => {
    expect(() =>
      selectExpiringIqamas({ asOfDate: "not-a-date", employees: [] }),
    ).toThrow(/asOfDate/);
  });

  it("exposes the exact spec'd threshold list for callers to mirror", () => {
    expect(IQAMA_ALERT_THRESHOLDS_DAYS).toEqual([90, 60, 30, 14, 7, 1]);
  });
});
