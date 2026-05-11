import { describe, it, expect, vi } from "vitest";
import {
  buildTestPackTemplates,
  runComplianceTestPack,
} from "../../src/lib/zatca/test-pack.js";

describe("ZATCA compliance test pack — templates", () => {
  it("returns exactly 6 templates covering both families and all 3 doc types", () => {
    const templates = buildTestPackTemplates();
    expect(templates).toHaveLength(6);

    const kinds = new Set(templates.map((t) => t.kind));
    expect(kinds).toEqual(
      new Set([
        "standard.regular",
        "standard.debit_note",
        "standard.credit_note",
        "simplified.regular",
        "simplified.debit_note",
        "simplified.credit_note",
      ]),
    );
  });

  it("uses spec-correct UBL invoice type codes", () => {
    const templates = buildTestPackTemplates();
    const byKind = Object.fromEntries(templates.map((t) => [t.kind, t.invoiceTypeCode]));
    // 388 = regular, 381 = credit, 383 = debit
    expect(byKind["standard.regular"]).toBe("388");
    expect(byKind["standard.credit_note"]).toBe("381");
    expect(byKind["standard.debit_note"]).toBe("383");
    expect(byKind["simplified.regular"]).toBe("388");
    expect(byKind["simplified.credit_note"]).toBe("381");
    expect(byKind["simplified.debit_note"]).toBe("383");
  });

  it("at least one template includes an exempt line and one includes a discount", () => {
    const templates = buildTestPackTemplates();
    expect(templates.some((t) => t.lines.some((l) => l.exempt))).toBe(true);
    expect(templates.some((t) => t.documentDiscount != null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Runner: mock out the Fatoora client to verify orchestration without
// touching the network. The runner imports complianceInvoiceCheck
// from './client.js' so we stub the module via vi.mock.
// ─────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/zatca/client.js", () => ({
  complianceInvoiceCheck: vi.fn(async (opts: any) => {
    // Pretend ZATCA accepts every Standard invoice and rejects every
    // Simplified one — checks that the runner aggregates per-invoice
    // results correctly.
    const isStandard = opts.submission.invoiceUuid.includes("STD");
    return {
      status: isStandard ? "cleared" : "rejected",
      zatcaUuid: opts.submission.invoiceUuid,
      warnings: [],
      errors: isStandard ? [] : ["[validation/E1] simulated rejection"],
      rawResponse: { test: true },
    };
  }),
}));

describe("ZATCA compliance test pack — runner orchestration", () => {
  it("submits each template once and aggregates results", async () => {
    const templates = buildTestPackTemplates();
    const buildSignedXml = vi.fn(async (template: any) => ({
      signedXmlBase64: Buffer.from("<x/>").toString("base64"),
      invoiceUuid: template.kind.includes("standard") ? `STD-${template.invoiceRef}` : `SIM-${template.invoiceRef}`,
      invoiceHashBase64: "aGFzaA==",
    }));

    const out = await runComplianceTestPack({
      env: "sandbox",
      creds: { binarySecurityToken: "tok", secret: "s" },
      templates,
      buildSignedXml,
    });

    // 3 standard cleared, 3 simplified rejected — overall failed.
    expect(out.allPassed).toBe(false);
    expect(out.perInvoice).toHaveLength(6);
    expect(buildSignedXml).toHaveBeenCalledTimes(6);

    const cleared = out.perInvoice.filter((p) => p.result?.status === "cleared");
    const rejected = out.perInvoice.filter((p) => p.result?.status === "rejected");
    expect(cleared).toHaveLength(3);
    expect(rejected).toHaveLength(3);
  });

  it("captures buildSignedXml errors per invoice without aborting the whole pack", async () => {
    const templates = buildTestPackTemplates().slice(0, 3);
    let calls = 0;
    const buildSignedXml = vi.fn(async (template: any) => {
      calls += 1;
      if (calls === 2) throw new Error("local signing failed");
      return {
        signedXmlBase64: Buffer.from("<x/>").toString("base64"),
        invoiceUuid: `STD-${template.invoiceRef}`,
        invoiceHashBase64: "aGFzaA==",
      };
    });

    const out = await runComplianceTestPack({
      env: "sandbox",
      creds: { binarySecurityToken: "tok", secret: "s" },
      templates,
      buildSignedXml,
    });

    expect(out.allPassed).toBe(false);
    expect(out.perInvoice).toHaveLength(3);
    expect(out.perInvoice[1].result).toBeNull();
    expect(out.perInvoice[1].error).toContain("local signing failed");
  });

  it("respects an aborted signal mid-pack", async () => {
    const templates = buildTestPackTemplates();
    const controller = new AbortController();
    let calls = 0;
    const buildSignedXml = vi.fn(async (template: any) => {
      calls += 1;
      if (calls === 2) controller.abort();
      return {
        signedXmlBase64: Buffer.from("<x/>").toString("base64"),
        invoiceUuid: `STD-${template.invoiceRef}`,
        invoiceHashBase64: "aGFzaA==",
      };
    });

    const out = await runComplianceTestPack({
      env: "sandbox",
      creds: { binarySecurityToken: "tok", secret: "s" },
      templates,
      buildSignedXml,
      signal: controller.signal,
    });

    expect(out.allPassed).toBe(false);
    // First two invoices submit (one before abort + the one that
    // triggered the abort); the rest are recorded as aborted.
    const aborted = out.perInvoice.filter((p) => p.error?.includes("aborted"));
    expect(aborted.length).toBeGreaterThan(0);
  });
});
