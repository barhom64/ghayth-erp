import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// UMRAH report + attachments route smoke — closes the CONTRIBUTING locks
// for the remaining 6 endpoints from PRs #305 (statement PDF +
// daily-runsheet) and #312 (attachments CRUD + reconciliation report).
//
// CONTRIBUTING:
//   §3.1  every endpoint scopes by companyId
//   §3.3  authorize({ feature: "umrah", action: ... })
//   §3.4  PDF/JSON output goes through pdfExport helpers (no ad-hoc
//         streaming logic) and respects the same scope as the JSON peer
//
// Static source scan, matching finalRoutesSmoke / umrahRoutesSmoke.
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const readRoute = (f: string) => readFileSync(join(root, "src/routes", f), "utf8");
const readMig = (f: string) => readFileSync(join(root, "src/migrations", f), "utf8");
const readLib = (f: string) => readFileSync(join(root, "src/lib", f), "utf8");

// U-07 Phase 11: daily-runsheet + reconciliation reports carved into umrah-reports.ts.
const UMRAH_REPORTS = readRoute("umrah-reports.ts");
// U-07 Phase 9: sub-agent statements (JSON + PDF) carved into a dedicated sub-router.
const UMRAH_STATEMENTS = readRoute("umrah-statements.ts");
// U-07 Phase 10: attachments (polymorphic document storage) carved into a dedicated sub-router.
const UMRAH_ATTACHMENTS = readRoute("umrah-attachments.ts");
const TEMPLATE_RESOLVER = readLib("print/templateResolver.ts");
const MIG_154 = readMig("154_umrah_attachments.sql");

// ──────────────────────────────────────────────────────────────────────────
// Attachments CRUD (PR #312)
// ──────────────────────────────────────────────────────────────────────────

