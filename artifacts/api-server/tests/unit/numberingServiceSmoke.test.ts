import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SVC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/numberingService.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/213_unified_numbering_center.sql"),
  "utf8",
);
const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/numbering.ts"),
  "utf8",
);

// ─── Issue #1141 — central numbering authority ─────────────────────────────
// Smoke tests that lock the public surface of the numbering service, the
// shape of the migration, and the wired-in route helpers. They run without
// touching the database — the goal is to prevent silent regressions of the
// architectural contract (one service, four tables, scoped counters, audit).

describe("numberingService public surface", () => {
  it("exports issueNumber", () => {
    expect(SVC).toContain("export async function issueNumber");
  });
  it("exports reserveNumber / assignReservedNumber", () => {
    expect(SVC).toContain("export function reserveNumber");
    expect(SVC).toContain("export async function assignReservedNumber");
  });
  it("exports previewNextNumber", () => {
    expect(SVC).toContain("export async function previewNextNumber");
  });
  it("exports validateManualNumber / overrideNumber", () => {
    expect(SVC).toContain("export async function validateManualNumber");
    expect(SVC).toContain("export async function overrideNumber");
  });
  it("exports voidNumber", () => {
    expect(SVC).toContain("export async function voidNumber");
  });
  it("exports counter ops (reset / lock / unlock)", () => {
    expect(SVC).toContain("export async function resetCounter");
    expect(SVC).toContain("export async function lockCounter");
    expect(SVC).toContain("export async function unlockCounter");
  });
  it("exports assertNumberingAssignment guard", () => {
    expect(SVC).toContain("export async function assertNumberingAssignment");
  });
  it("exports the IssueResult / NumberingScheme types", () => {
    expect(SVC).toContain("export interface NumberingScheme");
    expect(SVC).toContain("export interface IssueResult");
    expect(SVC).toContain("export interface IssueParams");
  });
  it("exposes the policy / scope / timing / edit-policy unions", () => {
    expect(SVC).toContain('"never" | "yearly" | "monthly" | "seasonal" | "fiscal_year"');
    expect(SVC).toContain('"company" | "branch" | "module" | "entity" | "season" | "fiscal_year"');
    expect(SVC).toContain('"on_draft" | "on_submit" | "on_approval" | "on_posting"');
    expect(SVC).toContain('"disabled" | "draft_only" | "privileged" | "legacy_import_only"');
  });
});

describe("numberingService allocation contract", () => {
  it("runs the counter increment inside withTransaction", () => {
    expect(SVC).toContain("return withTransaction(async (client) => {");
  });
  it("locks the counter row with FOR UPDATE", () => {
    expect(SVC).toMatch(/FROM numbering_counters[\s\S]+FOR UPDATE/);
  });
  it("upserts the counter row before locking it", () => {
    // The upsert + lock dance prevents the (race) zero-row case on the
    // very first issue for a scope. Lock the contract so future
    // refactors don't drop the upsert and reintroduce the race.
    expect(SVC).toContain("INSERT INTO numbering_counters");
    expect(SVC).toContain("ON CONFLICT");
  });
  it("writes an audit log row on every issue", () => {
    expect(SVC).toContain("INSERT INTO numbering_audit_logs");
  });
  it("rejects locked counters", () => {
    expect(SVC).toContain('counter.lockedAt');
  });
  it("refuses random fallback — the service throws when the scheme is missing", () => {
    // Negative test: a route's fallback to a random number is the
    // exact defect the central numbering center exists to prevent. The
    // service must throw NotFoundError on a missing scheme.
    expect(SVC).toContain("لا توجد سياسة ترقيم لـ");
    expect(SVC).not.toMatch(/Math\.random\s*\(/);
  });
});

describe("numbering migration shape", () => {
  it("creates the four canonical tables", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS numbering_schemes");
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS numbering_counters");
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS numbering_assignments");
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS numbering_audit_logs");
  });
  it("enforces unique counter scope tuples", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]+numbering_counters_unique_scope/);
  });
  it("enforces unique (company, module, entity, number) on assignments", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]+numbering_assignments_unique_number/);
  });
  it("constrains the reset/scope/issue/manual-edit columns to the allowed unions", () => {
    expect(MIGRATION).toContain("CHECK (\"resetPolicy\"");
    expect(MIGRATION).toContain("CHECK (\"scopePolicy\"");
    expect(MIGRATION).toContain("CHECK (\"issueTiming\"");
    expect(MIGRATION).toContain("CHECK (\"manualEditPolicy\"");
  });
  it("seeds the default policy catalog (requests / contracts / correspondence / finance / …)", () => {
    expect(MIGRATION).toContain("'general_request'");
    expect(MIGRATION).toContain("'employee_contract'");
    expect(MIGRATION).toContain("'outgoing_letter'");
    expect(MIGRATION).toContain("'incoming_letter'");
    expect(MIGRATION).toContain("'sales_invoice'");
    expect(MIGRATION).toContain("'journal_entry'");
    expect(MIGRATION).toContain("'umrah_group'");
  });
  it("adds the branches.numberingCode column", () => {
    expect(MIGRATION).toContain('ALTER TABLE branches');
    expect(MIGRATION).toContain('"numberingCode"');
  });
});

