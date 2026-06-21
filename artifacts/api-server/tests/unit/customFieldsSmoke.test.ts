import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * #2719 — الحقول المخصّصة لكل شركة (الأساس). اختبار ثابت — لا DB.
 * يؤكّد: هجرة 394 (تعريفات + قيم EAV)، تعريفات CRUD + قيم get/put على
 * customFields.ts بصلاحية settings (إدارة المخطط = action "update"، إذ لا تدعم
 * settings الإنشاء/الحذف) + حصر companyId في كل SQL + upsert + تجاهل المفاتيح
 * غير المعرّفة، والتسجيل في routes/index.ts.
 */
const API_SRC = join(import.meta.dirname!, "../../src");
const CF = readFileSync(join(API_SRC, "routes/customFields.ts"), "utf8");
const INDEX = readFileSync(join(API_SRC, "routes/index.ts"), "utf8");

describe("custom fields — migration 394", () => {
  it("creates definitions + values (EAV) tables, idempotent + scoped + rollback", () => {
    const p = join(API_SRC, "migrations/401_custom_fields.sql");
    expect(existsSync(p)).toBe(true);
    const sql = readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS custom_field_definitions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS custom_field_values/);
    expect(sql).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_cfd_company_entity_key/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_cfv_field_entity/);
    expect(sql).toMatch(/@rollback: DROP TABLE IF EXISTS custom_field_values; DROP TABLE IF EXISTS custom_field_definitions;/);
  });
});

describe("custom fields — definitions CRUD (settings RBAC)", () => {
  it("guards every route under the settings feature with the right action", () => {
    // settings تدعم القراءة + "update" فقط — إدارة مخطط الحقول (إنشاء/حذف تعريف)
    // تُمثَّل كـ "update" على الإعدادات (لا توسعة RBAC). يبقى التدقيق دلاليًّا
    // create/delete عبر auditFromRequest.
    expect(CF).toMatch(/\.get\("\/definitions",\s*authorize\(\{ feature: "settings", action: "list" \}\)/);
    expect(CF).toMatch(/\.post\("\/definitions",\s*authorize\(\{ feature: "settings", action: "update" \}\)/);
    expect(CF).toMatch(/\.patch\("\/definitions\/:id",\s*authorize\(\{ feature: "settings", action: "update" \}\)/);
    expect(CF).toMatch(/\.delete\("\/definitions\/:id",\s*authorize\(\{ feature: "settings", action: "update" \}\)/);
  });
  it("enforces unique fieldKey per (company, entityType) + select needs options + Audit", () => {
    expect(CF).toMatch(/SELECT id FROM custom_field_definitions WHERE "companyId"=\$1 AND "entityType"=\$2 AND "fieldKey"=\$3 AND "deletedAt" IS NULL/);
    expect(CF).toMatch(/fieldType === "select" && \(!b\.options \|\| b\.options\.length === 0\)/);
    expect(CF).toMatch(/auditFromRequest\(req, "create", "custom_field_definitions"/);
    // F4: PATCH must re-validate select-needs-options against the effective (merged) value.
    expect(CF).toMatch(/const effType = b\.fieldType \?\? cur\.fieldType/);
    expect(CF).toMatch(/effType === "select" && effOptions\.length === 0/);
  });
});

describe("custom fields — values (EAV upsert)", () => {
  it("merges defs+values for an entity and upserts on the unique key", () => {
    expect(CF).toMatch(/\.get\("\/values",\s*authorize\(\{ feature: "settings", action: "view" \}\)/);
    expect(CF).toMatch(/\.put\("\/values",\s*authorize\(\{ feature: "settings", action: "update" \}\)/);
    expect(CF).toMatch(/LEFT JOIN custom_field_values v/);
    expect(CF).toMatch(/ON CONFLICT \("fieldId","entityType","entityId"\) DO UPDATE SET value = EXCLUDED\.value/);
  });
  it("ignores unknown/foreign field keys (no injection of undefined fields)", () => {
    expect(CF).toMatch(/if \(!validIds\.has\(fieldId\)\) continue;/);
  });
});

describe("custom fields — wired into the router", () => {
  it("is registered under /custom-fields with settings module + level gate", () => {
    expect(INDEX).toMatch(/import \{ customFieldsRouter \} from "\.\/customFields\.js";/);
    expect(INDEX).toMatch(/router\.use\("\/custom-fields", requireModule\("settings"\), requireMinLevel\(50\), customFieldsRouter\)/);
  });
});
