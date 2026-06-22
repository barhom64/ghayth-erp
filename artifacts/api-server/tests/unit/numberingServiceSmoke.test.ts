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

describe("phase-6 enterprise hardening (#1141)", () => {
  const SVC2 = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/numberingService.ts"), "utf8");
  const MIG217 = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/migrations/217_numbering_full_coverage.sql"),
    "utf8",
  );
  const AUDIT = readFileSync(
    join(REPO_ROOT, "scripts/src/audit-numbering-coverage.mjs"),
    "utf8",
  );
  const GUARD = readFileSync(join(REPO_ROOT, "scripts/guard.sh"), "utf8");

  it("lifecycle gate — validateManualNumber + voidNumber now check lockAfterStatuses", () => {
    expect(SVC2).toContain("export async function readEntityStatus");
    expect(SVC2).toContain("function lockAfterApplies");
    // Both lifecycle-aware functions call into the gate.
    expect(SVC2).toMatch(/lockAfterApplies\(scheme,\s*status\)/);
    expect(SVC2).toContain("هذه الحالة مقفلة بموجب سياسة الترقيم");
  });

  it("migration 217 adds the 5 new schemes (hr.loan/overtime/exit + bank_guarantee + legal.case)", () => {
    expect(MIG217).toMatch(/'hr',\s+'loan'/);
    expect(MIG217).toMatch(/'hr',\s+'overtime'/);
    expect(MIG217).toMatch(/'hr',\s+'exit'/);
    expect(MIG217).toMatch(/'finance',\s+'bank_guarantee'/);
    expect(MIG217).toMatch(/'legal',\s+'case'/);
  });
  it("migration 217 enforces UNIQUE on every executive ref column", () => {
    expect(MIG217).toContain("uniq_requests_ref");
    expect(MIG217).toContain("uniq_invoices_ref");
    expect(MIG217).toContain("uniq_journal_entries_ref");
    expect(MIG217).toContain("uniq_purchase_orders_ref");
    expect(MIG217).toContain("uniq_employee_contracts_ref");
    expect(MIG217).toContain("uniq_correspondence_ref");
    expect(MIG217).toContain("uniq_hr_employee_loans_loanNumber");
    expect(MIG217).toContain("uniq_bank_guarantees_ref");
    expect(MIG217).toContain("uniq_legal_cases_caseNumber");
    expect(MIG217).toContain("uniq_fleet_trips_ref");
    expect(MIG217).toContain("uniq_projects_ref");
  });
  it("migration 217 adds the new ref columns on fleet_trips / projects / umrah_groups.internalRef", () => {
    expect(MIG217).toContain("ALTER TABLE fleet_trips ADD COLUMN IF NOT EXISTS ref");
    expect(MIG217).toContain("ALTER TABLE projects    ADD COLUMN IF NOT EXISTS ref");
    expect(MIG217).toContain('ALTER TABLE umrah_groups ADD COLUMN IF NOT EXISTS "internalRef"');
  });

  it("Stop-Ship audit gate is wired into the guard pipeline", () => {
    expect(GUARD).toContain("audit:numbering-coverage");
    expect(GUARD).toContain("audit-numbering-coverage.mjs");
  });
  it("audit-numbering-coverage knows every executive table that ships an official number", () => {
    expect(AUDIT).toContain('"requests"');
    expect(AUDIT).toContain('"invoices"');
    expect(AUDIT).toContain('"hr_employee_loans"');
    expect(AUDIT).toContain('"hr_overtime_requests"');
    expect(AUDIT).toContain('"hr_exit_requests"');
    expect(AUDIT).toContain('"bank_guarantees"');
    expect(AUDIT).toContain('"legal_cases"');
    expect(AUDIT).toContain('"fleet_trips"');
    expect(AUDIT).toContain('"projects"');
    expect(AUDIT).toContain('"umrah_groups"');
  });
});