describe("numbering admin routes", () => {
  it("exposes the management surface required by the issue", () => {
    expect(ROUTES).toMatch(/router\.get\(\s*["']\/schemes["']/);
    expect(ROUTES).toMatch(/router\.patch\(\s*["']\/schemes\/:id["']/);
    expect(ROUTES).toMatch(/router\.get\(\s*["']\/preview["']/);
    expect(ROUTES).toMatch(/router\.get\(\s*["']\/assignments["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/assignments\/:id\/override["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/assignments\/:id\/void["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/counters\/:id\/reset["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/counters\/:id\/lock["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/counters\/:id\/unlock["']/);
    expect(ROUTES).toMatch(/router\.get\(\s*["']\/audit["']/);
  });
  it("guards each surface with the new feature catalog keys", () => {
    expect(ROUTES).toContain('feature: "settings.numbering"');
    expect(ROUTES).toContain('feature: "settings.numbering.override"');
    expect(ROUTES).toContain('feature: "settings.numbering.reset"');
    expect(ROUTES).toContain('feature: "settings.numbering.audit"');
  });
  it("forces a reason field on every privileged action", () => {
    expect(ROUTES).toContain('reason: z.string().trim().min(3)');
  });
});

describe("priority-1 routes moved to the numbering center", () => {
  const REQ = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/requests.ts"),
    "utf8",
  );
  const CTR = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr-contracts.ts"),
    "utf8",
  );
  const COR = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/correspondence.ts"),
    "utf8",
  );

  it("requests.ts no longer calls nextval('request_number_seq') or random-fallback", () => {
    expect(REQ).not.toMatch(/nextval\(\s*['"`]request_number_seq/);
    expect(REQ).not.toMatch(/Math\.random[^;]*\bseq\b/);
    expect(REQ).toContain('issueNumber({');
    expect(REQ).toContain('moduleKey: "requests"');
    expect(REQ).toContain('entityKey: "general_request"');
  });
  it("hr-contracts.ts no longer calls nextval('contract_number_seq')", () => {
    expect(CTR).not.toMatch(/nextval\(\s*['"`]contract_number_seq/);
    expect(CTR).toContain('issueNumber({');
    expect(CTR).toContain('entityKey: "employee_contract"');
  });
  it("correspondence.ts no longer calls nextval on direction sequences", () => {
    expect(COR).not.toMatch(/nextval\(\s*\$1::regclass/);
    expect(COR).not.toMatch(/correspondence_outgoing_seq/);
    expect(COR).not.toMatch(/correspondence_incoming_seq/);
    expect(COR).toContain('issueCorrespondenceNumber');
    expect(COR).toMatch(/outgoing_letter|incoming_letter/);
  });
});

describe("priority-2 routes migrated to the numbering center", () => {
  const HR  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");
  const EMP = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"), "utf8");
  const SUP = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/support.ts"), "utf8");
  const CRM = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/crm.ts"), "utf8");
  const POR = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/clientPortal.ts"), "utf8");
  const PRO = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/properties.ts"), "utf8");

  it("hr.ts no longer calls nextval('letter_number_seq')", () => {
    expect(HR).not.toMatch(/nextval\(\s*['"`]letter_number_seq/);
    expect(HR).toContain('entityKey: "official_letter"');
  });
  it("employees.ts no longer calls nextval('employee_number_seq')", () => {
    expect(EMP).not.toMatch(/nextval\(\s*['"`]employee_number_seq/);
    expect(EMP).toContain('entityKey: "employee_code"');
  });
  it("support.ts no longer issues TKT- via generateTimeRef", () => {
    expect(SUP).not.toMatch(/generateTimeRef\(\s*["']TKT["']\s*\)/);
    expect(SUP).toContain('entityKey: "support_ticket"');
  });
  it("crm.ts no longer issues CTR-CRM via generateTimeRef", () => {
    expect(CRM).not.toMatch(/generateTimeRef\(\s*["']CTR-CRM["']\s*\)/);
    expect(CRM).toContain('entityKey: "contract"');
  });
  it("clientPortal.ts no longer issues TKT via generateTimeRef", () => {
    expect(POR).not.toMatch(/generateTimeRef\(\s*["']TKT["']\s*\)/);
    expect(POR).toContain('entityKey: "support_ticket"');
  });
  it("properties.ts no longer issues RC / RCP via generateTimeRef", () => {
    expect(PRO).not.toMatch(/generateTimeRef\(\s*["']RC["']\s*\)/);
    expect(PRO).not.toMatch(/generateTimeRef\(\s*["']RCP["']\s*\)/);
    expect(PRO).toContain('entityKey: "lease_contract"');
    expect(PRO).toContain('entityKey: "lease_receipt"');
  });
});

describe("priority-2 numbering schemes seeded in migration 214", () => {
  const MIG = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/migrations/214_numbering_priority_2_schemes.sql"),
    "utf8",
  );
  it("seeds the new (module, entity) policies for every existing company", () => {
    expect(MIG).toContain("'official_letter'");
    expect(MIG).toContain("'employee_code'");
    expect(MIG).toContain("'lease_receipt'");
    expect(MIG).toMatch(/'crm',\s+'contract'/);
    expect(MIG).toContain("'purchase_receipt'");
    expect(MIG).toContain("'stock_transfer'");
    expect(MIG).toContain("'expense_voucher'");
  });
  it("uses ON CONFLICT to stay idempotent across reruns", () => {
    expect(MIG).toContain('ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING');
  });
});

describe("phase-3 cleanup — generateTimeRef removed from all routes (#1141)", () => {
  const CLI = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/clients.ts"), "utf8");
  const WHS = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"), "utf8");
  const POR = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/clientPortal.ts"), "utf8");
  const ALG = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-algorithms.ts"), "utf8");
  const SIG = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/digital-signature.ts"), "utf8");
  const INTERNAL = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/internalRef.ts"), "utf8");
  const MIG215 = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/migrations/215_numbering_client_code_scheme.sql"),
    "utf8",
  );

  it("clients.ts issues client code through the numbering center", () => {
    expect(CLI).not.toMatch(/generateTimeRef\(\s*["']CLT["']\s*\)/);
    expect(CLI).toContain('entityKey: "client_code"');
  });
  it("warehouse.ts no longer calls generateTimeRef for official refs", () => {
    expect(WHS).not.toMatch(/generateTimeRef\(\s*["']PR-AUTO["']\s*\)/);
    expect(WHS).not.toMatch(/generateTimeRef\(\s*["']TRANSFER["']\s*\)/);
    expect(WHS).toContain('entityKey: "purchase_request"');
    expect(WHS).toContain('entityKey: "stock_transfer"');
  });
  it("internal correlation refs (BATCH/BANK/SIG/PAY-PORTAL) go through lib/internalRef.ts", () => {
    expect(INTERNAL).toContain("export function internalTechRef");
    expect(WHS).toContain('internalTechRef("BATCH")');
    expect(POR).toContain('internalTechRef("PAY-PORTAL")');
    expect(ALG).toContain('internalTechRef("BANK")');
    expect(SIG).toContain('internalTechRef("SIG")');
  });
  it("migration 215 seeds the crm.client_code scheme for every company", () => {
    expect(MIG215).toContain("'crm', 'client_code'");
    expect(MIG215).toContain("CLT");
    expect(MIG215).toContain('ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING');
  });
});

describe("finance routes migrated to the numbering center", () => {
  const INV = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
    "utf8",
  );
  const JOU = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
    "utf8",
  );
  const PUR = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
    "utf8",
  );

  it("finance-invoices.ts no longer calls nextval('invoice_number_seq')", () => {
    expect(INV).not.toMatch(/nextval\(\s*['"`]invoice_number_seq/);
    expect(INV).toContain('issueNumber({');
    expect(INV).toContain('entityKey: "sales_invoice"');
  });
  it("finance-journal.ts no longer calls nextval('journal_number_seq') or random fallback", () => {
    expect(JOU).not.toMatch(/nextval\(\s*['"`]journal_number_seq/);
    expect(JOU).not.toMatch(/Math\.random[^;]*\bseq\b/);
    expect(JOU).toContain('issueNumber({');
    expect(JOU).toContain('entityKey: "journal_entry"');
  });
  it("finance-purchase.ts no longer calls nextval('pr_number_seq')/'po_number_seq'", () => {
    expect(PUR).not.toMatch(/nextval\(\s*['"`]pr_number_seq/);
    expect(PUR).not.toMatch(/nextval\(\s*['"`]po_number_seq/);
    expect(PUR).not.toMatch(/Math\.random[^;]*\bseq\b/);
    expect(PUR).toContain('entityKey: "purchase_request"');
    expect(PUR).toContain('entityKey: "purchase_order"');
  });
});

describe("CI guard — direct numbering inside routes", () => {
  const LINT = readFileSync(
    join(REPO_ROOT, "scripts/src/lint-patterns.mjs"),
    "utf8",
  );
  it("declares the three numbering-center lint rules", () => {
    expect(LINT).toContain('id: "nextval-in-route"');
    expect(LINT).toContain('id: "generateTimeRef-as-official-number"');
    expect(LINT).toContain('id: "random-as-ref-fallback"');
  });
  it("references Issue #1141 for the rules' rationale", () => {
    expect(LINT).toContain("Issue #1141");
  });
  it("also bans generateRef / generateBranchRef inside routes (phase-4 guard)", () => {
    expect(LINT).toContain('id: "generateRef-or-generateBranchRef-in-route"');
  });
});

describe("phase-4 — GRN + umrah agent invoice now go through the numbering center (#1141)", () => {
  const PUR = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"), "utf8");
  const UMR = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"), "utf8");

  it("finance-purchase.ts uses numberingService for GRN refs (no MAX+retry hot path)", () => {
    expect(PUR).not.toMatch(/generateRef\(\s*["']GRN["']/);
    expect(PUR).not.toMatch(/uq_goods_receipts_ref/);
    expect(PUR).toContain('entityKey: "goods_receipt"');
  });
  it("umrah.ts uses numberingService for agent invoices with seasonId scope", () => {
    expect(UMR).not.toMatch(/generateBranchRef\(\s*scope\s*,\s*["']invoice_prefix["']/);
    expect(UMR).toContain('entityKey: "umrah_agent_invoice"');
    expect(UMR).toContain("seasonId,");
  });
});

describe("UX simplification + backfill (#1141 phase 5)", () => {
  const TAB = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/settings/numbering-tab.tsx"),
    "utf8",
  );
  const BACKFILL = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/lib/numberingBackfill.ts"),
    "utf8",
  );
  const MIG216 = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/migrations/216_numbering_backfill_metadata.sql"),
    "utf8",
  );
  const ROUTES = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/numbering.ts"),
    "utf8",
  );

  it("numbering tab does NOT use forbidden Dialog/Modal popups", () => {
    // No popup imports — the new UX uses inline master/detail.
    expect(TAB).not.toMatch(/from\s+["']@\/components\/ui\/dialog["']/);
    expect(TAB).not.toMatch(/<DialogContent\b/);
    expect(TAB).not.toMatch(/<DialogHeader\b/);
  });
  it("numbering tab exposes the three end-user presets", () => {
    expect(TAB).toContain("per_branch_yearly");
    expect(TAB).toContain("company_yearly");
    expect(TAB).toContain("per_season");
    expect(TAB).toContain("كل فرع رقم مستقل");
    expect(TAB).toContain("رقم واحد للشركة");
    expect(TAB).toContain("حسب الموسم");
  });
  it("numbering tab hides expert fields behind an advanced toggle", () => {
    expect(TAB).toContain("إعدادات متقدمة");
    expect(TAB).toContain("showAdvanced");
  });
  it("numbering tab renders a backfill banner with row count + action", () => {
    expect(TAB).toContain("BackfillBanner");
    expect(TAB).toContain("/numbering/schemes/${scheme.id}/backfill");
  });
  it("numberingBackfill exports the backfill API surface", () => {
    expect(BACKFILL).toContain("export async function backfillScheme");
    expect(BACKFILL).toContain("export async function backfillAllSchemes");
    expect(BACKFILL).toContain("export async function previewBackfill");
    expect(BACKFILL).toContain("export function extractSequenceFromRef");
  });
  it("backfill rejects non-identifier table/column names (SQL-injection guard)", () => {
    expect(BACKFILL).toContain("safeIdent");
    expect(BACKFILL).toMatch(/\/\^\[a-zA-Z_\]\[a-zA-Z0-9_\]\{0,62\}\$\//);
  });
  it("backfill ratchets the counter — never decrements", () => {
    expect(BACKFILL).toContain('GREATEST("lastNumber"');
    expect(BACKFILL).toContain('GREATEST("nextNumber"');
  });
  it("migration 216 adds the backfill-metadata columns + seeds entity-table mapping", () => {
    expect(MIG216).toContain('"defaultEntityTable"');
    expect(MIG216).toContain('"defaultRefColumn"');
    expect(MIG216).toContain('"lastBackfillAt"');
    expect(MIG216).toContain("'general_request',     'requests'");
    expect(MIG216).toContain("'employee_contract',   'employee_contracts'");
    expect(MIG216).toContain("'umrah_agent_invoice', 'umrah_agent_invoices'");
  });
  it("backfill endpoints are wired through the numbering router with override RBAC", () => {
    expect(ROUTES).toMatch(/router\.get\(\s*["']\/schemes\/:id\/backfill\/preview["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/schemes\/:id\/backfill["']/);
    expect(ROUTES).toMatch(/router\.post\(\s*["']\/backfill-all["']/);
    // The destructive endpoints sit behind `settings.numbering.reset`
    // — same guard that protects counter resets.
    expect(ROUTES).toMatch(/backfill["'][\s\S]{0,200}feature:\s*"settings\.numbering\.reset"/);
  });
});

