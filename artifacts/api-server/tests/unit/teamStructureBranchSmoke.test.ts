/**
 * Smoke tests for the team-structure branch's new HR + Property endpoints.
 *
 * The pattern follows adminSmoke.test.ts: read the route file as text and
 * assert the key contracts are in place. These aren't full integration tests
 * — those live under tests/integration with a DB — but they catch the
 * common regressions (RBAC dropped, tenant filter removed, GL closing leg
 * unwired, sourceKey re-introducing Date.now) that the original
 * implementations were specifically careful about.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WPS_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/hr-wps.ts"),
  "utf8",
);
const COMPLIANCE_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/hr-compliance.ts"),
  "utf8",
);
const PROPERTIES_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/properties.ts"),
  "utf8",
);
const LEGAL_ENGINE_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/lib/engines/legalEngine.ts"),
  "utf8",
);
const PROPERTIES_ENGINE_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/lib/engines/propertiesEngine.ts"),
  "utf8",
);
const WPS_BUILDER_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/lib/saudi-compliance/wps/builder.ts"),
  "utf8",
);
const WPS_SHARED_SRC = readFileSync(
  join(
    import.meta.dirname!,
    "../../src/lib/saudi-compliance/wps/formats/_shared.ts",
  ),
  "utf8",
);

// ────────────────────────────────────────────────────────────────────────────
// WPS — /hr/wps/*
// ────────────────────────────────────────────────────────────────────────────

describe("hr-wps — RBAC enforcement", () => {
  const endpoints = [
    { method: "get", path: "/wps/settings", action: "view" },
    { method: "get", path: "/wps/preflight/:payrollRunId", action: "view" },
    { method: "get", path: "/wps/runs", action: "list" },
    { method: "get", path: "/wps/runs/:id", action: "view" },
    { method: "post", path: "/wps/runs", action: "create" },
    { method: "get", path: "/wps/runs/:id/file", action: "export" },
    { method: "post", path: "/wps/runs/:id/submit", action: "submit" },
    { method: "post", path: "/wps/runs/:id/ack", action: "update" },
  ];

  for (const ep of endpoints) {
    it(`${ep.method.toUpperCase()} ${ep.path} requires hr.payroll.wps:${ep.action}`, () => {
      const sig = `router.${ep.method}(\n  "${ep.path}"`;
      const idx = WPS_SRC.indexOf(sig);
      expect(idx, `endpoint ${ep.method.toUpperCase()} ${ep.path} not found`).toBeGreaterThan(-1);
      const section = WPS_SRC.slice(idx, idx + 400);
      expect(section).toContain('feature: "hr.payroll.wps"');
      expect(section).toContain(`action: "${ep.action}"`);
    });
  }
});

describe("hr-wps — tenant isolation + safety", () => {
  it("POST /wps/runs blocks rebuild when existing run is non-draft", () => {
    expect(WPS_SRC).toContain('existing && existing.status !== "draft"');
    expect(WPS_SRC).toContain("ConflictError");
    // The ConflictError message references the period+bank context the
    // operator needs to navigate to the existing run.
    expect(WPS_SRC).toMatch(/wpsRunId: existing\.id/);
  });

  it("settings + preflight responses pass through maskFields", () => {
    // sensitive fields (bankIban / iqamaOrId / amount) declared in
    // featureCatalog — maskFields must wrap responses so role-level
    // field policies are respected.
    const settingsIdx = WPS_SRC.indexOf('"/wps/settings"');
    const settingsBody = WPS_SRC.slice(settingsIdx, settingsIdx + 800);
    expect(settingsBody).toContain("maskFields(req,");

    const preflightIdx = WPS_SRC.indexOf("/wps/preflight/");
    const preflightBody = WPS_SRC.slice(preflightIdx, preflightIdx + 3500);
    expect(preflightBody).toContain("maskFields(req,");
  });

  it("payroll_lines query JOINs on employee_assignments.companyId", () => {
    expect(WPS_SRC).toMatch(/JOIN employee_assignments ea ON ea\.id = pl\."assignmentId" AND ea\."companyId" = \$2/);
  });

  it("only approved/paid payroll runs can produce a WPS file", () => {
    expect(WPS_SRC).toContain('run.status !== "approved" && run.status !== "paid"');
  });

  it("invalid Saudi IBAN entries are dropped, not silently included", () => {
    expect(WPS_SRC).toContain("isSaudiIban(l.iban)");
    expect(WPS_SRC).toContain('reason: "invalid_iban"');
  });

  it("preflight separates zero-amount from missingIban bucket", () => {
    // Operators chasing 'no IBAN' for an employee whose deductions ate
    // the whole check would update the wrong field. The zeroAmount
    // bucket disambiguates the two.
    expect(WPS_SRC).toContain("const zeroAmount:");
    expect(WPS_SRC).toMatch(/zeroAmount\.push\(\{.*netSalary: amount.*\}\)/);
    expect(WPS_SRC).toMatch(/skippedCount:\s*\n?\s*missingIban\.length \+ missingId\.length \+ invalidIban\.length \+ zeroAmount\.length/);
  });

  it("library FSM violations are mapped to typed HTTP errors", () => {
    // submit + ack catch the lib's plain Error and re-throw as
    // NotFoundError / ConflictError so the frontend gets a structured code.
    expect(WPS_SRC).toMatch(/msg\.includes\("not found"\)/);
    expect(WPS_SRC).toMatch(/msg\.includes\("Illegal"\)/);
    expect(WPS_SRC).toMatch(/msg\.includes\("only valid"\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Saudization — /hr/saudization/*
// ────────────────────────────────────────────────────────────────────────────

describe("hr-compliance — Saudization endpoints", () => {
  const endpoints = [
    { method: "get", path: "/saudization/current", action: "view" },
    { method: "get", path: "/saudization/history", action: "list" },
    { method: "post", path: "/saudization/refresh", action: "update" },
  ];

  for (const ep of endpoints) {
    it(`${ep.method.toUpperCase()} ${ep.path} requires hr.saudization:${ep.action}`, () => {
      const idx = COMPLIANCE_SRC.indexOf(`"${ep.path}"`);
      expect(idx, `endpoint ${ep.path} not found`).toBeGreaterThan(-1);
      const section = COMPLIANCE_SRC.slice(idx, idx + 400);
      expect(section).toContain('feature: "hr.saudization"');
      expect(section).toContain(`action: "${ep.action}"`);
    });
  }

  it("refresh uses ON CONFLICT against the existing unique index", () => {
    expect(COMPLIANCE_SRC).toContain('ON CONFLICT ("companyId", period)');
  });

  it("history is bounded — caller can't request more than 36 months", () => {
    expect(COMPLIANCE_SRC).toContain("Math.min(36");
  });

  it("/current returns both live + stored so the UI can show drift", () => {
    const idx = COMPLIANCE_SRC.indexOf('"/saudization/current"');
    const section = COMPLIANCE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("live:");
    expect(section).toContain("stored:");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Property Owner Statement + Payout
// ────────────────────────────────────────────────────────────────────────────

describe("properties — owner statement (read-model)", () => {
  it("GET /owners/:id/statement enforces properties.owners:view + resource", () => {
    const idx = PROPERTIES_SRC.indexOf('"/owners/:id/statement"');
    expect(idx).toBeGreaterThan(-1);
    const section = PROPERTIES_SRC.slice(idx, idx + 500);
    expect(section).toContain('feature: "properties.owners"');
    expect(section).toContain('action: "view"');
    expect(section).toContain('table: "property_owners"');
  });

  it("rent_payments JOIN gates tenant via rental_contracts.companyId", () => {
    // rent_payments has NO companyId column (verified in schema_pre.sql).
    // Tenant isolation must come via the JOIN — same defensive pattern
    // as legal_sessions.
    const idx = PROPERTIES_SRC.indexOf('"/owners/:id/statement"');
    const block = PROPERTIES_SRC.slice(idx, idx + 8000);
    expect(block).toMatch(/LEFT JOIN rent_payments rp ON rp\."contractId" = c\.id/);
    expect(block).toMatch(/c\."companyId" = \$2/);
  });

  it("commission rate priority: query → system_settings → default 5", () => {
    const idx = PROPERTIES_SRC.indexOf('"/owners/:id/statement"');
    const block = PROPERTIES_SRC.slice(idx, idx + 8000);
    expect(block).toContain("let commissionRate = 5;");
    expect(block).toContain("'property.management_fee_rate'");
  });
});

describe("properties — owner payout (transactional)", () => {
  it("GET /owners/:id/payouts requires properties.owners:view", () => {
    const idx = PROPERTIES_SRC.indexOf('"/owners/:id/payouts"');
    expect(idx).toBeGreaterThan(-1);
    const getBlock = PROPERTIES_SRC.slice(idx, idx + 300);
    expect(getBlock).toContain('action: "view"');
  });

  it("POST /owners/:id/payouts requires properties.owners:create", () => {
    // The POST handler is the second occurrence of the path string.
    const first = PROPERTIES_SRC.indexOf('"/owners/:id/payouts"');
    const second = PROPERTIES_SRC.indexOf('"/owners/:id/payouts"', first + 1);
    expect(second).toBeGreaterThan(-1);
    const postBlock = PROPERTIES_SRC.slice(second, second + 500);
    expect(postBlock).toContain('action: "create"');
  });

  it("payout body schema enforces YYYY-MM period + dated range", () => {
    expect(PROPERTIES_SRC).toContain("z.string().regex(/^\\d{4}-\\d{2}$/");
    expect(PROPERTIES_SRC).toContain('createPayoutSchema');
  });

  it("payout rejects if a non-deleted row exists for the same period", () => {
    expect(PROPERTIES_SRC).toContain(
      'AND period = $3 AND "deletedAt" IS NULL'
    );
    expect(PROPERTIES_SRC).toMatch(/throw new ConflictError\("تم تسجيل دفعة لهذا المالك/);
  });

  it("payout rolls back the row when GL post throws", () => {
    expect(PROPERTIES_SRC).toContain('Owner payout GL post failed — rolling back payout row');
    expect(PROPERTIES_SRC).toContain('UPDATE property_owner_payouts SET "deletedAt" = NOW() WHERE id = $1');
    expect(PROPERTIES_SRC).toMatch(/throw new IntegrationError\("تعذّر إنشاء القيد المحاسبي للسداد/);
  });

  it("payout reuses scope.activeAssignmentId for paidBy (auditable)", () => {
    const second = PROPERTIES_SRC.lastIndexOf('"/owners/:id/payouts"');
    const block = PROPERTIES_SRC.slice(second, second + 4000);
    expect(block).toContain("scope.activeAssignmentId");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GL idempotency — sourceKey must NOT carry Date.now() (project-wide rule)
// ────────────────────────────────────────────────────────────────────────────

describe("GL idempotency — engine sourceKeys must be deterministic", () => {
  it("propertiesEngine.postOwnerPayoutGL keys on payoutId only", () => {
    const idx = PROPERTIES_ENGINE_SRC.indexOf("postOwnerPayoutGL");
    const block = PROPERTIES_ENGINE_SRC.slice(idx, idx + 2500);
    expect(block).toContain("sourceKey: `property:owner_payout:${payout.payoutId}`");
    expect(block).not.toContain("Date.now()");
  });

  it("legalEngine.postJudgmentPaymentGL keys on priorPaid_newPaid bounds", () => {
    const idx = LEGAL_ENGINE_SRC.indexOf("postJudgmentPaymentGL");
    const block = LEGAL_ENGINE_SRC.slice(idx, idx + 3500);
    expect(block).toContain("sourceKey: `legal:judgment_payment:${payment.judgmentId}:${increment}`");
    expect(block).not.toContain("Date.now()");
    // bounds must be the actual delta, not just the new total — otherwise
    // a series of payments would all collide on the same key.
    expect(block).toMatch(/const increment = `\$\{payment\.priorPaid\.toFixed\(2\)\}_\$\{payment\.newPaid\.toFixed\(2\)\}`/);
  });

  it("propertiesEngine.postOwnerPayoutGL books owner_payable debit + cash credit", () => {
    const idx = PROPERTIES_ENGINE_SRC.indexOf("postOwnerPayoutGL");
    const block = PROPERTIES_ENGINE_SRC.slice(idx, idx + 2500);
    expect(block).toMatch(/resolveAccountCode\(ctx\.companyId, "owner_payable", "debit"/);
    expect(block).toMatch(/resolveAccountCode\(ctx\.companyId, "cash", "credit"/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// WPS file builder — defense-in-depth against Excel formula injection
// ────────────────────────────────────────────────────────────────────────────

describe("WPS builder — CSV/Excel formula injection defense", () => {
  it("builder.ts sanitize tabs-prefixes leading =/+/-/@", () => {
    const idx = WPS_BUILDER_SRC.indexOf("function sanitize");
    const block = WPS_BUILDER_SRC.slice(idx, idx + 600);
    // Prefix-with-tab is the standard defense — invisible in the rendered
    // cell, parser-safe (every WPS spec treats remark as opaque text).
    expect(block).toMatch(/\/\^\[=\+\\?-@\\t\]\//);
    expect(block).toContain('"\\t" + v');
  });

  it("formats/_shared.ts sanitiseFreeText also prefixes leading formula chars", () => {
    const idx = WPS_SHARED_SRC.indexOf("function sanitiseFreeText");
    const block = WPS_SHARED_SRC.slice(idx, idx + 700);
    // _shared.ts feeds the per-bank adapters (alrajhi / ncb / riyad /
    // alinma / albilad). Without the same defense, the per-bank file
    // would still ship the dangerous remark even when the generic one
    // is clean — split-brain CSV safety.
    expect(block).toMatch(/\/\^\[=\+\\?-@\]\//);
    expect(block).toContain('"\\t" + v');
  });
});