describe("phase-6 — 9 priority-2 routes migrated to numberingService", () => {
  const HRL = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-loans.ts"), "utf8");
  const HRO = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-overtime.ts"), "utf8");
  const HRE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"), "utf8");
  const FH  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-hardening.ts"), "utf8");
  const PRJ = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/projects.ts"), "utf8");
  const LGL = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/legal.ts"), "utf8");
  const FLT = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
  const CMC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/communications.ts"), "utf8");
  const UME = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"), "utf8");
  // U-07 Phase 6: sub-agents routes (including client_code numbering) live here.
  const UMSA = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-sub-agents.ts"), "utf8");

  it("hr-loans.ts now issues hr.loan", () => {
    expect(HRL).toContain('entityKey: "loan"');
    expect(HRL).toContain('issueNumber({');
  });
  it("hr-overtime.ts now issues hr.overtime", () => {
    expect(HRO).toContain('entityKey: "overtime"');
  });
  it("hr-exit.ts now issues hr.exit", () => {
    expect(HRE).toContain('entityKey: "exit"');
  });
  it("finance-hardening.ts issues both bank_guarantee + project", () => {
    expect(FH).toContain('entityKey: "bank_guarantee"');
    expect(FH).toContain('entityKey: "project"');
  });
  it("projects.ts (main) issues projects.project", () => {
    expect(PRJ).toContain('entityKey: "project"');
  });
  it("legal.ts issues both crm.contract + legal.case", () => {
    expect(LGL).toContain('entityKey: "contract"');
    expect(LGL).toContain('entityKey: "case"');
  });
  it("fleet.ts issues fleet.fleet_trip and voids on sourceKey dedupe through the service", () => {
    expect(FLT).toContain('entityKey: "fleet_trip"');
    // After G8 fix: void goes through voidNumber({...}) instead of a
    // direct UPDATE numbering_assignments SET status='voided'.
    expect(FLT).toContain("voidNumber(");
    expect(FLT).toContain("fleet trip de-duplicated by sourceKey");
    // Inverse: the direct-UPDATE pattern must NOT come back.
    expect(FLT).not.toMatch(/UPDATE\s+numbering_assignments\s+SET\s+status='voided'/);
  });
  it("communications.ts issues real refs for derived tickets + requests", () => {
    expect(CMC).toMatch(/entityKey:\s*"support_ticket"/);
    expect(CMC).toMatch(/entityKey:\s*"general_request"/);
  });
  it("umrah routes issue client_code (sub-agents) + umrah_group internalRef", () => {
    // client_code moved to umrah-sub-agents.ts (U-07 Phase 6 carve-out)
    expect(UMSA).toContain('entityKey: "client_code"');
    expect(UME).toContain('entityKey: "umrah_group"');
  });
});

