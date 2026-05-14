// Print Engine v2 — static contract tests.
//
// Verifies the engine's permission catalogue, route surface, adapter
// registration, and migration shape are all wired correctly. These are
// static-text checks (no DB) so they run in every CI invocation; the
// dynamic behaviour (template resolver fallback chain, copy numbering,
// approval gate) is locked down by smoke tests once the integration
// harness in tests/integration/_fixtures/ supports the print fixtures.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PRINT_LIB = join(REPO_ROOT, "artifacts/api-server/src/lib/print");
const MIGRATIONS = join(REPO_ROOT, "artifacts/api-server/src/migrations");
const ROUTES_FILE = join(REPO_ROOT, "artifacts/api-server/src/routes/print.ts");
const RBAC_CATALOG = join(REPO_ROOT, "artifacts/api-server/src/lib/rbacCatalog.ts");
const ENTITY_REGISTRY = join(REPO_ROOT, "artifacts/api-server/src/lib/entityRegistry.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("Print Engine v2 — files & exports", () => {
  it("ships every required lib module", () => {
    const required = [
      "printService.ts",
      "templateResolver.ts",
      "dataLoader.ts",
      "branchContext.ts",
      "variableSubstitution.ts",
      "watermark.ts",
      "printJobsLogger.ts",
      "printStorage.ts",
      "types.ts",
      "index.ts",
    ];
    const present = new Set(readdirSync(PRINT_LIB));
    for (const f of required) expect(present.has(f), `missing ${f}`).toBe(true);
  });

  it("registers all four format adapters", () => {
    const adaptersDir = join(PRINT_LIB, "adapters");
    const files = new Set(readdirSync(adaptersDir));
    for (const f of ["a4Adapter.ts", "thermalAdapter.ts", "labelAdapter.ts", "excelAdapter.ts", "index.ts"]) {
      expect(files.has(f), `missing adapter ${f}`).toBe(true);
    }
    const idx = read(join(adaptersDir, "index.ts"));
    for (const adapter of ["a4Adapter", "thermalAdapter", "thermal58Adapter", "labelAdapter", "excelAdapter"]) {
      expect(idx, `index does not import ${adapter}`).toContain(adapter);
    }
  });
});

describe("Print Engine v2 — migrations", () => {
  it("171 creates print_template_assignments + print_jobs + print_reprint_requests", () => {
    const sql = read(join(MIGRATIONS, "171_print_engine_foundations.sql"));
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS print_template_assignments');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS print_jobs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS print_reprint_requests');
    // print_jobs must retain copy numbering + storage key for reprints.
    expect(sql).toContain('"copyNumber"');
    expect(sql).toContain('"pdfStorageKey"');
    expect(sql).toContain('"isReprint"');
  });

  it("171 extends document_templates with the engine columns", () => {
    const sql = read(join(MIGRATIONS, "171_print_engine_foundations.sql"));
    for (const col of [
      '"entityType"', '"paperSize"', '"mode"', '"presetKey"',
      '"layoutJson"', '"cssOverrides"', '"headerOverride"', '"footerOverride"',
      '"version"', '"isThermal"',
    ]) {
      expect(sql, `document_templates missing ${col}`).toContain(col);
    }
  });

  it("172 seeds classic preset templates for every phase-1 entity", () => {
    const sql = read(join(MIGRATIONS, "172_print_engine_seed.sql"));
    const phase1 = [
      "quotation", "sales_order", "delivery_note", "credit_note",
      "pos_receipt", "receipt_voucher", "purchase_request", "goods_receipt",
      "journal_entry", "account_statement", "stock_transfer", "stock_adjustment",
      "item_barcode_label", "leave_request", "loan_request", "maintenance_request",
    ];
    for (const e of phase1) expect(sql, `missing seed for ${e}`).toContain(`('${e}',`);
  });
});

