import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/entityMeta.ts"),
  "utf8",
);

// Guards the attachment-scoped comment thread (entity_comments."documentId").
describe("entityMeta — attachment-scoped comments", () => {
  it("GET supports an optional documentId filter (parameterized)", () => {
    expect(SRC).toContain("req.query.documentId");
    expect(SRC).toContain('AND "documentId" = $');
  });

  it("POST persists documentId (nullable) into entity_comments", () => {
    expect(SRC).toContain('INSERT INTO entity_comments ("entityType", "entityId", "documentId"');
    expect(SRC).toContain("documentId ?? null");
  });

  it("POST validates the document is linked to this entity + company (integrity)", () => {
    const idx = SRC.indexOf('router.post("/comments');
    const section = SRC.slice(idx, idx + 2000);
    expect(section).toContain("document_entity_links");
    expect(section).toContain('JOIN documents d ON d.id = del."documentId"');
    expect(section).toContain('d."companyId" = $');
    expect(section).toContain("المرفق غير مرتبط بهذا السجل");
  });

  it("comment schema accepts an optional positive documentId", () => {
    expect(SRC).toContain("documentId: z.coerce.number().int().positive().nullable().optional()");
  });
});