describe("phase-7 real-closure (#1141)", () => {
  const SVC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/numberingService.ts"), "utf8");
  const MIG218 = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/migrations/218_drop_legacy_numbering_sequences.sql"),
    "utf8",
  );
  const REQ = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/requests.ts"), "utf8");
  const REPORT = readFileSync(
    join(REPO_ROOT, "scripts/src/numbering-backfill-report.mjs"),
    "utf8",
  );
  const AUDIT = readFileSync(
    join(REPO_ROOT, "scripts/src/audit-numbering-coverage.mjs"),
    "utf8",
  );

  it("migration 218 drops every legacy numbering sequence", () => {
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.request_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.contract_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.correspondence_outgoing_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.correspondence_incoming_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.letter_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.invoice_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.journal_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.pr_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.po_number_seq");
    expect(MIG218).toContain("DROP SEQUENCE IF EXISTS public.employee_number_seq");
  });

  it("readEntityStatus discovers status column via information_schema (lifecycle gate fix)", () => {
    expect(SVC).toContain("STATUS_COLUMN_CANDIDATES");
    expect(SVC).toContain("approvalStatus");
    expect(SVC).toContain("information_schema.columns");
    // Most-specific column wins — order matters.
    expect(SVC).toContain('"approvalStatus",');
  });

  it("requests.ts atomic flow — issue + INSERT + linkback all inside ONE withTransaction", () => {
    // The previous flow: issueNumber → INSERT → UPDATE.catch(...)
    // The new flow: withTransaction(async () => { issue; INSERT; UPDATE })
    // SAVEPOINT reentrancy in rawdb.ts makes issueNumber's own
    // withTransaction join the outer tx as a savepoint. If link-back
    // fails, the whole document rolls back.
    expect(REQ).toContain("await withTransaction(async () => {");
    // Critically: no .catch on the UPDATE link-back (the lawyer's
    // point #2 — failure of the link must NOT be swallowed).
    const updateIdx = REQ.indexOf('UPDATE numbering_assignments SET "entityId"');
    expect(updateIdx).toBeGreaterThan(-1);
    const surroundings = REQ.slice(updateIdx, updateIdx + 400);
    expect(surroundings).not.toMatch(/\.catch\(/);
  });

  it("backfill report script exists + uses previewBackfill query shape", () => {
    expect(REPORT.toLowerCase()).toContain("backfillscheme");
    expect(REPORT).toContain("legacy refs unimported");
    expect(REPORT).toContain("information_schema.columns");
  });

  it("audit-numbering-coverage proves zero legacy patterns survive", () => {
    expect(AUDIT).toContain("LEGACY_PATTERNS");
    expect(AUDIT).toContain("zero legacy patterns remain");
  });

  it("issueTiming enforcement — service refuses on mismatch (lawyer's nit #6)", () => {
    // The service must hard-throw when the route's expectedTiming
    // disagrees with scheme.issueTiming. Without this check the timing
    // field in the settings UI is decorative — flip it to on_posting
    // and routes still issue silently at draft time.
    expect(SVC).toMatch(/scheme\.issueTiming\s*!==\s*params\.expectedTiming/);
    expect(SVC).toContain("توقيت الإصدار");
  });

  it("issueTiming enforcement — IssueParams requires expectedTiming", () => {
    // Type-level enforcement: omitting expectedTiming should fail
    // typecheck. We check that the param is declared without `?`
    // (i.e. required) inside the IssueParams interface.
    const ifaceIdx = SVC.indexOf("export interface IssueParams");
    expect(ifaceIdx).toBeGreaterThan(-1);
    const ifaceBlock = SVC.slice(ifaceIdx, ifaceIdx + 2500);
    expect(ifaceBlock).toMatch(/expectedTiming:\s*IssueTiming;/);
    expect(ifaceBlock).not.toMatch(/expectedTiming\?:/);
  });

  it("issueTiming enforcement — all 35 route callsites pass expectedTiming", () => {
    // Walk all route files that contain `issueNumber({` and verify each
    // call object literal contains an `expectedTiming` field. Catches
    // the case where someone adds a new route but forgets the timing
    // (which would now also fail typecheck, but a fast unit test is
    // friendlier in PR review).
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const routesDir = join(REPO_ROOT, "artifacts/api-server/src/routes");
    const files = fs.readdirSync(routesDir).filter((f: string) => f.endsWith(".ts"));
    const missingFields: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(routesDir, f), "utf8");
      let i = 0;
      while (true) {
        const idx = src.indexOf("issueNumber({", i);
        if (idx === -1) break;
        // Find matching `})`
        let depth = 1;
        let j = idx + "issueNumber({".length;
        while (j < src.length && depth > 0) {
          const ch = src[j];
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
          j++;
        }
        const block = src.slice(idx, j);
        if (!/expectedTiming\s*:/.test(block)) {
          // Compute line number
          const lineNo = src.slice(0, idx).split("\n").length;
          missingFields.push(`${f}:${lineNo}`);
        }
        i = j;
      }
    }
    expect(missingFields, `routes missing expectedTiming: ${missingFields.join(", ")}`).toEqual([]);
  });

  it("coverage report 2026-05-27 exists and documents all 15 known gaps", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = join(REPO_ROOT, "docs/architecture/numbering-coverage-report-2026-05-27.md");
    expect(fs.existsSync(path)).toBe(true);
    const md = fs.readFileSync(path, "utf8");
    // Each gap MUST be enumerated by its G-code so the file can't be
    // silently truncated/edited to hide gaps. Updated to 15 after the
    // second-round audit (audit-numbering-service-bypass +
    // audit-numbering-schemes-vs-callers + per-table check).
    for (const id of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15"]) {
      expect(md, `coverage report missing ${id}`).toMatch(new RegExp(`G${id.slice(1)}\\.|^\\|\\s*${id}\\s*\\|`, "m"));
    }
    // The report must explicitly refuse to claim full closure — the
    // lawyer's standard from 2026-05-27.
    expect(md).toMatch(/لا يدّعي الاكتمال|لا تُغلق|ثغر(ة|ات)/);
    expect(md).toContain("15 ثغرة");
  });

  it("audit-numbering-service-bypass script exists and gates direct numbering_* writes", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = join(REPO_ROOT, "scripts/src/audit-numbering-service-bypass.mjs");
    expect(fs.existsSync(path)).toBe(true);
    const src = fs.readFileSync(path, "utf8");
    expect(src).toContain("NUMBERING_TABLES");
    expect(src).toContain("LEGITIMATE_WRITERS");
    expect(src).toContain("ALLOWED_LINKBACK_RE");
    // Must scan the entire src/ tree, not just routes/.
    expect(src).toContain("artifacts/api-server/src");
    // Sequence reinvention check must look for COUNT(*) + 1.
    expect(src).toContain("COUNT\\s*\\(\\s*\\*\\s*\\)");
  });

  it("audit-numbering-schemes-vs-callers script exists and cross-checks seed vs runtime", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = join(REPO_ROOT, "scripts/src/audit-numbering-schemes-vs-callers.mjs");
    expect(fs.existsSync(path)).toBe(true);
    const src = fs.readFileSync(path, "utf8");
    expect(src).toContain("extractSeededSchemes");
    expect(src).toContain("extractCalledSchemes");
    // Must fail CI when a called (moduleKey,entityKey) has no seed.
    expect(src).toContain('process.exit(1)');
  });

  it("audit-numbering-coverage enforces per-table coverage with documented exemptions", () => {
    // The stronger check catches files that issue for SOME tables but
    // INSERT into OTHER tables without issuing. After G10-G14 closures
    // the PER_TABLE_EXEMPTIONS map is now empty; the test just locks
    // the structure (map exists + helper exists + closure comment cites
    // the G-codes so the audit script still documents the journey).
    expect(AUDIT).toContain("PER_TABLE_EXEMPTIONS");
    expect(AUDIT).toContain("tablesIssuedFor");
    expect(AUDIT).toMatch(/G10[–-]G14|G1[0-5]/);
  });

  it("audit-numbering-coverage extends scan to lib/engines + cron + disciplineEngine", () => {
    // The 2026-05-27 review demanded the audit reach beyond routes/.
    // This test locks the broader scan in place so a future commit
    // can't silently revert it.
    expect(AUDIT).toContain("NON_ROUTE_SCAN_PATHS");
    expect(AUDIT).toContain("engines");
    expect(AUDIT).toContain("cronScheduler.ts");
    expect(AUDIT).toContain("disciplineEngine.ts");
    expect(AUDIT).toContain("NON_ROUTE_EXCEPTIONS");
    // Each non-route exception MUST cite either a covering caller or
    // the open gap in the coverage report — no silent exemptions.
    expect(AUDIT).toMatch(/coverage report.*G[1-9]|caller MUST issue/);
  });

  it("inline-date-now-as-ref lint rule is now a hard rule (no baseline)", () => {
    const LINT = readFileSync(join(REPO_ROOT, "scripts/src/lint-patterns.mjs"), "utf8");
    expect(LINT).toContain('id: "inline-date-now-as-ref"');
    // After every offender closed, the rule is hard — zero baseline.
    // Any new inline-Date.now ref fails CI immediately.
    const ruleStart = LINT.indexOf('id: "inline-date-now-as-ref"');
    const ruleSection = LINT.slice(ruleStart, ruleStart + 1500);
    expect(ruleSection).not.toMatch(/countBaseline:\s*[1-9]/);
    // The comment must document every closure so a future reader knows
    // which fixes closed which offenders without running git blame.
    // `s` flag makes `.` cross newlines so the closure-list comment
    // can span multiple lines naturally.
    expect(LINT).toMatch(/communications\.ts[\s\S]{0,200}internalTechRef/);
    expect(LINT).toMatch(/finance-invoices\.ts[\s\S]{0,200}customer_advance/);
    expect(LINT).toMatch(/properties\.ts[\s\S]{0,200}"case"|properties\.ts[\s\S]{0,200}entityKey:\s*"case"/);
  });
});