describe("Print Engine v2 — routes", () => {
  const src = read(ROUTES_FILE);

  it("exposes render + preview + templates CRUD + jobs + reprint endpoints", () => {
    // Some routes use multi-line router.<verb>("/path", ...) form; match by
    // checking the path literal is present alongside its verb keyword.
    const collapsed = src.replace(/\s+/g, " ");
    const expected: Array<[string, string]> = [
      ['router.post', '"/render"'],
      ['router.post', '"/preview"'],
      ['router.get', '"/templates"'],
      ['router.post', '"/templates"'],
      ['router.patch', '"/templates/:id"'],
      ['router.delete', '"/templates/:id"'],
      ['router.get', '"/assignments"'],
      ['router.post', '"/assignments"'],
      ['router.get', '"/jobs"'],
      ['router.get', '"/jobs/:jobId/download"'],
      ['router.post', '"/reprint-requests"'],
      ['router.get', '"/reprint-requests"'],
      ['router.post', '"/reprint-requests/:id/approve"'],
      ['router.post', '"/reprint-requests/:id/reject"'],
    ];
    for (const [verb, path] of expected) {
      const re = new RegExp(`${verb.replace(".", "\\.")}\\(\\s*${path.replace(/[/]/g, "\\/")}`);
      expect(collapsed, `missing ${verb}(${path})`).toMatch(re);
    }
  });

  it("gates render with print:create, templates with templates:* and reprint approval", () => {
    expect(src).toContain('requirePermission("print:create")');
    expect(src).toContain('requirePermission("templates:read")');
    expect(src).toContain('requirePermission("templates:write")');
    expect(src).toContain('requirePermission("print_jobs:read")');
    expect(src).toContain('requirePermission("print:reprint:create")');
    expect(src).toContain('requirePermission("print:reprint:approve")');
  });

  it("the router is mounted at /api/print in routes/index.ts", () => {
    const idx = read(join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"));
    expect(idx).toContain('import printRouter from "./print.js"');
    expect(idx).toContain('router.use("/print", printRouter)');
  });
});

describe("Print Engine v2 — RBAC catalogue", () => {
  const src = read(RBAC_CATALOG);

  it("declares core print + templates permissions", () => {
    for (const p of [
      '"print:read"', '"print:create"',
      '"print:reprint:create"', '"print:reprint:approve"',
      '"print_jobs:read"', '"templates:read"', '"templates:write"',
    ]) {
      expect(src, `missing permission ${p}`).toContain(p);
    }
  });

  it("declares :create permissions for every phase-1 entity", () => {
    for (const e of [
      "invoice", "quotation", "sales_order", "delivery_note", "credit_note",
      "pos_receipt", "receipt_voucher", "payment_voucher",
      "purchase_request", "purchase_order", "goods_receipt",
      "journal_entry", "account_statement",
      "stock_transfer", "stock_adjustment", "item_barcode_label",
      "leave_request", "loan_request", "maintenance_request",
      "payroll", "official_letter", "employee_contract", "employee_profile",
    ]) {
      expect(src, `missing print:${e}:create`).toContain(`"print:${e}:create"`);
    }
  });
});

describe("Print Engine v2 — registry helpers", () => {
  const src = read(ENTITY_REGISTRY);

  it("exposes getEntityPrintProfile with a permissive fallback", () => {
    expect(src).toContain("export function getEntityPrintProfile");
    // The fallback must default to a4 + a synthesized permission, otherwise
    // unwired entities would 500 instead of rendering a generic dump.
    expect(src).toContain('defaultFormat: "a4"');
    expect(src).toContain("registered: false");
    expect(src).toContain('`print:${entityType}:create`');
  });

  it("PrintFormat union covers all four output families", () => {
    expect(src).toContain('"a4"');
    expect(src).toContain('"thermal_80"');
    expect(src).toContain('"thermal_58"');
    expect(src).toContain('"label"');
    expect(src).toContain('"excel"');
  });
});

describe("Print Engine v2 — service contract", () => {
  const src = read(join(PRINT_LIB, "printService.ts"));

  it("throws typed errors the routes can map to HTTP statuses", () => {
    for (const sym of [
      "PrintPermissionError",
      "PrintApprovalRequiredError",
      "PrintTemplateMissingError",
    ]) {
      expect(src, `missing error class ${sym}`).toContain(`class ${sym}`);
    }
  });

  it("calls every pipeline step in renderPrint", () => {
    for (const step of [
      "userHasPermission",   // RBAC
      "getEntityPrintProfile", // registry profile
      "resolveTemplate",     // template lookup
      "loadEntityData",      // data loader
      "buildLetterhead",     // branch letterhead
      "getAdapter",          // format adapter
      "makeWatermark",       // duplicate stamp
      "storePrintArtifact",  // object storage
      "writePrintJob",       // print_jobs row
    ]) {
      expect(src, `renderPrint never invokes ${step}`).toContain(step);
    }
  });

  it("enforces the reprint approval gate", () => {
    expect(src).toContain("requiresApprovalForReprint");
    expect(src).toContain("PrintApprovalRequiredError");
    expect(src).toContain('"print:reprint:approve"');
  });
});

describe("Print Engine v2 — variable substitution", () => {
  const src = read(join(PRINT_LIB, "variableSubstitution.ts"));

  it("supports {{branch.letterhead}} + {{entity.itemsTable}} + {{#each}}", () => {
    expect(src).toContain("branch.letterhead");
    expect(src).toContain("entity.itemsTable");
    expect(src).toContain("expandEach");
    expect(src).toContain("#each");
  });

  it("escapes HTML by default", () => {
    expect(src).toContain("function escapeHtml");
    // Both & and < must be escaped to avoid stored-XSS via entity data.
    expect(src).toMatch(/&amp;/);
    expect(src).toMatch(/&lt;/);
  });

  it("renders the duplicate watermark when present", () => {
    expect(src).toContain('class="watermark"');
  });
});
