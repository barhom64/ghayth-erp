import { describe, it, expect, vi } from "vitest";
import {
  buildFatoraUrl,
  fatoraaBaseUrl,
  CLEARANCE_SINGLE_PATH,
  REPORTING_SINGLE_PATH,
  COMPLIANCE_CSID_PATH,
  PRODUCTION_CSID_PATH,
} from "../../src/lib/zatca/endpoints.js";
import {
  basicAuthHeader,
  commonFatoraHeaders,
} from "../../src/lib/zatca/auth.js";
import { parseClearanceResponse } from "../../src/lib/zatca/response.js";

// Spec-default Fatoora host (no env override) — see zatca/endpoints.ts.
const DEFAULT_HOST = "https://gw-fatoora.zatca.gov.sa";

describe("ZATCA endpoints — URL building", () => {
  it("uses a stable host for both sandbox and production by default", () => {
    expect(fatoraaBaseUrl("sandbox")).toMatch(/^https:\/\/[^/]+/);
    expect(fatoraaBaseUrl("production")).toMatch(/^https:\/\/[^/]+/);
  });

  it("env vars override the spec default URLs (per-env)", async () => {
    // The override is resolved in lib/config.ts at module-load time, so
    // the env vars must be stubbed before the graph is re-imported.
    vi.stubEnv("ZATCA_FATOORA_SANDBOX_URL", "https://staging.example/");
    vi.stubEnv("ZATCA_FATOORA_PROD_URL", "https://prod.example");
    vi.resetModules();
    const endpoints = await import("../../src/lib/zatca/endpoints.js");
    expect(endpoints.fatoraaBaseUrl("sandbox")).toBe("https://staging.example");
    expect(endpoints.fatoraaBaseUrl("production")).toBe("https://prod.example");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("buildFatoraUrl joins base + path correctly", () => {
    expect(buildFatoraUrl("sandbox", CLEARANCE_SINGLE_PATH)).toBe(
      `${DEFAULT_HOST}/e-invoicing/core/invoices/clearance/single`,
    );
    expect(buildFatoraUrl("sandbox", REPORTING_SINGLE_PATH)).toContain("/reporting/single");
    expect(buildFatoraUrl("sandbox", COMPLIANCE_CSID_PATH)).toContain("/compliance");
    expect(buildFatoraUrl("sandbox", PRODUCTION_CSID_PATH)).toContain("/production/csids");
  });

  it("handles paths with or without a leading slash", () => {
    expect(buildFatoraUrl("sandbox", "foo/bar")).toBe(`${DEFAULT_HOST}/foo/bar`);
    expect(buildFatoraUrl("sandbox", "/foo/bar")).toBe(`${DEFAULT_HOST}/foo/bar`);
  });
});

describe("ZATCA Basic auth", () => {
  it("composes the header from a binarySecurityToken + secret", () => {
    const header = basicAuthHeader({
      binarySecurityToken: "TOKEN_BASE64",
      secret: "SECRET_VALUE",
    });
    expect(header.startsWith("Basic ")).toBe(true);
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    expect(decoded).toBe("TOKEN_BASE64:SECRET_VALUE");
  });

  it("strips PEM armor and whitespace from the token before pairing", () => {
    const header = basicAuthHeader({
      binarySecurityToken:
        "-----BEGIN CERTIFICATE-----\nABC\nDEF\n-----END CERTIFICATE-----\n",
      secret: "s",
    });
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    expect(decoded).toBe("ABCDEF:s");
  });

  it.each([
    ["", "secret"],
    ["token", ""],
  ])("throws when either field is empty", (token, secret) => {
    expect(() => basicAuthHeader({ binarySecurityToken: token, secret })).toThrow();
  });

  it("commonFatoraHeaders sets Accept-Version V2 and JSON content type", () => {
    const h = commonFatoraHeaders();
    expect(h["Accept-Version"]).toBe("V2");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h.Accept).toBe("application/json");
  });
});

describe("ZATCA response parser", () => {
  const UUID = "11111111-2222-3333-4444-555555555555";

  it("recognises a clean PASS / CLEARED response as 'cleared'", () => {
    const result = parseClearanceResponse(
      {
        validationResults: { status: "PASS" },
        clearanceStatus: "CLEARED",
        clearedInvoice: Buffer.from("<Invoice/>", "utf8").toString("base64"),
      },
      UUID,
    );
    expect(result.status).toBe("cleared");
    expect(result.clearedXml).toBe("<Invoice/>");
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.zatcaUuid).toBe(UUID);
  });

  it("returns 'rejected' on validation ERROR even if HTTP would say 200", () => {
    const result = parseClearanceResponse(
      {
        validationResults: {
          status: "ERROR",
          errorMessages: [
            { code: "BR-KSA-09", category: "schematron", message: "VAT total mismatch" },
          ],
        },
        clearanceStatus: "NOT_CLEARED",
      },
      UUID,
    );
    expect(result.status).toBe("rejected");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("BR-KSA-09");
    expect(result.errors[0]).toContain("VAT total mismatch");
  });

  it("returns 'warning' when validation is PASS but warnings are present", () => {
    const result = parseClearanceResponse(
      {
        validationResults: {
          status: "WARNING",
          warningMessages: [{ code: "WARN-1", message: "country code lower-case" }],
        },
        clearanceStatus: "CLEARED",
      },
      UUID,
    );
    expect(result.status).toBe("warning");
    expect(result.warnings[0]).toContain("WARN-1");
  });

  it("recognises 'reported' for Simplified invoices", () => {
    const result = parseClearanceResponse(
      { validationResults: { status: "PASS" }, reportingStatus: "REPORTED" },
      UUID,
    );
    expect(result.status).toBe("reported");
  });

  it("flags an unknown status as 'warning' with a diagnostic message", () => {
    const result = parseClearanceResponse(
      {
        validationResults: { status: "MAYBE" },
        clearanceStatus: "QUEUED",
      },
      UUID,
    );
    expect(result.status).toBe("warning");
    expect(result.warnings.some((w) => w.includes("MAYBE"))).toBe(true);
  });
});
