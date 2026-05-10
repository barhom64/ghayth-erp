import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildWpsFile } from "../../src/lib/saudi-compliance/wps/builder.js";
import { ADAPTERS } from "../../src/lib/saudi-compliance/wps/formats/index.js";
import type {
  WpsPayrollEntry,
  WpsRunSummary,
} from "../../src/lib/saudi-compliance/types.js";

const VALID_IBAN_1 = "SA0380000000608010167519";
const VALID_IBAN_2 = "SA4420000001234567891234";

const SUMMARY: WpsRunSummary = {
  companyId: 7,
  period: "2026-05",
  bankCode: "TEST",
  vatNumber: "300000000000003",
  crNumber: "1010000001",
  companyIban: "SA0011223344556677889900",
};

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

// ─────────────────────────────────────────────────────────────────────
// Adapter registry
// ─────────────────────────────────────────────────────────────────────

describe("WPS bank-format registry", () => {
  it("exposes the four production adapters", () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(["alinma", "alrajhi", "ncb", "riyad"]);
  });

  it("each adapter exposes a stable code + Arabic name", () => {
    for (const adapter of Object.values(ADAPTERS)) {
      expect(typeof adapter.code).toBe("string");
      expect(adapter.code.length).toBeGreaterThan(0);
      expect(typeof adapter.name).toBe("string");
      expect(adapter.name.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// NCB / SNB — comma-delimited + halalas + CRLF
// ─────────────────────────────────────────────────────────────────────

describe("NCB adapter", () => {
  it("produces a comma-separated file with header tag '1'", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "ncb" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines).toHaveLength(4); // 1 header + 2 detail + 1 trailer
    expect(lines[0].startsWith("1,")).toBe(true);
    expect(lines[1].startsWith("2,")).toBe(true);
    expect(lines[3].startsWith("9,")).toBe(true);
  });

  it("encodes amounts in halalas (× 100, no decimal point)", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "ncb" });
    // 5000 SAR → "500000" halalas
    expect(r.fileBytes).toContain(",500000,");
    // 7500 SAR → "750000" halalas
    expect(r.fileBytes).toContain(",750000,");
    // Total 12500 SAR → "1250000" halalas in header + trailer
    expect(r.fileBytes).toContain(",1250000,");
  });

  it("uses YYYYMM (no dash) in the header", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "ncb" });
    const header = r.fileBytes.split(/\r?\n/)[0];
    expect(header).toContain(",202605,");
    expect(header).not.toContain(",2026-05,");
  });

  it("emits CRLF line endings", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "ncb" });
    expect(r.fileBytes).toContain("\r\n");
  });

  it("strips commas from remarks (column-injection guard)", () => {
    const evil = [
      { ...ENTRIES[0], remark: "evil,injection,9,0,0" },
    ];
    const r = buildWpsFile({ summary: SUMMARY, entries: evil, format: "ncb" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // header + 1 detail + trailer
    // Detail row column count is fixed (NCB spec: 9 columns)
    expect(lines[1].split(",")).toHaveLength(9);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Al Rajhi — pipe-delimited + 2-char tags + extra account row
// ─────────────────────────────────────────────────────────────────────

describe("Al Rajhi adapter", () => {
  it("uses pipe separator with 2-char tags HD / AR / DT / TR", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alrajhi" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[0].startsWith("HD|")).toBe(true);
    expect(lines[1].startsWith("AR|")).toBe(true);
    expect(lines[2].startsWith("DT|")).toBe(true);
    expect(lines[3].startsWith("DT|")).toBe(true);
    expect(lines[4].startsWith("TR|")).toBe(true);
    expect(lines).toHaveLength(5); // header + AR row + 2 detail + trailer
  });

  it("inserts a sequential index in each detail row", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alrajhi" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[2].split("|")[1]).toBe("1");
    expect(lines[3].split("|")[1]).toBe("2");
  });

  it("encodes amounts as 2dp SAR (not halalas)", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alrajhi" });
    expect(r.fileBytes).toContain("|5000.00|");
    expect(r.fileBytes).toContain("|7500.00|");
  });

  it("emits the company IBAN on the AR row", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alrajhi" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[1]).toBe(`AR|${SUMMARY.companyIban}|SAR`);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Riyad — pipe header/trailer + fixed-width detail
// ─────────────────────────────────────────────────────────────────────

describe("Riyad adapter", () => {
  it("uses pipe-delimited header + trailer", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "riyad" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[0].split("|")[0]).toBe("H");
    expect(lines[lines.length - 1].split("|")[0]).toBe("T");
  });

  it("emits fixed-width detail rows (no separator)", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "riyad" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    const detailLines = lines.slice(1, -1);
    // tag(1) + iqama(15) + iban(24) + amount(15) + remark(80) = 135 chars
    for (const dl of detailLines) {
      expect(dl.length).toBe(135);
      expect(dl.startsWith("D")).toBe(true);
      expect(dl.includes("|")).toBe(false); // no pipes in fixed-width
    }
  });

  it("right-pads amounts with leading zeros", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "riyad" });
    // 5000 → "000000005000.00"
    expect(r.fileBytes).toContain("000000005000.00");
    expect(r.fileBytes).toContain("000000007500.00");
  });

  it("uses YYYYMM (no dash) in the header", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "riyad" });
    const header = r.fileBytes.split(/\r?\n/)[0];
    expect(header).toContain("|202605|");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Alinma — pipe + SHA-256 checksum row
// ─────────────────────────────────────────────────────────────────────

describe("Alinma adapter", () => {
  it("appends a SHA-256 checksum row after the trailer", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alinma" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines).toHaveLength(5); // H + 2 D + T + C
    expect(lines[lines.length - 1].startsWith("C|")).toBe(true);
    const checksum = lines[lines.length - 1].split("|")[1];
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computes the checksum over header + detail rows only (excludes trailer + C)", () => {
    const r = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alinma" });
    const lines = r.fileBytes.split(/\r?\n/).filter((l) => l.length > 0);
    const header = lines[0];
    const detail = lines.slice(1, -2); // exclude trailer + checksum
    const expected = createHash("sha256")
      .update([header, ...detail].join("\n"), "utf8")
      .digest("hex");
    const actualChecksum = lines[lines.length - 1].split("|")[1];
    expect(actualChecksum).toBe(expected);
  });

  it("changes the checksum if any detail amount changes (tamper detection)", () => {
    const a = buildWpsFile({ summary: SUMMARY, entries: ENTRIES, format: "alinma" });
    const tamperedEntries = [
      { ...ENTRIES[0], amount: 5001 }, // changed by 1 SAR
      ENTRIES[1],
    ];
    const b = buildWpsFile({ summary: SUMMARY, entries: tamperedEntries, format: "alinma" });
    const aChecksum = a.fileBytes.split(/\r?\n/).filter(Boolean).slice(-1)[0];
    const bChecksum = b.fileBytes.split(/\r?\n/).filter(Boolean).slice(-1)[0];
    expect(aChecksum).not.toBe(bChecksum);
  });
});
