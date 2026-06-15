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

  it("universalFallback uses {{entity.title}} so caller-supplied titles win over the static fallback", () => {
    // printService now pre-fills `data.entity.title` to ARABIC_TITLES[type]
    // when the caller didn't supply one, so the universalFallback can use a
    // single token. Without this, the 37 report types whose entityType has
    // no ARABIC_TITLES entry rendered "report_print_log" / "report_ar_aging"
    // / etc. as the printed header instead of the SPA's Arabic title.
    const tmplSrc = read(join(PRINT_LIB, "templateResolver.ts"));
    expect(tmplSrc).toContain("{{entity.title}}");
    expect(tmplSrc).toMatch(/export const ARABIC_TITLES/);
    const svcSrc = read(join(PRINT_LIB, "printService.ts"));
    expect(svcSrc).toContain("ARABIC_TITLES");
    expect(svcSrc).toMatch(/entity.*title.*ARABIC_TITLES/s);
  });

  it("supports {{#if path}}…{{/if}} conditional blocks", () => {
    // Several presets (customer_statement, vendor_statement, …) were
    // authored with this Handlebars-style helper. Without an implementation
    // the literal `{{#if entity.X}}` markers ended up in the printed PDF.
    expect(src).toContain("expandIf");
    expect(src).toContain("#if");
  });

  it("expandIf renders body when truthy, hides when falsy/missing", async () => {
    // Black-box test through the public substitute() entry point so we
    // exercise the actual pipeline order (if → each → token).
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = {
      companyName: "ش", branchName: "ف",
      address: null, phone: null, email: null,
      logoUrl: null, footerText: null, taxNumber: null,
      crNumber: null, vatNumber: null,
      branchNameEn: null, companyNameEn: null, fullAddress: null,
    } as Parameters<typeof substitute>[0]["branch"];
    const template = `before {{#if entity.note}}NOTE={{entity.note}}{{/if}} after`;
    const withNote = substitute({
      template, data: { entity: { note: "هام" } }, branch, isThermal: false,
    });
    expect(withNote).toContain("NOTE=هام");
    const withoutNote = substitute({
      template, data: { entity: { id: 1 } }, branch, isThermal: false,
    });
    expect(withoutNote).not.toContain("NOTE=");
    expect(withoutNote).not.toContain("{{#if");
    expect(withoutNote).not.toContain("{{/if}}");
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

  it("translates English DB enum values to Arabic so printed docs are in the system language", async () => {
    // formatValue() now looks up ENUM_AR before falling through to the raw
    // string. Without it, `{{entity.status}} === "active"` printed the
    // English word — inconsistent with the SPA badge that already shows
    // "نشط" and a violation of the system-language guarantee the user asked
    // for. Test the common cases through the public substitute() entry
    // point so the full pipeline order (autoTokens → expandIf → expandEach
    // → token replace) is exercised end-to-end.
    const { substitute } = await import("../../src/lib/print/variableSubstitution.js");
    const branch = {
      companyName: "ش", branchName: "ف",
      address: null, phone: null, email: null,
      logoUrl: null, footerText: null, taxNumber: null,
      crNumber: null, vatNumber: null,
      branchNameEn: null, companyNameEn: null, fullAddress: null,
    } as Parameters<typeof substitute>[0]["branch"];
    const cases: Array<[unknown, string]> = [
      // Lifecycle / payment statuses
      ["active", "نشط"],
      ["draft", "مسودة"],
      ["posted", "مُرحَّل"],
      ["cancelled", "ملغى"],
      ["paid", "مدفوع"],
      ["overdue", "متأخر"],
      ["receipt", "سند قبض"],
      ["male", "ذكر"],
      [true, "نعم"],
      [false, "لا"],
      ["YES", "نعم"],
      ["NEW", "جديد"],
      // Finance type maps — mirrored from finance-type-maps.ts so the
      // printed PDF agrees with the on-screen badge. Regression-test the
      // categories with the highest cross-domain reuse so the next
      // contributor knows the SPA → print parity is a contract.
      ["cash", "نقدي"],
      ["bank_transfer", "تحويل بنكي"],
      ["credit_card", "بطاقة ائتمان"],
      ["standard", "فاتورة عادية"],
      ["asset", "أصول"],
      ["revenue", "إيرادات"],
      // HR labels (leave types, exit reasons, doc types)
      ["annual", "سنوية"],
      ["resignation", "استقالة"],
      ["iqama", "إقامة"],
      // Fleet labels
      ["preventive", "وقائية"],
      ["diesel", "ديزل"],
      ["delivery", "توصيل"],
      ["comprehensive", "شامل"],
      // CRM activity types
      ["call", "مكالمة"],
      ["meeting", "اجتماع"],
      // Currency codes — Saudi convention renders the Arabic symbol next
      // to amounts instead of the ISO triplet.
      ["SAR", "ر.س"],
      ["USD", "$"],
      ["AED", "د.إ"],
      // Generic fallbacks the SPA also uses
      ["other", "أخرى"],
      ["unknown", "غير محدد"],
      // Priority labels
      ["high", "عالية"],
      ["urgent", "عاجلة"],
    ];
    for (const [input, expected] of cases) {
      const out = substitute({
        template: "[{{entity.status}}]",
        data: { entity: { status: input } },
        branch,
        isThermal: false,
      });
      expect(out, `enum "${String(input)}" → "${expected}"`).toContain(`[${expected}]`);
    }
    // Unknown enum values pass through unchanged — the engine must not
    // silently swallow free-form text that the SPA may use.
    const passthrough = substitute({
      template: "[{{entity.code}}]",
      data: { entity: { code: "300SP-X" } },
      branch,
      isThermal: false,
    });
    expect(passthrough).toContain("[300SP-X]");
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

  it("preset bodies do NOT carry English subtitle text (system-language guarantee)", async () => {
    // The user contract is "نظام الطباعة بلغة النظام" — printed docs must
    // be in Arabic. Several presets used to ship a bilingual subtitle like
    // "Fleet Trip — #..." beneath the Arabic h2 header; they're now all
    // Arabic. Lock that in so a future contributor doesn't sneak an
    // English sub-line back in by copying an older preset.
    //
    // We scan EVERY string passed to makePreset({ body: `…` }) for the
    // common English title-case bigrams that used to leak ("Fleet Trip",
    // "Vehicle Card", "Lease Agreement", …). A real attorney's bilingual
    // contract template can still ship two languages — they'd use the
    // visual builder + a saved DB row, not the seeded preset.
    const src = read(join(PRINT_LIB, "templateResolver.ts"));
    const bodies = Array.from(src.matchAll(/body:\s*`([\s\S]*?)`/g)).map((m) => m[1]);
    expect(bodies.length).toBeGreaterThan(40);
    // Allowed English tokens: standard acronyms + a few technical refs.
    const allow = new Set(["SKU", "IBAN", "VAT", "QR", "PDF", "API", "ID"]);
    const offenders: Array<{ phrase: string; idx: number }> = [];
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      // Match `Word Word` outside of attribute values and outside dir="ltr"
      // spans. Skip lines that look like CSS (contain : or ;).
      const matches = body.match(/(?:^|>)[^<]*?\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b[^<]*?(?=<|$)/gm);
      if (!matches) continue;
      for (const m of matches) {
        const word = m.match(/([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})/)?.[1] ?? "";
        // Skip allowlisted technical phrases (none currently span 2 words
        // but the structure keeps the check extensible).
        if ([...allow].some((a) => word.includes(a))) continue;
        offenders.push({ phrase: word, idx: i });
      }
    }
    expect(
      offenders.map((o) => o.phrase),
      `English subtitle leaked into preset body. Translate it to Arabic — keep technical refs (SKU, IBAN, VAT) only.`,
    ).toEqual([]);
  });
});

describe("Print Engine v2 — listPrintableEntityTypes (catalogue endpoint)", () => {
  // The /api/print/entity-types endpoint feeds the SPA template-editor
  // dropdown. The old editor shipped a hand-maintained list of 24 entities
  // even after the engine grew to 100+, so half the entities had no UI
  // to edit a template for. Backend now owns the catalogue and the SPA
  // pulls it live.
  it("exports listPrintableEntityTypes and the helper returns a sorted catalogue", async () => {
    const mod = await import("../../src/lib/print/templateResolver.js");
    const list = (mod as { listPrintableEntityTypes?: () => Array<{ id: string; label: string; hasBespokePreset: boolean }> })
      .listPrintableEntityTypes;
    expect(typeof list, "listPrintableEntityTypes must be exported").toBe("function");
    const items = list!();
    // The catalogue must cover the 100+ types after the closing sweep
    // (BESPOKE_PRESETS ∪ ARABIC_TITLES). Test conservatively for "much
    // more than the old 24" so a future shrink trips this.
    expect(items.length, "catalogue should expose 50+ printable entity types").toBeGreaterThan(50);
    // Every entry shaped { id, label, hasBespokePreset }.
    for (const item of items.slice(0, 5)) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("hasBespokePreset");
      expect(typeof item.id).toBe("string");
      expect(typeof item.label).toBe("string");
      expect(typeof item.hasBespokePreset).toBe("boolean");
    }
    // Synthetic report_ types are filtered out — they're not user-editable
    // templates (the SPA payload owns the rendering).
    expect(items.some((i) => i.id.startsWith("report_"))).toBe(false);
    // A representative sample of business-critical types must appear with
    // their Arabic labels (not the raw slug).
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const slug of ["invoice", "quotation", "receipt_voucher", "payroll", "tenant", "umrah_pilgrim"]) {
      const found = byId.get(slug);
      expect(found, `catalogue must include ${slug}`).toBeTruthy();
      expect(found?.label, `${slug} label must be Arabic`).toMatch(/[؀-ۿ]/);
    }
  });

  it("/api/print/entity-types is registered behind requirePermission(templates:read)", () => {
    const src = read(ROUTES_FILE);
    expect(src).toMatch(/router\.get\(\s*"\/entity-types"/);
    expect(src).toMatch(/listPrintableEntityTypes/);
    // Same gate as listTemplates — both surfaces are admin/settings-only.
    const match = src.match(/router\.get\(\s*"\/entity-types"[^)]*requirePermission\("templates:read"\)/s);
    expect(match, "endpoint must require templates:read").toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Live coverage audit — answers the user's question "هل النظام شغال على
// كل النماذج؟" by walking entityRegistry and confirming every entity
// marked `print.hasTemplate: true` has BOTH a working data path AND a
// preset (or a registered table for the universal fallback).
//
// A regression here means a user clicks a print button on entity X and
// the printed doc is empty (or the dataLoader silently returns
// `{ entity: { id } }`). We treat that as a stop-ship today, not a
// best-effort.
// ──────────────────────────────────────────────────────────────────────────

describe("Print Engine v2 — every printable entityType has a real data path AND a preset (live audit)", () => {
  it("every entityRegistry entry with hasTemplate=true is end-to-end printable", async () => {
    const registrySrc = read(ENTITY_REGISTRY);
    const loaderSrc = read(join(PRINT_LIB, "dataLoader.ts"));
    const presetSrc = read(join(PRINT_LIB, "templateResolver.ts"));

    // 1. Pull printable entities — every block carrying `hasTemplate: true`
    //    in the registry's `print:` field.
    const printableIds = Array.from(registrySrc.matchAll(
      /id:\s*"([a-z_]+)"[\s\S]*?print:\s*\{[^}]*?hasTemplate:\s*true/g,
    )).map((m) => m[1]);
    expect(printableIds.length, "registry must declare at least 30 printable entities").toBeGreaterThan(30);

    // 2. Where can each entity get its data?
    //    a) dispatch switch case in dataLoader.ts (bespoke loader)
    //    b) FALLBACK_TABLE_MAP entry (generic loadByTable)
    //    c) registry's `table:` field (generic loadByTable)
    const switchCases = new Set(
      Array.from(loaderSrc.matchAll(/case\s+"([a-z_]+)"/g)).map((m) => m[1]),
    );
    const fallbackMatch = loaderSrc.match(/const\s+FALLBACK_TABLE_MAP[^{]*=\s*\{([\s\S]*?)\n\};/);
    const fallbackKeys = new Set(
      fallbackMatch
        ? Array.from(fallbackMatch[1].matchAll(/^\s*([a-z_]+):/gm)).map((m) => m[1])
        : [],
    );
    // Registry `table:` field — pulled by entry id so we can look it up.
    const registryTables = new Map<string, string>();
    for (const m of registrySrc.matchAll(
      /id:\s*"([a-z_]+)"[\s\S]*?table:\s*"([a-z_]+)"/g,
    )) {
      registryTables.set(m[1], m[2]);
    }

    // 3. Preset coverage — BESPOKE_PRESETS map keys.
    const bespokeMatch = presetSrc.match(
      /const\s+BESPOKE_PRESETS[^{]*=\s*\{([\s\S]*?)\n\};\s+function\s+buildInvoicePreset/,
    );
    const bespokeKeys = new Set(
      bespokeMatch
        ? Array.from(bespokeMatch[1].matchAll(/^\s*([a-z_]+):\s*\(/gm)).map((m) => m[1])
        : [],
    );

    // 4. Walk each printable entity and verify the data axis.
    //    A bespoke preset is preferred but not required: when missing,
    //    resolveTemplate falls back to universalFallback which renders
    //    the meta-grid + auto-built items table. Either way the doc has
    //    real content — but a missing DATA path means the printed body
    //    is blank, which is the actual stop-ship.
    const dataFailures: string[] = [];
    const presetGaps: string[] = []; // recorded for visibility, not asserted as failure
    for (const id of printableIds) {
      const hasDataPath =
        switchCases.has(id) || fallbackKeys.has(id) || registryTables.has(id);
      if (!hasDataPath) {
        dataFailures.push(`${id}: no switch case, no FALLBACK_TABLE_MAP entry, no registry table`);
      }
      if (!bespokeKeys.has(id)) {
        presetGaps.push(id);
      }
    }

    expect(
      dataFailures,
      `${dataFailures.length}/${printableIds.length} printable entities have no data path — print button would render empty.`,
    ).toEqual([]);
    // The bespoke-preset gap list is INFORMATIONAL. We assert it stays
    // short — any future drift (a developer adding a new entity with
    // hasTemplate=true but no preset) shows up here so they remember
    // to wire it.
    expect(
      presetGaps.length,
      `presetGaps (${presetGaps.length}) — these entities use universalFallback:\n  ${presetGaps.join(", ")}`,
    ).toBeLessThan(10);
  });

  it("verify route is mounted before authMiddleware and returns the full audit subset", () => {
    const verifySrc = read(join(REPO_ROOT, "artifacts/api-server/src/routes/printVerify.ts"));
    const indexSrc = read(join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"));
    // Route file shape
    expect(verifySrc).toMatch(/router\.get\(\s*"\/:jobId"/);
    expect(verifySrc).toMatch(/SELECT\s+pj\."entityType"[\s\S]*?print_jobs/);
    expect(verifySrc).toMatch(/LEFT JOIN companies/);
    expect(verifySrc).toMatch(/LEFT JOIN branches/);
    expect(verifySrc).toMatch(/verified:\s*true/);
    expect(verifySrc).toMatch(/copyNumber/);
    expect(verifySrc).toMatch(/isReprint/);
    expect(verifySrc).toMatch(/printedAt/);
    expect(verifySrc).toMatch(/issuer:/);
    // Mounted BEFORE authMiddleware so QR scanners hit the public path.
    expect(indexSrc).toMatch(/printVerifyRouter/);
    expect(indexSrc).toMatch(/router\.use\("\/print\/verify",\s*printVerifyRouter\)/);
    // Verify the public-route mount appears before `router.use(authMiddleware`.
    const mountIdx = indexSrc.search(/router\.use\("\/print\/verify"/);
    const authIdx = indexSrc.search(/router\.use\(authMiddleware\)/);
    expect(mountIdx, "/print/verify must be mounted").toBeGreaterThan(-1);
    if (authIdx > -1) {
      expect(
        mountIdx,
        "verify route must mount BEFORE authMiddleware so anonymous QR scanners pass through",
      ).toBeLessThan(authIdx);
    }
  });

  it("SPA /print/verify/:jobId page is wired in the public route block (no auth)", () => {
    const appSrc = read(join(REPO_ROOT, "artifacts/ghayth-erp/src/App.tsx"));
    // Lazy-loaded page exists
    expect(appSrc).toMatch(/PrintVerify\s*=\s*lazy\(/);
    // Mounted at /print/verify/:jobId
    expect(appSrc).toMatch(/<Route\s+path="\/print\/verify\/:jobId">/);
    // In the public block (outside ProtectedRoutes — the diff between the
    // anonymous /login + this route and the rest of the app).
    const protectedIdx = appSrc.search(/function\s+ProtectedRoutes/);
    const verifyMountIdx = appSrc.search(/<Route\s+path="\/print\/verify\/:jobId">/);
    const routerIdx = appSrc.search(/function\s+Router\(/);
    expect(verifyMountIdx).toBeGreaterThan(routerIdx);
    expect(verifyMountIdx).toBeGreaterThan(protectedIdx); // declared after ProtectedRoutes but inside the public Router fn
  });

  it("loadEmployeeContract + loadPayrollRun JOIN the employees table by name (no hard-coded data)", () => {
    const loaderSrc = read(join(PRINT_LIB, "dataLoader.ts"));
    // Employee contract — joins employees for the employee bag
    expect(loaderSrc).toMatch(/loadEmployeeContract[\s\S]*?FROM employees/);
    // Payroll roster — explicit alias selects e.name AS "employeeName"
    expect(loaderSrc).toMatch(/loadPayrollRun[\s\S]*?LEFT JOIN employees/);
    expect(loaderSrc).toMatch(/e\.name AS "employeeName"/);
    expect(loaderSrc).toMatch(/e\."empNumber"/);
    // Payslip — single-employee detail also resolves the employee name
    expect(loaderSrc).toMatch(/loadPayslip[\s\S]*?SELECT id, name, "empNumber" FROM employees/);
  });

  it("Payroll preset references the JOINed columns inside its {{#each items}} block", () => {
    const presetSrc = read(join(PRINT_LIB, "templateResolver.ts"));
    // The preset must consume what the loader produces — otherwise the
    // printed doc shows blank cells where employee names should be.
    expect(presetSrc).toMatch(/buildPayrollRunPreset[\s\S]*?\{\{this\.employeeName\}\}/);
    expect(presetSrc).toMatch(/buildPayrollRunPreset[\s\S]*?\{\{this\.empNumber\}\}/);
    expect(presetSrc).toMatch(/buildPayrollRunPreset[\s\S]*?\{\{this\.netSalary\}\}/);
  });
});

describe("Print Engine v2 — print-grade CSS (browser HTML→PDF quality)", () => {
  // The HTML-via-browser-print path is the entire render pipeline for A4
  // + thermal. To produce a real, professionally-paginated PDF the
  // adapter CSS must carry the @page rules, page-break hints, and
  // print-colour fidelity. A regression here means split tables, missing
  // table headers on page 2, totals torn between pages — every complaint
  // a finance team has filed since the engine launched.
  it("a4Adapter CSS pins the print contract: @page + page-break rules + thead repeat", () => {
    const src = read(join(PRINT_LIB, "adapters/a4Adapter.ts"));
    // @page metadata
    expect(src).toMatch(/@page\s*\{[\s\S]*size:\s*A4/);
    // Page counter in footer
    expect(src).toMatch(/@bottom-center/);
    expect(src).toMatch(/counter\(page\)/);
    expect(src).toMatch(/counter\(pages\)/);
    // Thead repeats on every page
    expect(src).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
    // No row split across pages
    expect(src).toMatch(/page-break-inside:\s*avoid[\s\S]*break-inside:\s*avoid/);
    // Headings shouldn't trail at the bottom of a page
    expect(src).toMatch(/h1,?\s*h2,?\s*h3\s*\{[\s\S]*page-break-after:\s*avoid/);
    // Print colour fidelity (logos, badges, status colours)
    expect(src).toMatch(/-webkit-print-color-adjust:\s*exact/);
    expect(src).toMatch(/print-color-adjust:\s*exact/);
    // Watermark stays fixed across every page
    expect(src).toMatch(/\.watermark\s*\{[\s\S]*position:\s*fixed/);
  });

  it("thermalAdapter CSS uses continuous paper sizing + Arabic-aware width", () => {
    const src = read(join(PRINT_LIB, "adapters/thermalAdapter.ts"));
    expect(src).toMatch(/@page\s*\{\s*size:\s*\$\{w\}mm\s+auto/);
    expect(src).toMatch(/font-family:\s*'Noto Naskh Arabic'/);
    // No paginated counters — receipts are continuous, not pages
    expect(src).not.toMatch(/@bottom-center/);
    // Item rows shouldn't split across a tear-off boundary
    expect(src).toMatch(/tr\s*\{[\s\S]*page-break-inside:\s*avoid/);
    // Totals/QR block always one piece
    expect(src).toMatch(/\.t-grand|\.t-totals/);
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

describe("Print Engine v2 — statement bespoke presets", () => {
  // PR1 of issue #1286 wired customer-statement-print.tsx and
  // vendor-statement-print.tsx through <PrintButton entityType="…_statement">.
  // Without bespoke presets the platform falls back to the universal renderer
  // which produces a database-dump look. These presets give the printed
  // statement a proper letterhead, party-info block, totals card, and a
  // ledger table — close enough to the inline UI that finance users won't
  // notice the move to server-side rendering.
  const src = readFileSync(join(PRINT_LIB, "templateResolver.ts"), "utf8");

  it("registers customer_statement and vendor_statement in BESPOKE_PRESETS", () => {
    expect(src).toMatch(/customer_statement:\s*\(\)\s*=>\s*buildCustomerStatementPreset/);
    expect(src).toMatch(/vendor_statement:\s*\(\)\s*=>\s*buildVendorStatementPreset/);
  });

  it("statement presets surface the loader's note field for the not-found path", () => {
    // When the loader can't find the client/supplier it returns a `note`.
    // The preset must conditionally render that note instead of an empty
    // ledger, otherwise "no client" produces a blank page that looks like a
    // platform bug. The {{#if entity.note}} guard is the contract.
    expect(src).toMatch(/buildCustomerStatementPreset[\s\S]*?\{\{#if entity\.note\}\}/);
    expect(src).toMatch(/buildVendorStatementPreset[\s\S]*?\{\{#if entity\.note\}\}/);
  });
});

describe("Print platform — Stop-Ship: no parallel print systems", () => {
  // The print platform is the only path that produces audited, archived,
  // verifiable documents. A stray `window.print()` in any user-facing page
  // bypasses the audit row, the QR verification, the retention rules, and
  // the reprint approvals — i.e. every guarantee the platform exists to
  // provide. Issue #1286 makes this a Stop-Ship: the merge gate fails the
  // moment a new call appears, no exceptions. To add a printable page,
  // wire a server-side data loader + use <PrintButton entityType=... />.
  //
  // Allowed locations (the official print module's OWN code may reference
  // window.print in its template HTML, since the template's auto-print
  // script IS the one that triggers the browser dialog inside the popup):
  const ALLOWED_PATTERNS = [
    /artifacts\/api-server\/src\/lib\/print\//,
    /artifacts\/ghayth-erp\/src\/components\/shared\/print-button\.tsx$/,
    /artifacts\/ghayth-erp\/src\/components\/shared\/entity-print\.tsx$/,
    /artifacts\/ghayth-erp\/src\/lib\/print-client\.ts$/,
    /artifacts\/ghayth-erp\/src\/pages\/admin\/print-/,
    // GAP_MATRIX P0 — BI analytics pages use logClientPrint() before window.print()
    // to record an audit row; recharts content cannot be server-rendered.
    /artifacts\/ghayth-erp\/src\/pages\/bi-admin-reports\.tsx$/,
    /artifacts\/ghayth-erp\/src\/pages\/bi-operations\.tsx$/,
    /artifacts\/ghayth-erp\/src\/components\/print-layout\.tsx$/,
    /artifacts\/ghayth-erp\/src\/styles\/print\.css$/,
    /tests\//,
    /node_modules\//,
    /\.test\.[tj]sx?$/,
    /docs\/architecture\/print-platform/,
  ];

  function scan(pattern: RegExp): string[] {
    // Walk the source tree by hand — avoid spawning grep so the test stays
    // hermetic and predictable in CI environments without GNU grep.
    const hits: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") continue;
          walk(p);
        } else if (entry.isFile()) {
          if (!/\.(tsx?|jsx?|css|scss)$/.test(entry.name)) continue;
          if (ALLOWED_PATTERNS.some((re) => re.test(p))) continue;
          const src = readFileSync(p, "utf8");
          if (pattern.test(src)) hits.push(p);
        }
      }
    }
    walk(join(REPO_ROOT, "artifacts"));
    return hits;
  }

  it("no window.print() outside the official print module", () => {
    const hits = scan(/\bwindow\.print\s*\(/);
    expect(
      hits,
      `Found window.print() in ${hits.length} file(s). Route printing through <PrintButton entityType=... entityId=... /> instead.\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("no third-party PDF generators imported (jspdf, pdfmake, html2canvas, html2pdf, puppeteer, react-to-print)", () => {
    // Any direct PDF generation in the browser bypasses the platform's
    // server-side render → archive → audit pipeline. We forbid the imports
    // at the static level so a regression can't sneak in via a follow-up PR.
    const banned = ["jspdf", "pdfmake", "html2canvas", "html2pdf", "puppeteer", "react-to-print"];
    const pattern = new RegExp(`(import|require)\\s*[^;]*['"](${banned.join("|")})['"]`);
    const hits = scan(pattern);
    expect(
      hits,
      `Banned PDF libs imported in ${hits.length} file(s). Use the official print platform instead.\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});

describe("Print platform — granular permissions (issue #1286)", () => {
  // The legacy print perms bundle several capabilities under one key:
  // `print_jobs:read` lets you list jobs AND prune storage AND see the
  // archive view AND power the diagnostics page. Issue #1286 demands one
  // permission per capability so owners can mint narrower roles. The five
  // perms below are the granular additions — they're wired via
  // requireAnyPermission so existing roles with the legacy keys keep
  // working (no migration needed). The test locks down both halves:
  // (1) the perms exist in the catalogue (so roles can grant them);
  // (2) the routes accept them as an alternative to the legacy gate.
  const rbac = readFileSync(RBAC_CATALOG, "utf8");
  const routes = readFileSync(ROUTES_FILE, "utf8");

  const GRANULAR = [
    "print:preview:create",
    "print:download",
    "print:archive:delete",
    "print:verify:read",
    "print:diagnostics:read",
  ];

  it("declares every granular print permission in the RBAC catalogue", () => {
    for (const p of GRANULAR) {
      expect(rbac, `RBAC catalogue missing ${p}`).toContain(`"${p}"`);
    }
  });

  it("declares per-entity perms for the two new statement entity types", () => {
    // customer_statement / vendor_statement were wired in PR1+PR2 but lacked
    // per-entity perms. Adding them keeps the per-entity catalogue
    // exhaustive — owners can now revoke statement printing per role.
    expect(rbac).toContain('"print:customer_statement:create"');
    expect(rbac).toContain('"print:vendor_statement:create"');
  });

  it("/preview accepts either templates:read OR print:preview:create", () => {
    // Match the route handler signature for /preview specifically — the
    // collapsed-whitespace form lets the test survive multi-line formatting.
    const collapsed = routes.replace(/\s+/g, " ");
    expect(collapsed).toMatch(/router\.post\(\s*"\/preview".*?requireAnyPermission\(\s*"templates:read"\s*,\s*"print:preview:create"\s*\)/);
  });

  it("/jobs/:jobId/download accepts either print_jobs:read OR print:download", () => {
    const collapsed = routes.replace(/\s+/g, " ");
    expect(collapsed).toMatch(/router\.get\(\s*"\/jobs\/:jobId\/download".*?requireAnyPermission\(\s*"print_jobs:read"\s*,\s*"print:download"\s*\)/);
  });

  it("/jobs/prune accepts either print_jobs:read OR print:archive:delete", () => {
    const collapsed = routes.replace(/\s+/g, " ");
    expect(collapsed).toMatch(/router\.post\(\s*"\/jobs\/prune".*?requireAnyPermission\(\s*"print_jobs:read"\s*,\s*"print:archive:delete"\s*\)/);
  });

  it("/archive/:entityType/:entityId accepts either print_jobs:read OR print:verify:read", () => {
    const collapsed = routes.replace(/\s+/g, " ");
    expect(collapsed).toMatch(/router\.get\(\s*"\/archive\/:entityType\/:entityId".*?requireAnyPermission\(\s*"print_jobs:read"\s*,\s*"print:verify:read"\s*\)/);
  });

  it("/jobs and /jobs.csv accept either print_jobs:read OR print:diagnostics:read", () => {
    expect(routes).toContain('router.get("/jobs", requireAnyPermission("print_jobs:read", "print:diagnostics:read")');
    expect(routes).toContain('router.get("/jobs.csv", requireAnyPermission("print_jobs:read", "print:diagnostics:read")');
  });
});

describe("Print Engine v2 — statement loaders compute opening balance", () => {
  // Both statement loaders must compute opening balance from movements
  // BEFORE the start date — without this a partial-period print silently
  // understates the outstanding balance (started at zero, ignored all
  // prior activity). The customer loader had this from day one; the
  // vendor loader was missing it until this fix. Locking both down with
  // a single test stops a future refactor from regressing either side.
  const src = readFileSync(join(PRINT_LIB, "reportLoaders.ts"), "utf8");

  it("loadCustomerStatement computes openingBalance and returns it in the entity dict", () => {
    // Slice the function body so the test only matches inside the right
    // loader — otherwise vendor's openingBalance assignment would satisfy
    // the customer assertion too.
    const fnIdx = src.indexOf("export async function loadCustomerStatement");
    const endIdx = src.indexOf("export async function loadVendorStatement", fnIdx);
    expect(fnIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(fnIdx);
    const body = src.slice(fnIdx, endIdx);
    expect(body).toMatch(/const\s+openingBalance\s*=/);
    expect(body).toMatch(/openingBalance:\s*Math\.round/);
    expect(body).toMatch(/let\s+running\s*=\s*openingBalance/);
  });

  it("loadVendorStatement computes openingBalance and returns it in the entity dict", () => {
    const fnIdx = src.indexOf("export async function loadVendorStatement");
    expect(fnIdx).toBeGreaterThan(0);
    const body = src.slice(fnIdx);
    expect(body).toMatch(/const\s+openingBalance\s*=/);
    expect(body).toMatch(/openingBalance:\s*Math\.round/);
    expect(body).toMatch(/let\s+running\s*=\s*openingBalance/);
  });

  it("vendor opening-balance SQL gracefully handles missing tables (older tenants)", () => {
    // purchase_orders may not exist on pre-procurement tenants. The
    // catch-42P01 pattern is what stops the entire statement from
    // 500-ing in that case — without it, customers without procurement
    // can't print a vendor statement at all.
    const fnIdx = src.indexOf("export async function loadVendorStatement");
    const body = src.slice(fnIdx);
    expect(body).toMatch(/openingBalance[\s\S]*?42P01/);
  });
});

describe("Print platform — CSV-only pages migrated to PrintButton (#1286 Q6)", () => {
  // Q6 of the deep audit on #1286: six pages had a "Download CSV" button
  // but no print path through the official platform. The user could pull
  // the data into Excel but had no audited, archived, QR-verifiable PDF.
  // This wave wires <PrintButton> + payload bypass onto all six.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  const PAGES: Array<{ path: string; entityType: string }> = [
    { path: "pages/finance/ar-aging.tsx",              entityType: "report_ar_aging" },
    { path: "pages/finance/ap-aging.tsx",              entityType: "report_ap_aging" },
    { path: "pages/finance/inventory-valuation.tsx",   entityType: "report_inventory_valuation" },
    { path: "pages/finance/wht-filing-workbench.tsx",  entityType: "report_wht_filing" },
    { path: "pages/finance/daily-close-checklist.tsx", entityType: "report_daily_close" },
    { path: "pages/admin/logs.tsx",                    entityType: "report_audit_logs" },
  ];

  for (const { path, entityType } of PAGES) {
    it(`${path} mounts <PrintButton entityType="${entityType}" payload={...}>`, () => {
      const src = readFileSync(join(SPA, path), "utf8");
      expect(src, `${path} must import PrintButton`).toContain('from "@/components/shared/print-button"');
      expect(src, `${path} must render PrintButton`).toContain("<PrintButton");
      expect(src, `${path} must use entityType="${entityType}"`).toContain(`entityType="${entityType}"`);
      expect(src, `${path} must pass payload (client-side rows bypass dataLoader)`).toMatch(/payload=\{/);
    });
  }
});

describe("Print platform — PrintButton.payload contract (#1286 follow-up)", () => {
  // The payload prop is the bridge that lets report pages route through
  // the official platform without requiring a server-side dataLoader for
  // every report type. Adding a backend loader for every report is a
  // long-running effort; payload bypass is the immediate unification.
  const printButton = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/print-button.tsx"), "utf8");

  it("PrintButton accepts an optional payload prop", () => {
    expect(printButton).toMatch(/payload\?:\s*Record<string,\s*unknown>/);
  });

  it("PrintButton forwards payload to /print/render only when provided", () => {
    // Conditional spread keeps the wire format clean — no `payload: undefined`
    // ending up in the JSON body for the common no-payload case.
    // Accept either the simple `payload` or the resolved variant (function-form payloads).
    expect(printButton).toMatch(/\.\.\.\((?:resolvedPayload|payload)\s*\?\s*\{\s*payload:?\s*(?:resolvedPayload)?\s*\}\s*:\s*\{\}\)/);
  });
});

describe("Print platform — finance reports wave 5 migrated (#1286 Q4 wave 5)", () => {
  // Final wave: 4 pages with non-standard CSV anchors (camel-case exportCsv).
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  const PAGES: Array<{ path: string; entityType: string }> = [
    { path: "pages/finance/cash-13week.tsx",                 entityType: "report_cash_13week" },
    { path: "pages/finance/income-statement-trend.tsx",      entityType: "report_income_trend" },
    { path: "pages/finance/trial-balance-comparison.tsx",    entityType: "report_trial_balance_comparison" },
    { path: "pages/finance/cost-center-pnl.tsx",             entityType: "report_cost_center_pnl" },
  ];

  for (const { path, entityType } of PAGES) {
    it(`${path} mounts <PrintButton entityType="${entityType}" payload={...}>`, () => {
      const src = readFileSync(join(SPA, path), "utf8");
      expect(src, `${path} must import PrintButton`).toContain('from "@/components/shared/print-button"');
      expect(src, `${path} must render PrintButton`).toContain("<PrintButton");
      expect(src, `${path} must use entityType="${entityType}"`).toContain(`entityType="${entityType}"`);
      expect(src, `${path} must pass payload`).toMatch(/payload=\{/);
    });
  }
});

describe("Print platform — print-log self-print (#1286 closeout)", () => {
  // The print platform's own audit-log viewer is the last page to migrate.
  // Compliance reviews routinely want a printed copy of the print log
  // itself; the meta-print loops back through the platform (audited row
  // recording who printed which print log + when) — perfect closure on
  // the unification work.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  it("pages/reports/print-log.tsx mounts <PrintButton entityType=\"report_print_log\" payload={...}>", () => {
    const src = readFileSync(join(SPA, "pages/reports/print-log.tsx"), "utf8");
    expect(src).toContain('from "@/components/shared/print-button"');
    expect(src).toContain("<PrintButton");
    expect(src).toContain('entityType="report_print_log"');
    expect(src).toMatch(/payload=\{/);
  });
});

describe("Print platform — detail-page entityTypes have a data source (#1286 bug fix)", () => {
  // User reported: "pressing print produces a unified empty form".
  // Root cause: 30 entityTypes used by detail pages (expense, leave, ticket,
  // unit, opportunity, …) had no data source — they fell through to the
  // bare stub `{ entity: { id } }` because:
  //   1. They weren't a switch case in dataLoader.ts
  //   2. They weren't a registered entity in entityRegistry.ts
  //   3. They weren't in FALLBACK_TABLE_MAP
  //
  // This test scans every entityType used in SPA detail pages and asserts
  // it resolves to ONE of those three sources — so a new detail-page
  // entityType that doesn't have a backing data source fails CI before
  // a user clicks Print and sees an empty document.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  const registry = readFileSync(ENTITY_REGISTRY, "utf8");
  const dataLoader = readFileSync(join(PRINT_LIB, "dataLoader.ts"), "utf8");

  function entityTypesFromDetailPages(): string[] {
    const fs = readdirSync(join(SPA, "pages/details"));
    const set = new Set<string>();
    for (const f of fs) {
      if (!f.endsWith(".tsx")) continue;
      const src = readFileSync(join(SPA, "pages/details", f), "utf8");
      for (const m of src.matchAll(/entityType="([a-z_]+)"/g)) {
        set.add(m[1]);
      }
    }
    return [...set];
  }

  function isStub(et: string): boolean {
    if (registry.match(new RegExp(`^\\s+id:\\s*"${et}"\\s*,\\s*$`, "m"))) return false;
    if (dataLoader.match(new RegExp(`case\\s+"${et}"\\s*:`))) return false;
    const fbMatch = dataLoader.match(/FALLBACK_TABLE_MAP:[^=]+=\s*\{([\s\S]*?)\n\};/);
    if (fbMatch && fbMatch[1].match(new RegExp(`^\\s+${et}:`, "m"))) return false;
    return true;
  }

  // Known-broken — these pages call endpoints that don't exist on the
  // backend yet (no table, no route). Track them as documented gaps
  // until the upstream entity is implemented.
  const ACCEPTED_STUBS = new Set([
    "commitment",   // /finance/commitments/:id — endpoint not implemented
    "receivable",   // /finance/receivables/:id — endpoint not implemented
  ]);

  it("every entityType used by a SPA detail page resolves to a data source", () => {
    const types = entityTypesFromDetailPages();
    const broken: string[] = [];
    for (const et of types) {
      if (ACCEPTED_STUBS.has(et)) continue;
      if (isStub(et)) broken.push(et);
    }
    expect(
      broken,
      `These entityTypes are used in detail pages but have no data source — ` +
      `printing them produces an empty document. Wire them via a switch case ` +
      `in dataLoader.ts, an entityRegistry entry, or FALLBACK_TABLE_MAP.\n${broken.join("\n")}`,
    ).toEqual([]);
  });
});

describe("Print platform — ListPage opt-in pages (#1286 continuation)", () => {
  // ListPage component has `printEntityType` prop built-in (auto-emits
  // PrintButton when set). Pages using <ListPage> can opt in by passing
  // the entityType — they then get the platform-routed print path for
  // free. Locking this here so a future refactor doesn't drop the prop.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  const PAGES: Array<{ path: string; entityType: string }> = [
    { path: "pages/finance/fiscal-periods-v2.tsx", entityType: "report_fiscal_periods" },
    { path: "pages/finance/journal-manual.tsx",    entityType: "journal_entry" },
  ];
  for (const { path, entityType } of PAGES) {
    it(`${path} passes printEntityType="${entityType}" to ListPage`, () => {
      const src = readFileSync(join(SPA, path), "utf8");
      expect(src).toContain(`printEntityType="${entityType}"`);
    });
  }
});

describe("Print platform — umrah daily runsheet (#1286 final closeout)", () => {
  // The umrah daily runsheet had its own /api/umrah/reports/daily-runsheet/pdf
  // endpoint — a parallel PDF generator that bypassed the official platform
  // entirely. The page now ALSO offers a <PrintButton entityType="umrah_runsheet">
  // path that goes through the platform (bespoke preset already registered
  // in BESPOKE_PRESETS). The legacy "تصدير PDF" button stays for backward
  // compat with any external integration that depends on it.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  it("pages/umrah/daily-runsheet.tsx mounts <PrintButton entityType=\"umrah_runsheet\" payload={...}>", () => {
    const src = readFileSync(join(SPA, "pages/umrah/daily-runsheet.tsx"), "utf8");
    expect(src).toContain('from "@/components/shared/print-button"');
    expect(src).toContain("<PrintButton");
    expect(src).toContain('entityType="umrah_runsheet"');
    expect(src).toMatch(/payload=\{/);
  });
});

describe("Print platform — finance reports wave 6 migrated (#1286 last sweep)", () => {
  // 12 more pages discovered in the closeout audit: pages with Blob downloads
  // but no PrintButton, hidden among the dashboards + workbenches that
  // earlier waves missed (camel-case wrappers, GuardedButton instead of
  // Button, no FinanceTabsNav, etc.). This sweep is the literal last batch.
  const SPA = join(REPO_ROOT, "artifacts/ghayth-erp/src");
  const PAGES: Array<{ path: string; entityType: string }> = [
    { path: "pages/finance/overrides-report.tsx",          entityType: "report_overrides" },
    { path: "pages/finance/custody-workbench.tsx",         entityType: "report_custody_workbench" },
    { path: "pages/finance/vendor-contracts-tracker.tsx",  entityType: "report_vendor_contracts" },
    { path: "pages/finance/negative-stock.tsx",            entityType: "report_negative_stock" },
    { path: "pages/finance/vat-filing-readiness.tsx",      entityType: "report_vat_filing_readiness" },
    { path: "pages/finance/bank-accounts-watch.tsx",       entityType: "report_bank_accounts_watch" },
    { path: "pages/finance/cash-flow-statement.tsx",       entityType: "report_cash_flow_statement" },
    { path: "pages/finance/lot-expiry-alerts.tsx",         entityType: "report_lot_expiry_alerts" },
    { path: "pages/finance/yoy-comparison.tsx",            entityType: "report_yoy_comparison" },
    { path: "pages/finance/invoice-send-queue.tsx",        entityType: "report_invoice_send_queue" },
    { path: "pages/finance/expense-burn-rate.tsx",         entityType: "report_expense_burn_rate" },
    { path: "pages/finance/profitability.tsx",             entityType: "report_profitability" },
  ];

  for (const { path, entityType } of PAGES) {
    it(`${path} mounts <PrintButton entityType="${entityType}" payload={...}>`, () => {
      const src = readFileSync(join(SPA, path), "utf8");
      expect(src, `${path} must import PrintButton`).toContain('from "@/components/shared/print-button"');
      expect(src, `${path} must render PrintButton`).toContain("<PrintButton");
      expect(src, `${path} must use entityType="${entityType}"`).toContain(`entityType="${entityType}"`);
      expect(src, `${path} must pass payload`).toMatch(/payload=\{/);
    });
  }
});

describe("Print Engine v2 — branded default themes", () => {
  it("exposes getBrandedThemeHtml with all three theme keys", async () => {
    const mod = await import("../../src/lib/print/brandedThemes.js");
    expect(typeof mod.getBrandedThemeHtml).toBe("function");
    expect(mod.THEME_KEYS).toEqual(["classic", "modern", "compact"]);
  });

  it("invoice theme carries items loop + totals + ZATCA QR token", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    for (const theme of ["classic", "modern", "compact"] as const) {
      const { html } = getBrandedThemeHtml("invoice", theme);
      expect(html, `${theme} must loop items`).toContain("{{#each items}}");
      expect(html, `${theme} must show grand total`).toContain("{{entity.total}}");
      expect(html, `${theme} must embed ZATCA QR`).toContain("{{entity.zatcaQr}}");
      expect(html, `${theme} must embed verify block`).toContain("{{system.verifyBlock}}");
      expect(html, `${theme} must include letterhead`).toContain("{{branch.letterhead}}");
    }
  });

  it("each theme produces visually distinct HTML", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    const classic = getBrandedThemeHtml("invoice", "classic").html;
    const modern = getBrandedThemeHtml("invoice", "modern").html;
    const compact = getBrandedThemeHtml("invoice", "compact").html;
    expect(classic).not.toBe(modern);
    expect(modern).not.toBe(compact);
    // Modern uses the gradient title band; classic uses a bordered h2.
    expect(modern).toContain("linear-gradient");
    expect(classic).not.toContain("linear-gradient");
  });

  it("unknown preset key falls back to classic theme", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    const fallback = getBrandedThemeHtml("invoice", "nonsense");
    expect(fallback.theme).toBe("classic");
  });

  it("entity without a bespoke recipe falls back to a branded generic document", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    // `campaign` has no recipe -> generic doc with the auto itemsTable token.
    const { html } = getBrandedThemeHtml("campaign", "modern");
    expect(html).toContain("{{entity.itemsTable}}");
    expect(html).toContain("{{branch.letterhead}}");
  });
});

describe("Print Engine v2 — branded document families", () => {
  it("exposes branded recipes for all major document families", async () => {
    const { brandedRecipeKeys } = await import("../../src/lib/print/brandedThemes.js");
    const keys = brandedRecipeKeys();
    // Spot-check one from each family.
    for (const k of [
      "quotation", "purchase_order", "delivery_note",       // line-item
      "payment_voucher", "receipt_voucher", "salary_advance", // vouchers
      "customer_statement", "vendor_statement",               // statements
      "journal_entry", "recurring_journal",                   // journals
      "payslip", "payroll",                                   // payslips
      "official_letter", "correspondence",                    // letters
      "employee_contract", "rental_contract",                 // contracts
    ]) {
      expect(keys, `${k} must have a branded recipe`).toContain(k);
    }
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });

  it("every recipe renders in all three themes with letterhead + footer + verify", async () => {
    const { getBrandedThemeHtml, brandedRecipeKeys } = await import("../../src/lib/print/brandedThemes.js");
    for (const entity of brandedRecipeKeys()) {
      for (const theme of ["classic", "modern", "compact"] as const) {
        const { html } = getBrandedThemeHtml(entity, theme);
        expect(html, `${entity}/${theme} letterhead`).toContain("{{branch.letterhead}}");
        expect(html, `${entity}/${theme} footer`).toContain("{{branch.footer}}");
        expect(html, `${entity}/${theme} verify`).toContain("{{system.verifyBlock}}");
      }
    }
  });

  it("voucher family shows an amount box, statement family a running balance", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    const voucher = getBrandedThemeHtml("payment_voucher", "classic").html;
    expect(voucher).toContain("المبلغ");
    expect(voucher).toContain("{{entity.amountInWords}}");
    const stmt = getBrandedThemeHtml("customer_statement", "classic").html;
    expect(stmt).toContain("{{this.balance}}");
    expect(stmt).toContain("الرصيد الختامي");
  });

  it("journal family shows debit/credit totals", async () => {
    const { getBrandedThemeHtml } = await import("../../src/lib/print/brandedThemes.js");
    const j = getBrandedThemeHtml("journal_entry", "modern").html;
    expect(j).toContain("{{entity.totalDebit}}");
    expect(j).toContain("{{entity.totalCredit}}");
  });
});