// U-07 Phase 10: attachments carved verbatim into umrah-attachments.ts.
describe("umrah-attachments — attachments (PR #312; carved U-07 Phase 10)", () => {
  it("mounts GET /attachments + POST /attachments + DELETE /attachments/:id", () => {
    expect(UMRAH_ATTACHMENTS).toMatch(/router\.get\(["']\/attachments["']/);
    expect(UMRAH_ATTACHMENTS).toMatch(/router\.post\(["']\/attachments["']/);
    expect(UMRAH_ATTACHMENTS).toMatch(/router\.delete\(["']\/attachments\/:id["']/);
  });

  it("authorize gate per verb (list / create / delete)", () => {
    const getIdx = UMRAH_ATTACHMENTS.indexOf('.get("/attachments"');
    const postIdx = UMRAH_ATTACHMENTS.indexOf('.post("/attachments"');
    const delIdx = UMRAH_ATTACHMENTS.indexOf('.delete("/attachments/:id"');
    const slice = (i: number) => UMRAH_ATTACHMENTS.slice(i, i + 300);
    expect(slice(getIdx)).toMatch(/action:\s*["']list["']/);
    expect(slice(postIdx)).toMatch(/action:\s*["']create["']/);
    expect(slice(delIdx)).toMatch(/action:\s*["']delete["']/);
  });

  it("zod schema with entityType + type enum whitelists", () => {
    expect(UMRAH_ATTACHMENTS).toContain("createAttachmentSchema");
    // Both enums must reference the same 8 entity types declared in
    // the migration 154 CHECK constraint.
    expect(UMRAH_ATTACHMENTS).toContain("ATTACH_ENTITY_TYPES");
    expect(UMRAH_ATTACHMENTS).toContain("ATTACH_TYPES");
    expect(UMRAH_ATTACHMENTS).toMatch(/z\.enum\(ATTACH_ENTITY_TYPES\)/);
    expect(UMRAH_ATTACHMENTS).toMatch(/z\.enum\(ATTACH_TYPES\)/);
  });

  it("verifies owner via per-entityType table whitelist (no raw table-name injection)", () => {
    expect(UMRAH_ATTACHMENTS).toContain("ATTACH_OWNER_TABLE");
    expect(UMRAH_ATTACHMENTS).toContain("assertAttachmentOwner");
    // safeTable strip — only [a-zA-Z0-9_] allowed.
    expect(UMRAH_ATTACHMENTS).toMatch(/safeTable\s*=\s*table\.replace\(\/\[\^a-zA-Z0-9_\]\/g/);
  });

  it("owner verification scopes by companyId before insert", () => {
    const helperIdx = UMRAH_ATTACHMENTS.indexOf("function assertAttachmentOwner");
    const section = UMRAH_ATTACHMENTS.slice(helperIdx, helperIdx + 700);
    expect(section).toMatch(/"companyId"\s*=\s*\$2/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
  });

  // DOC-VIOLATION unification (migration 237): attachments now live in the
  // shared `documents` store. DELETE is still a soft delete, but on `documents`
  // (scoped to umrah-linked rows), not the legacy umrah_attachments table.
  it("DELETE is soft (deletedAt = NOW() on documents, no hard DELETE)", () => {
    const idx = UMRAH_ATTACHMENTS.indexOf('.delete("/attachments/:id"');
    const section = UMRAH_ATTACHMENTS.slice(idx, idx + 1200);
    expect(section).toMatch(/UPDATE\s+documents\s+SET\s+"deletedAt"\s*=\s*NOW\(\)/);
    // Only umrah-linked documents are deletable through this handler.
    expect(section).toMatch(/del\."entityType"\s+LIKE\s+'umrah/i);
    // Negative: no hard DELETE of any kind inside this handler.
    expect(section).not.toMatch(/DELETE\s+FROM\s+(umrah_attachments|documents)/i);
  });

  // LIST reads from documents joined to document_entity_links, still scoped by
  // companyId + soft delete, filtered to umrah-namespaced owners.
  it("LIST scopes by companyId AND deletedAt IS NULL (documents store)", () => {
    const idx = UMRAH_ATTACHMENTS.indexOf('.get("/attachments"');
    const section = UMRAH_ATTACHMENTS.slice(idx, idx + 1800);
    expect(section).toMatch(/FROM\s+documents\b/);
    expect(section).toMatch(/document_entity_links/);
    expect(section).toMatch(/"companyId"\s*=\s*\$1/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
    expect(section).toMatch(/del\."entityType"\s+LIKE\s+'umrah/i);
  });

  it("emits audit + event on create and audit on delete (IGOC: auditFromRequest)", () => {
    expect(UMRAH_ATTACHMENTS).toContain('action: "umrah.attachment.created"');
    // Two auditFromRequest calls in the file: create + delete (IGOC ratchet —
    // the legacy createAuditLog helper must NOT be used in new route files).
    const calls = [...UMRAH_ATTACHMENTS.matchAll(/auditFromRequest\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(UMRAH_ATTACHMENTS).not.toMatch(/import\s*\{[^}]*createAuditLog[^}]*\}\s*from/);
  });
});

describe("umrah migration 154 — umrah_attachments table", () => {
  it("enforces entityType CHECK with 8 whitelist values matching the zod enum", () => {
    expect(MIG_154).toMatch(/umrah_attachments_entity_check/);
    const entities = ["mutamer","sub_agent","group","agent","nusk_invoice","season","sales_invoice","violation"];
    for (const e of entities) expect(MIG_154).toContain(`'${e}'`);
  });

  it("enforces type CHECK with 7 whitelist values matching the zod enum", () => {
    expect(MIG_154).toMatch(/umrah_attachments_type_check/);
    const types = ["passport","visa","contract","nusk_file","identity","transfer_receipt","other"];
    for (const t of types) expect(MIG_154).toContain(`'${t}'`);
  });

  it("has companyId + deletedAt + a partial index on the (companyId, entityType, entityId) tuple", () => {
    expect(MIG_154).toContain('"companyId" INTEGER NOT NULL');
    // The dump emits two spaces for the type column alignment.
    expect(MIG_154).toMatch(/"deletedAt"\s+TIMESTAMPTZ/);
    expect(MIG_154).toMatch(/CREATE INDEX IF NOT EXISTS[\s\S]*?\("companyId",\s*"entityType",\s*"entityId"\)[\s\S]*?WHERE "deletedAt" IS NULL/);
  });

  it("CREATE TABLE is idempotent (IF NOT EXISTS)", () => {
    expect(MIG_154).toMatch(/CREATE TABLE IF NOT EXISTS\s+umrah_attachments/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Reconciliation report (PR #312)
// ──────────────────────────────────────────────────────────────────────────

describe("umrah-entities — reconciliation report (PR #312)", () => {
  it("mounts GET /reports/reconciliation", () => {
    expect(UMRAH_REPORTS).toMatch(/router\.get\(["']\/reports\/reconciliation["']/);
  });

  it("authorize gate (view)", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/reconciliation"');
    const section = UMRAH_REPORTS.slice(idx, idx + 300);
    expect(section).toMatch(/action:\s*["']view["']/);
  });

  it("reports three diff axes (amount / count / overstay)", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/reconciliation"');
    const section = UMRAH_REPORTS.slice(idx, idx + 5000);
    expect(section).toContain("amountDiffs");
    expect(section).toContain("countDiffs");
    expect(section).toContain("overstayGaps");
  });

  it("amount diff joins journal_entries via purchaseInvoiceId + journalEntryId", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/reconciliation"');
    const section = UMRAH_REPORTS.slice(idx, idx + 5000);
    expect(section).toMatch(/journal_entries[\s\S]*?journal_lines/i);
    expect(section).toContain('ni."purchaseInvoiceId"');
    expect(section).toContain('ni."journalEntryId"');
  });

  it("overstay query excludes already-violated rows via NOT EXISTS umrah_violations", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/reconciliation"');
    const section = UMRAH_REPORTS.slice(idx, idx + 5000);
    expect(section).toMatch(/NOT EXISTS\s*\([\s\S]*?umrah_violations/i);
  });

  it("scopes every diff query by companyId + respects soft delete", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/reconciliation"');
    const section = UMRAH_REPORTS.slice(idx, idx + 5000);
    const compMatches = [...section.matchAll(/"companyId"\s*=\s*\$1/g)];
    expect(compMatches.length).toBeGreaterThanOrEqual(3);
    const softDeleteMatches = [...section.matchAll(/"deletedAt"\s+IS\s+NULL/gi)];
    expect(softDeleteMatches.length).toBeGreaterThanOrEqual(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Daily run-sheet + statement PDF (PR #305)
// ──────────────────────────────────────────────────────────────────────────

describe("umrah-entities — daily run-sheet (PR #305)", () => {
  it("mounts both JSON and PDF endpoints", () => {
    expect(UMRAH_REPORTS).toMatch(/router\.get\(["']\/reports\/daily-runsheet["']/);
    expect(UMRAH_REPORTS).toMatch(/router\.get\(["']\/reports\/daily-runsheet\/pdf["']/);
  });

  it("authorize gate (view) on both endpoints", () => {
    const jsonIdx = UMRAH_REPORTS.indexOf('"/reports/daily-runsheet"');
    const pdfIdx = UMRAH_REPORTS.indexOf('"/reports/daily-runsheet/pdf"');
    expect(UMRAH_REPORTS.slice(jsonIdx, jsonIdx + 300)).toMatch(/action:\s*["']view["']/);
    expect(UMRAH_REPORTS.slice(pdfIdx, pdfIdx + 300)).toMatch(/action:\s*["']view["']/);
  });

  it("shares a single fetchDailyRunsheet helper between JSON and PDF (no logic divergence)", () => {
    expect(UMRAH_REPORTS).toMatch(/async\s+function\s+fetchDailyRunsheet/);
    // Both routes call the same helper. (U-07 Phase 10: attachments moved out,
    // so the daily-runsheet section is now bounded by RECONCILIATION REPORT.)
    const sec = UMRAH_REPORTS.slice(UMRAH_REPORTS.indexOf("Daily run-sheet"), UMRAH_REPORTS.indexOf("RECONCILIATION"));
    const calls = [...sec.matchAll(/fetchDailyRunsheet\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("queries pilgrims scoped by companyId on entryDate / exitDate / overstay", () => {
    const idx = UMRAH_REPORTS.indexOf("async function fetchDailyRunsheet");
    const section = UMRAH_REPORTS.slice(idx, idx + 1500);
    expect(section).toMatch(/"companyId"\s*=\s*\$1/);
    expect(section).toContain('"entryDate" = $2');
    expect(section).toContain('"exitDate" = $2');
    expect(section).toMatch(/status\s+IN\s*\(\s*'overstayed','violated'\s*\)/);
  });

  it("PDF path proxies through Print Engine v2 (renderPrint) with the umrah_runsheet entityType", () => {
    const idx = UMRAH_REPORTS.indexOf('"/reports/daily-runsheet/pdf"');
    const section = UMRAH_REPORTS.slice(idx, idx + 2000);
    expect(section).toContain("renderPrint");
    expect(section).toContain("umrah_runsheet");
    expect(section).toContain('"Content-Type"');
  });

  it("bespoke runsheet preset is registered in templateResolver (renders 3 sections)", () => {
    expect(TEMPLATE_RESOLVER).toContain("umrah_runsheet:");
    expect(TEMPLATE_RESOLVER).toContain("entity.arrivalsTable");
    expect(TEMPLATE_RESOLVER).toContain("entity.departuresTable");
    expect(TEMPLATE_RESOLVER).toContain("entity.overstaysTable");
  });
});

describe("umrah-statements — sub-agent statement PDF (PR #305; carved U-07 Phase 9)", () => {
  it("mounts GET /statements/:subAgentId/pdf", () => {
    expect(UMRAH_STATEMENTS).toMatch(/router\.get\(["']\/statements\/:subAgentId\/pdf["']/);
  });

  it("authorize gate (view)", () => {
    const idx = UMRAH_STATEMENTS.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_STATEMENTS.slice(idx, idx + 300);
    expect(section).toMatch(/action:\s*["']view["']/);
  });

  it("reuses generateStatement(detailed) — no per-route balance recomputation", () => {
    const idx = UMRAH_STATEMENTS.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_STATEMENTS.slice(idx, idx + 1200);
    expect(section).toContain("generateStatement");
    expect(section).toContain('"detailed"');
  });

  it("PDF path proxies through Print Engine v2 (renderPrint) with the umrah_statement entityType", () => {
    const idx = UMRAH_STATEMENTS.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_STATEMENTS.slice(idx, idx + 3500);
    expect(section).toContain("renderPrint");
    expect(section).toContain("umrah_statement");
  });

  it("statement PDF route scopes sub-agent header lookup by companyId + soft delete", () => {
    const idx = UMRAH_STATEMENTS.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_STATEMENTS.slice(idx, idx + 3500);
    expect(section).toMatch(/FROM\s+umrah_sub_agents[\s\S]*?"companyId"\s*=/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
  });

  it("bespoke statement preset is registered in templateResolver", () => {
    expect(TEMPLATE_RESOLVER).toContain("umrah_statement:");
    expect(TEMPLATE_RESOLVER).toContain("closingBalanceLabel");
  });
});
