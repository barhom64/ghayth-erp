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
const readLib = (f: string) => readFileSync(join(root, "src/lib", f), "utf8");
const readMig = (f: string) => readFileSync(join(root, "src/migrations", f), "utf8");

const UMRAH_ENTITIES = readRoute("umrah-entities.ts");
const PDF_EXPORT = readLib("pdfExport.ts");
const MIG_154 = readMig("154_umrah_attachments.sql");

// ──────────────────────────────────────────────────────────────────────────
// Attachments CRUD (PR #312)
// ──────────────────────────────────────────────────────────────────────────

describe("umrah-entities — attachments (PR #312)", () => {
  it("mounts GET /attachments + POST /attachments + DELETE /attachments/:id", () => {
    expect(UMRAH_ENTITIES).toMatch(/router\.get\(["']\/attachments["']/);
    expect(UMRAH_ENTITIES).toMatch(/router\.post\(["']\/attachments["']/);
    expect(UMRAH_ENTITIES).toMatch(/router\.delete\(["']\/attachments\/:id["']/);
  });

  it("authorize gate per verb (list / create / delete)", () => {
    const getIdx = UMRAH_ENTITIES.indexOf('.get("/attachments"');
    const postIdx = UMRAH_ENTITIES.indexOf('.post("/attachments"');
    const delIdx = UMRAH_ENTITIES.indexOf('.delete("/attachments/:id"');
    const slice = (i: number) => UMRAH_ENTITIES.slice(i, i + 300);
    expect(slice(getIdx)).toMatch(/action:\s*["']list["']/);
    expect(slice(postIdx)).toMatch(/action:\s*["']create["']/);
    expect(slice(delIdx)).toMatch(/action:\s*["']delete["']/);
  });

  it("zod schema with entityType + type enum whitelists", () => {
    expect(UMRAH_ENTITIES).toContain("createAttachmentSchema");
    // Both enums must reference the same 8 entity types declared in
    // the migration 154 CHECK constraint.
    expect(UMRAH_ENTITIES).toContain("ATTACH_ENTITY_TYPES");
    expect(UMRAH_ENTITIES).toContain("ATTACH_TYPES");
    expect(UMRAH_ENTITIES).toMatch(/z\.enum\(ATTACH_ENTITY_TYPES\)/);
    expect(UMRAH_ENTITIES).toMatch(/z\.enum\(ATTACH_TYPES\)/);
  });

  it("verifies owner via per-entityType table whitelist (no raw table-name injection)", () => {
    expect(UMRAH_ENTITIES).toContain("ATTACH_OWNER_TABLE");
    expect(UMRAH_ENTITIES).toContain("assertAttachmentOwner");
    // safeTable strip — only [a-zA-Z0-9_] allowed.
    expect(UMRAH_ENTITIES).toMatch(/safeTable\s*=\s*table\.replace\(\/\[\^a-zA-Z0-9_\]\/g/);
  });

  it("owner verification scopes by companyId before insert", () => {
    const helperIdx = UMRAH_ENTITIES.indexOf("function assertAttachmentOwner");
    const section = UMRAH_ENTITIES.slice(helperIdx, helperIdx + 700);
    expect(section).toMatch(/"companyId"\s*=\s*\$2/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
  });

  it("DELETE is soft (deletedAt = NOW(), no hard DELETE)", () => {
    const idx = UMRAH_ENTITIES.indexOf('.delete("/attachments/:id"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 1200);
    expect(section).toMatch(/UPDATE\s+umrah_attachments[\s\S]*?"deletedAt"\s*=\s*NOW\(\)/);
    // Negative: no `DELETE FROM umrah_attachments` inside this handler.
    expect(section).not.toMatch(/DELETE\s+FROM\s+umrah_attachments/i);
  });

  it("LIST scopes by companyId AND deletedAt IS NULL", () => {
    const idx = UMRAH_ENTITIES.indexOf('.get("/attachments"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 1500);
    expect(section).toMatch(/"companyId"\s*=\s*\$1/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
  });

  it("emits audit + event on create and audit on delete", () => {
    expect(UMRAH_ENTITIES).toContain('action: "umrah.attachment.created"');
    // Two createAuditLog calls in the attachment section: create + delete.
    const sec = UMRAH_ENTITIES.slice(
      UMRAH_ENTITIES.indexOf("ATTACHMENTS — polymorphic"),
      UMRAH_ENTITIES.indexOf("RECONCILIATION REPORT"),
    );
    const calls = [...sec.matchAll(/createAuditLog\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
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
    expect(UMRAH_ENTITIES).toMatch(/router\.get\(["']\/reports\/reconciliation["']/);
  });

  it("authorize gate (view)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/reconciliation"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 300);
    expect(section).toMatch(/action:\s*["']view["']/);
  });

  it("reports three diff axes (amount / count / overstay)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/reconciliation"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 5000);
    expect(section).toContain("amountDiffs");
    expect(section).toContain("countDiffs");
    expect(section).toContain("overstayGaps");
  });

  it("amount diff joins journal_entries via purchaseInvoiceId + journalEntryId", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/reconciliation"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 5000);
    expect(section).toMatch(/journal_entries[\s\S]*?journal_lines/i);
    expect(section).toContain('ni."purchaseInvoiceId"');
    expect(section).toContain('ni."journalEntryId"');
  });

  it("overstay query excludes already-violated rows via NOT EXISTS umrah_violations", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/reconciliation"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 5000);
    expect(section).toMatch(/NOT EXISTS\s*\([\s\S]*?umrah_violations/i);
  });

  it("scopes every diff query by companyId + respects soft delete", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/reconciliation"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 5000);
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
    expect(UMRAH_ENTITIES).toMatch(/router\.get\(["']\/reports\/daily-runsheet["']/);
    expect(UMRAH_ENTITIES).toMatch(/router\.get\(["']\/reports\/daily-runsheet\/pdf["']/);
  });

  it("authorize gate (view) on both endpoints", () => {
    const jsonIdx = UMRAH_ENTITIES.indexOf('"/reports/daily-runsheet"');
    const pdfIdx = UMRAH_ENTITIES.indexOf('"/reports/daily-runsheet/pdf"');
    expect(UMRAH_ENTITIES.slice(jsonIdx, jsonIdx + 300)).toMatch(/action:\s*["']view["']/);
    expect(UMRAH_ENTITIES.slice(pdfIdx, pdfIdx + 300)).toMatch(/action:\s*["']view["']/);
  });

  it("shares a single fetchDailyRunsheet helper between JSON and PDF (no logic divergence)", () => {
    expect(UMRAH_ENTITIES).toMatch(/async\s+function\s+fetchDailyRunsheet/);
    // Both routes call the same helper.
    const sec = UMRAH_ENTITIES.slice(UMRAH_ENTITIES.indexOf("Daily run-sheet"), UMRAH_ENTITIES.indexOf("ATTACHMENTS"));
    const calls = [...sec.matchAll(/fetchDailyRunsheet\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("queries pilgrims scoped by companyId on entryDate / exitDate / overstay", () => {
    const idx = UMRAH_ENTITIES.indexOf("async function fetchDailyRunsheet");
    const section = UMRAH_ENTITIES.slice(idx, idx + 1500);
    expect(section).toMatch(/"companyId"\s*=\s*\$1/);
    expect(section).toContain('"entryDate" = $2');
    expect(section).toContain('"exitDate" = $2');
    expect(section).toMatch(/status\s+IN\s*\(\s*'overstayed','violated'\s*\)/);
  });

  it("PDF path delegates to exportUmrahDailyRunsheetPdf (central helper)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/reports/daily-runsheet/pdf"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 1000);
    expect(section).toContain("exportUmrahDailyRunsheetPdf");
    expect(section).toContain('"Content-Type"');
    expect(section).toContain('"application/pdf"');
  });

  it("PDF helper sits in central pdfExport.ts (no per-route streaming)", () => {
    expect(PDF_EXPORT).toContain("export async function exportUmrahDailyRunsheetPdf");
  });
});

describe("umrah-entities — sub-agent statement PDF (PR #305)", () => {
  it("mounts GET /statements/:subAgentId/pdf", () => {
    expect(UMRAH_ENTITIES).toMatch(/router\.get\(["']\/statements\/:subAgentId\/pdf["']/);
  });

  it("authorize gate (view)", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 300);
    expect(section).toMatch(/action:\s*["']view["']/);
  });

  it("reuses generateStatement(detailed) — no per-route balance recomputation", () => {
    const idx = UMRAH_ENTITIES.indexOf('"/statements/:subAgentId/pdf"');
    const section = UMRAH_ENTITIES.slice(idx, idx + 1200);
    expect(section).toContain("generateStatement");
    expect(section).toContain('"detailed"');
  });

  it("PDF helper sits in central pdfExport.ts (export)", () => {
    expect(PDF_EXPORT).toContain("export async function exportUmrahStatementPdf");
  });

  it("statement PDF helper scopes sub-agent lookup by companyId + soft delete", () => {
    const idx = PDF_EXPORT.indexOf("export async function exportUmrahStatementPdf");
    const section = PDF_EXPORT.slice(idx, idx + 1200);
    expect(section).toMatch(/FROM\s+umrah_sub_agents[\s\S]*?"companyId"\s*=/);
    expect(section).toMatch(/"deletedAt"\s+IS\s+NULL/i);
  });
});
