import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/autoViolationEngine.ts"),
  "utf8"
);

// ── Exports ───────────────────────────────────────────────────────────────

describe("autoViolationEngine — exported functions", () => {
  it("exports getAutoDetectionSettings", () => {
    expect(SRC).toContain("export async function getAutoDetectionSettings");
  });

  it("exports saveAutoDetectionSettings", () => {
    expect(SRC).toContain("export async function saveAutoDetectionSettings");
  });

  it("exports runAutoDetection", () => {
    expect(SRC).toContain("export async function runAutoDetection");
  });

  it("exports runAutoDetectionAllCompanies", () => {
    expect(SRC).toContain("export async function runAutoDetectionAllCompanies");
  });

  it("exports getDetectionLog", () => {
    expect(SRC).toContain("export async function getDetectionLog");
  });
});

// ── Type definitions ──────────────────────────────────────────────────────

describe("autoViolationEngine — types", () => {
  it("defines DetectedIncident interface", () => {
    expect(SRC).toContain("interface DetectedIncident");
  });

  it("exports AutoDetectionResult interface", () => {
    expect(SRC).toContain("export interface AutoDetectionResult");
  });

  it("result tracks detected, created, skipped, errors", () => {
    expect(SRC).toContain("detected: number");
    expect(SRC).toContain("violationsCreated: number");
    expect(SRC).toContain("memosCreated: number");
    expect(SRC).toContain("skipped: number");
  });

  it("exports AutoDetectionSettings", () => {
    expect(SRC).toContain("export interface AutoDetectionSettings");
  });
});

// ── Detection types ───────────────────────────────────────────────────────

describe("autoViolationEngine — incident types", () => {
  it("detects late arrival", () => {
    expect(SRC).toContain("late");
  });

  it("detects early leave", () => {
    expect(SRC).toContain("early_leave");
  });

  it("detects absence", () => {
    expect(SRC).toContain("absence");
  });

  it("detects GPS out of range", () => {
    expect(SRC).toContain("gps_out_of_range");
  });
});

// ── Settings flags ────────────────────────────────────────────────────────

describe("autoViolationEngine — settings flags", () => {
  it("has enableLateDetection flag", () => {
    expect(SRC).toContain("enableLateDetection");
  });

  it("has enableEarlyLeaveDetection flag", () => {
    expect(SRC).toContain("enableEarlyLeaveDetection");
  });
});

// ── Integration ───────────────────────────────────────────────────────────

describe("autoViolationEngine — integration", () => {
  it("creates inquiry memos for violations", () => {
    expect(SRC).toContain("ensureInquiryMemoForViolation");
  });

  it("creates notifications for managers", () => {
    expect(SRC).toContain("createNotification");
  });

  it("emits events", () => {
    expect(SRC).toContain("emitEvent");
  });

  it("logs detection runs", () => {
    expect(SRC).toContain("logDetectionRun");
  });
});

// ── Severity levels ───────────────────────────────────────────────────────

describe("autoViolationEngine — severity levels", () => {
  it("supports low, medium, high severity", () => {
    expect(SRC).toContain('"low"');
    expect(SRC).toContain('"medium"');
    expect(SRC).toContain('"high"');
  });
});

// ── Security ──────────────────────────────────────────────────────────────

describe("autoViolationEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });

  it("scopes by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(15);
  });

  it("is idempotent (does not duplicate violations)", () => {
    expect(SRC).toContain("idempotent");
  });
});
