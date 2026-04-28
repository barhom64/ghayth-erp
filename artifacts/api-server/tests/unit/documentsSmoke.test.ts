import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/documents.ts"),
  "utf8",
);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — endpoint registration", () => {
  it("exports a default router (global authMiddleware in index.ts)", () => {
    expect(SRC).toContain("export default router");
    expect(SRC).not.toContain("router.use(authMiddleware)");
  });

  it("registers all CRUD endpoints for documents", () => {
    expect(SRC).toContain('router.get("/",');
    expect(SRC).toContain('router.post("/",');
    expect(SRC).toContain('router.get("/:id",');
    expect(SRC).toContain('router.patch("/:id",');
    expect(SRC).toContain('router.delete("/:id",');
  });

  it("has upload, download, and preview endpoints", () => {
    expect(SRC).toContain('router.post("/upload"');
    expect(SRC).toContain('router.get("/:id/download"');
    expect(SRC).toContain('router.get("/:id/preview"');
  });

  it("has version, entity-link, folder, template, and stats endpoints", () => {
    expect(SRC).toContain('router.post("/:id/versions"');
    expect(SRC).toContain('router.get("/:id/versions"');
    expect(SRC).toContain('router.post("/:id/entity-links"');
    expect(SRC).toContain('router.get("/:id/entity-links"');
    expect(SRC).toContain('router.get("/folders"');
    expect(SRC).toContain('router.post("/folders"');
    expect(SRC).toContain('router.get("/templates"');
    expect(SRC).toContain('router.post("/templates"');
    expect(SRC).toContain('router.put("/templates/:id"');
    expect(SRC).toContain('router.delete("/templates/:id"');
    expect(SRC).toContain('router.get("/stats"');
  });

  it("has template generation, variables, and status endpoints", () => {
    expect(SRC).toContain('router.post("/templates/:id/generate"');
    expect(SRC).toContain('router.get("/templates/:id/variables"');
    expect(SRC).toContain('router.patch("/:id/status"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — permissions", () => {
  it("read endpoints require documents:read", () => {
    const listIdx = SRC.indexOf('router.get("/",');
    expect(SRC.slice(listIdx, SRC.indexOf("\n", listIdx))).toContain('requirePermission("documents:read")');
  });

  it("create endpoints require documents:create", () => {
    for (const ep of ['router.post("/",', 'router.post("/upload"', 'router.post("/:id/versions"']) {
      const idx = SRC.indexOf(ep);
      const line = SRC.slice(idx, SRC.indexOf("\n", idx));
      expect(line).toContain('requirePermission("documents:create")');
    }
  });

  it("download and preview require documents:download", () => {
    for (const ep of ['router.get("/:id/download"', 'router.get("/:id/preview"']) {
      const idx = SRC.indexOf(ep);
      const line = SRC.slice(idx, SRC.indexOf("\n", idx));
      expect(line).toContain('requirePermission("documents:download")');
    }
  });

  it("update endpoints require documents:update", () => {
    const idx = SRC.indexOf('router.patch("/:id",');
    const line = SRC.slice(idx, SRC.indexOf("\n", idx));
    expect(line).toContain('requirePermission("documents:update")');
  });

  it("delete endpoints require documents:delete", () => {
    for (const ep of ['router.delete("/:id"', 'router.delete("/templates/:id"']) {
      const idx = SRC.indexOf(ep);
      const line = SRC.slice(idx, SRC.indexOf("\n", idx));
      expect(line).toContain('requirePermission("documents:delete")');
    }
  });

  it("status approval is gated by APPROVE_ROLES (owner, general_manager, admin)", () => {
    expect(SRC).toContain('const APPROVE_ROLES = ["owner", "general_manager", "admin"]');
    const idx = SRC.indexOf('router.patch("/:id/status"');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("APPROVE_ROLES.includes");
    expect(section).toContain("scope.isOwner");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMPANY-ID SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — companyId scoping", () => {
  it("GET / scopes by companyId with OR IS NULL for global docs", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain('"companyId"=$1');
    expect(section).toContain('"companyId" IS NULL');
    expect(section).toContain("scope.companyId");
  });

  it("POST / inserts with scope.companyId", () => {
    const idx = SRC.indexOf('router.post("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId"');
  });

  it("POST /upload includes companyId in the INSERT", () => {
    const idx = SRC.indexOf('router.post("/upload"');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain('"companyId"');
    expect(section).toContain("scope.companyId");
  });

  it("download and preview scope document lookup by companyId", () => {
    const dlIdx = SRC.indexOf('router.get("/:id/download"');
    expect(SRC.slice(dlIdx, dlIdx + 3500)).toContain('"companyId"=$2');

    const pvIdx = SRC.indexOf('router.get("/:id/preview"');
    expect(SRC.slice(pvIdx, pvIdx + 3500)).toContain('"companyId"=$2');
  });

  it("POST /:id/versions uses strict companyId — no OR IS NULL (P02-S4-HIGH fix)", () => {
    const idx = SRC.indexOf('router.post("/:id/versions"');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain('"companyId"=$2 AND "deletedAt" IS NULL');
    expect(section).toContain('"companyId"=$7');
  });

  it("DELETE /:id scopes soft-delete by companyId", () => {
    const idx = SRC.indexOf('router.delete("/:id",');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain('"companyId"=$2');
  });

  it("folders are scoped by companyId", () => {
    const idx = SRC.indexOf('router.get("/folders"');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain('"companyId"=$1');
  });

  it("PUT and DELETE /templates/:id use strict companyId — no OR IS NULL (P02-S4-MED fix)", () => {
    const putIdx = SRC.indexOf('router.put("/templates/:id"');
    const putSection = SRC.slice(putIdx, putIdx + 4000);
    expect(putSection).toContain('"companyId"=$2');
    expect(putSection).toContain('"companyId"=$12');

    const delIdx = SRC.indexOf('router.delete("/templates/:id"');
    const delSection = SRC.slice(delIdx, delIdx + 3000);
    expect(delSection).toContain('"companyId"=$2');
  });

  it("stats endpoint scopes every COUNT query by companyId", () => {
    const idx = SRC.indexOf('router.get("/stats"');
    const section = SRC.slice(idx, idx + 3500);
    const matches = section.match(/"companyId"=\$1/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(5);
  });

  it("template generation scopes employee and invoice lookups by companyId", () => {
    const idx = SRC.indexOf('router.post("/templates/:id/generate"');
    const section = SRC.slice(idx, idx + 6000);
    expect(section).toContain('ea."companyId" = $2');
    expect(section).toContain('i."companyId"=$2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PARAMETERIZED SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — parameterized SQL (no injection)", () => {
  it("list endpoint builds WHERE with positional $N placeholders", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("params.push(category)");
    expect(section).toContain("params.push(docStatus)");
    expect(section).toContain("$${params.length}");
  });

  it("PATCH /:id dynamically builds SET clause with $N params", () => {
    const idx = SRC.indexOf('router.patch("/:id",');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain("params.push(b.title)");
    expect(section).toContain("$${params.length}");
    expect(section).toContain("sets.join");
  });

  it("upload INSERT uses positional parameters through $9", () => {
    const idx = SRC.indexOf('router.post("/upload"');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain("$1,$2,$3,$4,$5,$6");
    expect(section).toContain("$8,$9");
  });

  it("entity-link upsert uses ON CONFLICT DO NOTHING", () => {
    expect(SRC).toContain(
      'ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING',
    );
  });

  it("version creation INSERT uses positional params for all columns", () => {
    const idx = SRC.indexOf('router.post("/:id/versions"');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain("$1, $2, $3, $4, $5, $6, $7, $8");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. VALIDATION (ZOD SCHEMAS)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — validation", () => {
  it("createDocumentSchema requires title with min(1) and defaults status to draft", () => {
    const idx = SRC.indexOf("const createDocumentSchema");
    const section = SRC.slice(idx, idx + 600);
    expect(section).toContain("title: z.string().min(1)");
    expect(section).toContain('.default("draft")');
    expect(section).toContain('"draft"');
    expect(section).toContain('"active"');
    expect(section).toContain('"archived"');
  });

  it("uploadDocumentSchema requires storageKey and fileName", () => {
    const idx = SRC.indexOf("const uploadDocumentSchema");
    const section = SRC.slice(idx, idx + 600);
    expect(section).toContain("storageKey: z.string().min(1)");
    expect(section).toContain("fileName: z.string().min(1)");
  });

  it("updateStatusSchema restricts to draft, approved, cancelled", () => {
    const idx = SRC.indexOf("const updateStatusSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('"draft"');
    expect(section).toContain('"approved"');
    expect(section).toContain('"cancelled"');
  });

  it("createTemplateSchema requires name and content", () => {
    const idx = SRC.indexOf("const createTemplateSchema");
    const section = SRC.slice(idx, idx + 600);
    expect(section).toContain("name: z.string().min(1)");
    expect(section).toContain("content: z.string().min(1)");
  });

  it("patchDocumentSchema allows nullable folderId", () => {
    const idx = SRC.indexOf("const patchDocumentSchema");
    const section = SRC.slice(idx, idx + 500);
    expect(section).toContain("folderId: z.coerce.number().nullable().optional()");
  });

  it("POST / validates with safeParse and throws Arabic ValidationError on empty title", () => {
    const idx = SRC.indexOf('router.post("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("createDocumentSchema.safeParse(req.body)");
    expect(section).toContain("ValidationError");
    expect(section).toContain("عنوان المستند مطلوب");
  });

  it("POST /upload validates entity link types against allowlist", () => {
    const idx = SRC.indexOf('router.post("/upload"');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain("ALLOWED_ENTITY_TYPES");
    expect(section).toContain('"employee"');
    expect(section).toContain('"client"');
    expect(section).toContain('"project"');
    expect(section).toContain('"invoice"');
    expect(section).toContain('"vehicle"');
  });

  it("POST /folders validates name and parentId existence", () => {
    const idx = SRC.indexOf('router.post("/folders"');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("اسم المجلد مطلوب");
    expect(section).toContain("المجلد الأب رقم");
    expect(section).toContain("document_folders");
  });

  it("PUT /templates/:id rejects invalid id (NaN or <= 0)", () => {
    const idx = SRC.indexOf('router.put("/templates/:id"');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("isNaN(id)");
    expect(section).toContain("id <= 0");
    expect(section).toContain("معرف القالب غير صالح");
  });

  it("PATCH /:id throws when no fields provided", () => {
    const idx = SRC.indexOf('router.patch("/:id",');
    const section = SRC.slice(idx, idx + 4000);
    expect(section).toContain("sets.length === 0");
    expect(section).toContain("لا توجد بيانات للتحديث");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SOFT DELETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — soft delete", () => {
  it("DELETE /:id uses UPDATE SET deletedAt = NOW() with idempotent guard", () => {
    const idx = SRC.indexOf('router.delete("/:id",');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain('UPDATE documents SET "deletedAt" = NOW()');
    expect(section).toContain('"deletedAt" IS NULL');
    expect(section).not.toContain("DELETE FROM documents");
  });

  it("DELETE /templates/:id soft-deletes templates", () => {
    const idx = SRC.indexOf('router.delete("/templates/:id"');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain('UPDATE document_templates SET "deletedAt" = NOW()');
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("list and detail queries exclude soft-deleted rows", () => {
    // GET /
    const listIdx = SRC.indexOf('router.get("/",');
    expect(SRC.slice(listIdx, listIdx + 3500)).toContain('"deletedAt" IS NULL');

    // GET /:id
    const detIdx = SRC.indexOf('router.get("/:id",');
    expect(SRC.slice(detIdx, detIdx + 3000)).toContain('"deletedAt" IS NULL');

    // GET /templates
    const tplIdx = SRC.indexOf('router.get("/templates",');
    expect(SRC.slice(tplIdx, tplIdx + 3000)).toContain('"deletedAt" IS NULL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PAGINATION / LISTING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — pagination and listing", () => {
  it("GET / returns { data, total, page, pageSize } envelope", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("data:");
    expect(section).toContain("total:");
    expect(section).toContain("page:");
    expect(section).toContain("pageSize:");
  });

  it("GET / supports category and status query filters", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("AND category=$");
    expect(section).toContain("AND status=$");
  });

  it("GET / supports entity+entityId filter via JOIN on document_entity_links", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("entity && entityId");
    expect(section).toContain("document_entity_links");
  });

  it("GET / orders by createdAt DESC", () => {
    const idx = SRC.indexOf('router.get("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain('"createdAt" DESC');
  });

  it("GET /folders returns paginated envelope and orders by name", () => {
    const idx = SRC.indexOf('router.get("/folders"');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain("data:");
    expect(section).toContain("total:");
    expect(section).toContain("ORDER BY name");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. AUDIT LOGGING & EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Documents — audit logging and events", () => {
  it("POST / emits documents.document.created event with audit log", () => {
    const idx = SRC.indexOf('router.post("/",');
    const section = SRC.slice(idx, idx + 3500);
    expect(section).toContain("createAuditLog");
    expect(section).toContain("emitEvent");
    expect(section).toContain("documents.document.created");
  });

  it("POST /upload emits documents.document.uploaded event", () => {
    const idx = SRC.indexOf('router.post("/upload"');
    const section = SRC.slice(idx, idx + 4500);
    expect(section).toContain("documents.document.uploaded");
  });

  it("PATCH /:id/status emits status_changed with before/after and CATEGORY_EFFECTS", () => {
    const idx = SRC.indexOf('router.patch("/:id/status"');
    const section = SRC.slice(idx, idx + 5000);
    expect(section).toContain("documents.document.status_changed");
    expect(section).toContain("before:");
    expect(section).toContain("after:");
    expect(section).toContain("beforeDoc.status");
    expect(section).toContain("CATEGORY_EFFECTS");
  });

  it("CATEGORY_EFFECTS covers contracts, financial, official, hr, legal", () => {
    const idx = SRC.indexOf("CATEGORY_EFFECTS");
    const section = SRC.slice(idx, idx + 500);
    expect(section).toContain("contracts");
    expect(section).toContain("financial");
    expect(section).toContain("official");
    expect(section).toContain("hr");
    expect(section).toContain("legal");
  });

  it("DELETE /:id emits documents.document.deleted event", () => {
    const idx = SRC.indexOf('router.delete("/:id",');
    const section = SRC.slice(idx, idx + 3000);
    expect(section).toContain("createAuditLog");
    expect(section).toContain("documents.document.deleted");
  });

  it("template, folder, entity-link, and version events are all emitted", () => {
    expect(SRC).toContain("documents.template.created");
    expect(SRC).toContain("documents.template.updated");
    expect(SRC).toContain("documents.template.deleted");
    expect(SRC).toContain("documents.template.generated");
    expect(SRC).toContain("documents.folder.created");
    expect(SRC).toContain("documents.entity_link.created");
    expect(SRC).toContain("documents.version.created");
  });
});
