// #2140 slice 2-أ — static guards for the AP accounting anchors. DB-free, so
// they run in guard CI (which loads the schema dump but seeds no chart). They
// pin the three artefacts that make the vendor documents postable on a clean
// install: the new chart account, the migration that binds the intents, and
// the corrected handler fallbacks. A regression in any of them re-opens the
// "vendor invoice/advance/credit 500 on a fresh tenant" class.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const BOOTSTRAP = read("artifacts/api-server/src/lib/companyBootstrap.ts");
const MIGRATION = read("artifacts/api-server/src/migrations/336_vendor_ap_accounting_anchors.sql");
const HANDLERS = read("artifacts/api-server/src/routes/finance-purchase.ts");
const PROVISION = read("scripts/provision-agent-db.sh");

describe("1190 'دفعات مقدمة للموردين' is in the canonical chart template", () => {
  it("companyBootstrap seeds 1190 as a postable asset under 1100", () => {
    const line = BOOTSTRAP.split("\n").find((l) => l.includes('code: "1190"'));
    expect(line, "1190 must be in DEFAULT_CHART_OF_ACCOUNTS").toBeTruthy();
    expect(line).toContain('type: "asset"');
    expect(line).toContain('parentCode: "1100"');
    expect(line).toContain('level: 3');
    // postable = NOT marked allowPosting:false (default true)
    expect(line).not.toContain("allowPosting: false");
  });
});

describe("migration 336 binds every AP intent to a postable account", () => {
  const intents: [string, string][] = [
    ["vendor_advance_receivable", "1190"],
    ["vendor_advance_cash", "1111"],
    ["purchase_vendor_ap", "2111"],
    ["vendor_credit_clearing", "2111"],
    ["vendor_invoice_expense", "5340"],
    ["vendor_return_revenue", "5110"],
    ["purchase_vat_input", "1180"],
    ["vat_input_reversal", "1180"],
    ["purchase_grni", "2150"],
  ];
  it("maps all nine intents to their target codes", () => {
    for (const [op, code] of intents) {
      const re = new RegExp(`'${op}',\\s*'${code}'`);
      expect(MIGRATION).toMatch(re);
    }
  });
  it("inserts 1190 into the chart for every company (idempotent)", () => {
    expect(MIGRATION).toMatch(/INSERT INTO chart_of_accounts/);
    expect(MIGRATION).toContain("'دفعات مقدمة للموردين'");
    expect(MIGRATION).toMatch(/ON CONFLICT \("companyId", code\) DO NOTHING/);
  });
  it("only binds where the target account is postable (never a group)", () => {
    expect(MIGRATION).toMatch(/a\."allowPosting"\s*=\s*true/);
  });
  it("fills empty mapping rows only — never overwrites a tenant customisation", () => {
    expect(MIGRATION).toMatch(/ON CONFLICT \("companyId", "operationType"\) DO UPDATE/);
    expect(MIGRATION).toMatch(/WHERE accounting_mappings\."debitAccountCode" IS NULL/);
  });
  it("carries the policy-required rollback annotation", () => {
    expect(MIGRATION).toMatch(/--\s*@rollback/);
  });
});

describe("handler fallbacks no longer point at broken accounts", () => {
  it("no vendor/AP intent falls back to a missing or group account", () => {
    // The broken set: 1420/1400 (missing), 2100/2110/5400 (group), 5550 (wrong), 2115 (missing).
    const brokenFallbacks = [
      /"vendor_advance_receivable", "(debit|credit)", "1420"/,
      /"vendor_advance_cash", "credit", "1100"/,
      /"purchase_vendor_ap", "(debit|credit)", "2100"/,
      /"vendor_credit_clearing", "credit", "2110"/,
      /"vendor_invoice_expense", "debit", "5400"/,
      /"vendor_return_revenue", "credit", "5550"/,
      /"purchase_vat_input", "debit", "1400"/,
      /"vat_input_reversal", "credit", "1400"/,
      /"purchase_grni", "(debit|credit)", "2115"/,
    ];
    for (const re of brokenFallbacks) {
      expect(HANDLERS, `broken fallback still present: ${re}`).not.toMatch(re);
    }
  });
  it("the corrected postable fallbacks are present", () => {
    expect(HANDLERS).toMatch(/"vendor_advance_receivable", "debit", "1190"/);
    expect(HANDLERS).toMatch(/"purchase_vendor_ap", "credit", "2111"/);
    expect(HANDLERS).toMatch(/"vendor_invoice_expense", "debit", "5340"/);
    expect(HANDLERS).toMatch(/"vendor_return_revenue", "credit", "5110"/);
    expect(HANDLERS).toMatch(/"purchase_vat_input", "debit", "1180"/);
  });
});

describe("clean-install harness replays 336 after companies seed", () => {
  it("336 is in the provisioner SEED_REPLAY_ALLOWLIST", () => {
    // 336 CROSS JOINs companies (empty at migrate-step) so it must replay
    // after the company seeds, exactly like 312.
    expect(PROVISION).toContain("336_vendor_ap_accounting_anchors.sql");
  });
});
