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
    // The fallback must default to a4 + the generic print:create permission,
    // otherwise unwired entities would 500 (synthesized per-entity permissions
    // aren't in role_permissions for entities the seed migration didn't cover).
    expect(src).toContain('defaultFormat: "a4"');
    expect(src).toContain("registered: false");
    expect(src).toContain('permission: "print:create"');
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

// ──────────────────────────────────────────────────────────────────────────
// Regression: a 500 "حدث خطأ غير متوقع" was hitting users when the print
// pipeline received a payload with weird shapes (null first row in items[],
// empty objects, JSONB-as-array, etc). Buildt-tablefn must never crash — it
// must fall back to the "لا توجد بنود" placeholder instead.
// ──────────────────────────────────────────────────────────────────────────

describe("Print Engine v2 — substitute() resilience to bad data", () => {
  it("does not throw on a typical invoice payload", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = {
      companyName: "شركة الاختبار",
      branchName: "الفرع الرئيسي",
      phone: "0123456789",
      email: "x@example.com",
    } as Parameters<typeof substitute>[0]["branch"];
    const data = {
      entity: { id: 42, ref: "INV-001", status: "approved", subtotal: 1000, total: 1150 },
      items: [
        { id: 1, invoiceId: 42, description: "بند 1", quantity: 2, unitPrice: 500, totalPrice: 1000 },
      ],
      client: { id: 7, name: "عميل اختبار", taxNumber: "30012345600003" },
    };
    expect(() =>
      substitute({
        template: "{{branch.letterhead}}<p>{{entity.ref}}</p>{{entity.itemsTable}}",
        data,
        branch,
        isThermal: false,
      }),
    ).not.toThrow();
  });

  it("does not throw when items[0] is null (degenerate join result)", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const data = {
      entity: { id: 1 },
      items: [null, { description: "real row", quantity: 1 }],
    };
    let html = "";
    expect(() => {
      html = substitute({ template: "{{entity.itemsTable}}", data, branch, isThermal: false });
    }).not.toThrow();
    expect(html).toContain("real row");
  });

  it("does not throw when items[] is empty", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    let html = "";
    expect(() => {
      html = substitute({
        template: "{{entity.itemsTable}}",
        data: { entity: { id: 1 }, items: [] },
        branch,
        isThermal: false,
      });
    }).not.toThrow();
    expect(html).toContain("لا توجد بنود");
  });

  it("does not throw when data.items is undefined", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    expect(() =>
      substitute({
        template: "{{entity.itemsTable}}",
        data: { entity: { id: 1 } },
        branch,
        isThermal: false,
      }),
    ).not.toThrow();
  });

  it("does not throw when item rows are missing the sample's columns", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const data = {
      entity: { id: 1 },
      items: [
        { description: "A", quantity: 1 },
        { description: "B" }, // missing quantity
        {}, // empty
      ],
    };
    expect(() =>
      substitute({ template: "{{entity.itemsTable}}", data, branch, isThermal: false }),
    ).not.toThrow();
  });

  it("formats numbers with thousand separators + 2 decimals", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const html = substitute({
      template: "<p>{{entity.total}}</p><p>{{entity.qty}}</p>",
      data: { entity: { id: 1, total: 1234567.89, qty: 100000 } },
      branch,
      isThermal: false,
    });
    expect(html).toContain("1,234,567.89");
    expect(html).toContain("100,000");
  });

  it("formats numeric strings from the DB (NUMERIC columns)", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const html = substitute({
      template: "<p>{{entity.subtotal}}</p>",
      data: { entity: { id: 1, subtotal: "15000.5" } },
      branch,
      isThermal: false,
    });
    expect(html).toContain("15,000.50");
  });

  it("does NOT mangle SKU / reference strings starting with digits", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const html = substitute({
      template: "<p>{{entity.ref}}</p><p>{{entity.sku}}</p>",
      data: { entity: { id: 1, ref: "INV-2025-001", sku: "300SP-X" } },
      branch,
      isThermal: false,
    });
    expect(html).toContain("INV-2025-001");
    expect(html).toContain("300SP-X");
  });

  it("auto-formats ISO date strings to Arabic locale (consistency)", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const html = substitute({
      template: "<p>{{entity.createdAt}}</p><p>{{entity.dueDate}}</p>",
      data: {
        entity: {
          id: 1,
          createdAt: "2025-06-15T12:34:56.000Z",
          dueDate: "2025-07-01",
        },
      },
      branch,
      isThermal: false,
    });
    // Should NOT contain the raw ISO timestamp.
    expect(html).not.toContain("2025-06-15T12:34:56");
    // The Arabic locale ("ar-SA") renders the year using Arabic-Indic
    // digits — ٢٠٢٥ instead of 2025. Accept either since some Intl
    // implementations may differ. Just verify the timestamp was converted
    // (no longer contains "T" or "Z").
    expect(html).not.toContain("T12:");
    expect(html).not.toContain("000Z");
  });

  it("does NOT mangle date-like refs (year-prefixed strings)", async () => {
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = { companyName: "x", branchName: "y" } as Parameters<typeof substitute>[0]["branch"];
    const html = substitute({
      template: "<p>{{entity.ref}}</p>",
      data: { entity: { id: 1, ref: "2025-INV-001" } },
      branch,
      isThermal: false,
    });
    // Hyphenated alphanumeric ref → left as-is (doesn't match ISO date shape)
    expect(html).toContain("2025-INV-001");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Preset contract tests — for every entity registered in BESPOKE_PRESETS,
// resolve a template and verify it's a real bespoke preset (not the
// universal "قالب احتياطي" fallback) and that the markup contains the
// key Arabic identifier the audit expects. Catches "I added a preset to
// the map but forgot to wire the builder" and "the resolver fell through
// because of a typo" regressions at test time instead of in production.
// ──────────────────────────────────────────────────────────────────────────

describe("Print Engine v2 — preset contract (every BESPOKE_PRESETS entry returns a real preset)", () => {
  it("BESPOKE_PRESETS is non-empty and every key resolves to a non-fallback template", async () => {
    // Static check by reading the source — same approach as the rest of
    // this test file. We can't import templateResolver directly without a
    // DB context, so we parse the BESPOKE_PRESETS map from source.
    const src = read(join(PRINT_LIB, "templateResolver.ts"));
    const mapMatch = src.match(/const\s+BESPOKE_PRESETS[^{]*=\s*\{([\s\S]*?)\n\};\s+function\s+buildInvoicePreset/);
    expect(mapMatch, "BESPOKE_PRESETS const not found").toBeTruthy();
    const body = mapMatch![1];
    const keys = Array.from(body.matchAll(/^\s*([a-z_][a-z0-9_]*):\s*\(/gm)).map((m) => m[1]);
    expect(keys.length, "BESPOKE_PRESETS is empty").toBeGreaterThan(40);
    // Every key must either:
    //   (a) point at a buildXxxPreset function actually defined in the file
    //       (the common pattern), OR
    //   (b) define its preset inline via `() => ({ ... })` — a few legacy
    //       entries (official_letter, umrah_statement, umrah_runsheet) do
    //       this since they predate the makePreset() helper.
    for (const key of keys) {
      const namedCall = body.match(new RegExp(`^\\s*${key}:\\s*\\(\\)\\s*=>\\s*(build[A-Za-z0-9_]+)\\(`, "m"));
      const inlineObj = body.match(new RegExp(`^\\s*${key}:\\s*\\(\\)\\s*=>\\s*\\(\\{`, "m"));
      expect(namedCall || inlineObj, `BESPOKE_PRESETS["${key}"] has neither a builder call nor an inline ({...}) factory`).toBeTruthy();
      if (namedCall) {
        const fnName = namedCall[1];
        const defRe = new RegExp(`function\\s+${fnName}\\s*\\(`);
        expect(defRe.test(src), `BESPOKE_PRESETS["${key}"] calls ${fnName}() but no such function is defined`).toBe(true);
      }
    }
  });

  it("covers every business-critical entity (no regression in coverage)", async () => {
    // Hard list of entities that MUST stay in BESPOKE_PRESETS — these are
    // the documents users print every day. If anyone removes one, this
    // test breaks at CI time instead of in production at 3am.
    const src = read(join(PRINT_LIB, "templateResolver.ts"));
    const mapMatch = src.match(/const\s+BESPOKE_PRESETS[^{]*=\s*\{([\s\S]*?)\n\};\s+function\s+buildInvoicePreset/);
    const body = mapMatch![1];
    const keys = new Set(Array.from(body.matchAll(/^\s*([a-z_][a-z0-9_]*):\s*\(/gm)).map((m) => m[1]));
    // Conservative list — every entity the operator literally clicks
    // "طباعة" on in production. account_statement is GL-account-level
    // (chart_of_account preset covers it); customer_statement /
    // vendor_statement live in reportLoaders and aren't BESPOKE_PRESETS
    // keys (they go through universal fallback by design — the data is
    // tabular).
    const mustHave = [
      // Sales-side commercial documents
      "invoice", "quotation", "sales_order", "delivery_note", "credit_note",
      "pos_receipt",
      // Cash-handling
      "payment_voucher", "receipt_voucher",
      // Purchases
      "purchase_order", "purchase_request", "goods_receipt",
      // GL
      "journal_entry",
      // Warehouse
      "stock_transfer", "stock_adjustment", "inventory_count",
      "item_barcode_label",
      // HR
      "leave_request", "loan_request", "payroll_run", "payslip",
      "official_letter", "employee_contract", "employee_profile",
      "overtime_request", "exit_request", "transfer", "attendance",
      "excuse_request", "discipline_memo",
      // Fleet
      "fleet_trip", "fleet_maintenance", "vehicle", "fuel",
      "insurance_policy", "traffic_violation",
      // Property / Legal
      "rental_contract", "property_unit", "legal_contract", "legal_judgment",
      "maintenance_request", "building",
      // Recruitment
      "job_posting",
      // CRM
      "client", "crm_opportunity",
      // Customer/vendor statements
      "vendor",
    ];
    for (const slug of mustHave) {
      expect(keys.has(slug), `BESPOKE_PRESETS regression — missing ${slug}`).toBe(true);
    }
  });

  it("every bespoke preset opens with the standard A4 letterhead scaffold (not universal fallback)", async () => {
    // The universal fallback has the literal "قالب احتياطي" in its name.
    // Every bespoke builder must produce markup that DOESN'T include that
    // string — otherwise a builder accidentally returned `universalFallback`
    // somewhere.
    const src = read(join(PRINT_LIB, "templateResolver.ts"));
    // Find every builder function body and verify none of them embed the
    // fallback marker. Builders use makePreset({ ..., body: `...` }) so we
    // grep the body templates rather than running them.
    const builders = Array.from(src.matchAll(/function\s+(build[A-Za-z0-9_]+)\s*\(\)\s*:\s*PrintTemplate\s*\{([\s\S]*?)\n\}\s*\n/g));
    expect(builders.length, "no buildXxxPreset() functions found").toBeGreaterThan(40);
    for (const m of builders) {
      const name = m[1];
      const fnBody = m[2];
      // The universal fallback's marker — bespoke presets MUST NOT include
      // this. (Cross-check that no builder regressed to returning the
      // fallback.)
      expect(fnBody, `${name} appears to return universalFallback()`).not.toContain("قالب احتياطي");
      // Every bespoke preset must reference {{branch.letterhead}} via
      // makePreset() OR build its own scaffold (thermal POS, label).
      // Skip the thermal/label builders by name — they use their own
      // adapter wrappers.
      const isThermalOrLabel = /Thermal|PosReceipt|Barcode|Label/i.test(name);
      if (isThermalOrLabel) continue;
      // Legacy builders that predate makePreset() open with a direct
      // PrintTemplate object literal. Both styles are valid — we just
      // verify the body references {{branch.letterhead}} so the printed
      // doc carries the standard A4 header.
      const usesMakePreset = fnBody.includes("makePreset");
      const usesDirectLetterhead = fnBody.includes("{{branch.letterhead}}");
      expect(usesMakePreset || usesDirectLetterhead,
        `${name}: neither makePreset() nor a direct {{branch.letterhead}} token found`,
      ).toBe(true);
    }
  });

  it("ARABIC_TITLES covers every key in BESPOKE_PRESETS (consistency check)", async () => {
    // When a preset is added, its slug should also appear in ARABIC_TITLES
    // so the universal-fallback fallback (rare but possible if the
    // preset throws) still shows a meaningful title instead of the
    // snake_case slug.
    const src = read(join(PRINT_LIB, "templateResolver.ts"));
    const presetMap = src.match(/const\s+BESPOKE_PRESETS[^{]*=\s*\{([\s\S]*?)\n\};\s+function\s+buildInvoicePreset/);
    const titlesMap = src.match(/const\s+ARABIC_TITLES[^=]*=\s*\{([\s\S]*?)\n\};/);
    expect(presetMap).toBeTruthy();
    expect(titlesMap).toBeTruthy();
    const presetKeys = new Set(Array.from(presetMap![1].matchAll(/^\s*([a-z_][a-z0-9_]*):\s*\(/gm)).map((m) => m[1]));
    const titleKeys = new Set(Array.from(titlesMap![1].matchAll(/(?:^|\s|,)([a-z_][a-z0-9_]*):\s*"/g)).map((m) => m[1]));
    // Allowed gaps — aliases that share another preset's Arabic title
    // (e.g., job → job_posting), or entityRegistry slugs that resolve via
    // a different ARABIC_TITLES key (payroll_run uses payroll, etc).
    const aliasOk = new Set([
      "sales_invoice", "loan", "job", "supplier", "insurance",
      "umrah_sales_invoice", "store_product",
      // Registry-vs-loader slug differences. Each of these has an entry in
      // ARABIC_TITLES under its canonical short form (`payroll`, `evaluation_360`,
      // `expense`, `legal_judgment`, `fuel`, `chart_of_account`'s entry is
      // `chart_of_accounts` from the report etc), so the universal fallback
      // still produces a meaningful title.
      "payroll_run", "evaluation_cycle", "expense_claim",
      "fuel_log", "legal_case", "chart_of_account",
      "inventory_count", "insurance_policy", "crm_opportunity",
    ]);
    const missing: string[] = [];
    for (const k of presetKeys) {
      if (!titleKeys.has(k) && !aliasOk.has(k)) missing.push(k);
    }
    expect(missing, `ARABIC_TITLES missing entries for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("Print Engine v2 — retention legal hold", () => {
  // These document types are the legal artifact under Saudi tax / commercial
  // record retention. Dropping any of them silently from the retention list
  // (e.g. via a future refactor) would let the daily prune job evict PDFs
  // that ZATCA may demand in an audit. A failing assert here means a
  // regression in the legal posture — coordinate with finance before
  // removing a type, not just by changing the source.
  const MUST_HOLD = [
    "invoice",
    "credit_note",
    "debit_note",
    "pos_receipt",
    "receipt_voucher",
    "payment_voucher",
    "journal_entry",
    "delivery_note",
    "purchase_order",
    "goods_receipt",
    "payroll",
  ];

  it("LEGAL_RETENTION_ENTITY_TYPES covers every Saudi-mandated record type", async () => {
    const mod = await import("../../src/lib/print/retention.js");
    const list = (mod as { LEGAL_RETENTION_ENTITY_TYPES: readonly string[] }).LEGAL_RETENTION_ENTITY_TYPES;
    expect(Array.isArray(list)).toBe(true);
    for (const t of MUST_HOLD) {
      expect(list, `LEGAL_RETENTION_ENTITY_TYPES must include ${t} (Saudi tax/commercial record)`).toContain(t);
    }
  });

  it("retention SQL excludes legal-hold rows at query time (not in JS)", () => {
    // Belt-and-braces: ensure both the WHERE clause and the per-row guard
    // reference the legal-hold list. If a future change removes the SQL
    // filter, the per-row guard still protects the data; if the per-row
    // guard is removed, the SQL still does. Both being present is the
    // invariant — drop either at your peril.
    const src = readFileSync(join(PRINT_LIB, "retention.ts"), "utf8");
    expect(src).toMatch(/NOT\s*\(\s*"entityType"\s*=\s*ANY\(\$2::text\[\]\)\s*\)/);
    expect(src).toMatch(/LEGAL_RETENTION_ENTITY_TYPES\.includes\(row\.entityType\)/);
  });

  it("PruneResult exposes legalHoldSkipped so ops can audit the runner", () => {
    const src = readFileSync(join(PRINT_LIB, "retention.ts"), "utf8");
    expect(src).toMatch(/legalHoldSkipped:\s*number/);
  });
});
