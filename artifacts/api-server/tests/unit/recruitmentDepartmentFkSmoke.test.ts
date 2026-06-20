/**
 * توحيد القسم في الإعلانات الوظيفية — ربط job_postings بجدول departments عبر
 * departmentId (مفتاح أجنبي) دون كسر القراءات القائمة على الاسم.
 *
 * يثبّت:
 *   • الهجرة 394 تضيف departmentId كـ FK إلى departments بشكل idempotent،
 *     وتعبّئ الصفوف القائمة بمطابقة الاسم ضمن نفس الشركة (backfill)، ولها rollback.
 *   • مسار recruitment يقبل الاسم أو المعرّف ويوفّق بينهما (resolveDepartment)،
 *     ويخزّن العمودين معًا في الإنشاء والتعديل (المعرّف للعلاقة، الاسم للعرض).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const MIGRATION = read("artifacts/api-server/src/migrations/394_job_postings_department_fk.sql");
const ROUTE = read("artifacts/api-server/src/routes/recruitment.ts");

describe("migration 394 — job_postings.departmentId FK", () => {
  it("adds an idempotent departmentId FK referencing departments(id)", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "departmentId" INTEGER REFERENCES departments\(id\)/);
  });
  it("backfills existing rows by matching department name within the same company", () => {
    expect(MIGRATION).toMatch(/UPDATE job_postings/);
    expect(MIGRATION).toMatch(/d\.name = jp\.department/);
    expect(MIGRATION).toMatch(/d\."companyId" = jp\."companyId"/);
    // best-effort: only fill rows that don't already have a FK
    expect(MIGRATION).toMatch(/jp\."departmentId" IS NULL/);
  });
  it("is reversible (rollback drops the column)", () => {
    expect(MIGRATION).toMatch(/@rollback:.*DROP COLUMN IF EXISTS "departmentId"/);
  });
});

describe("recruitment route — department name/id are kept consistent", () => {
  it("accepts an optional departmentId on create + update", () => {
    expect(ROUTE).toMatch(/departmentId: z\.coerce\.number\(\)\.int\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("resolves the name<->id pair bidirectionally within company scope", () => {
    expect(ROUTE).toMatch(/async function resolveDepartment/);
    // id provided -> derive name; name only -> derive id
    expect(ROUTE).toMatch(/SELECT name FROM departments WHERE id=\$1 AND "companyId"=\$2/);
    expect(ROUTE).toMatch(/SELECT id FROM departments WHERE name=\$1 AND "companyId"=\$2/);
  });
  it("persists both the FK and the denormalized name on insert", () => {
    expect(ROUTE).toMatch(/INSERT INTO job_postings \(title, department, "departmentId"/);
    expect(ROUTE).toMatch(/resolveDepartment\(scope\.companyId, departmentId, department\)/);
  });
  it("updates both columns together when the department changes", () => {
    expect(ROUTE).toMatch(/b\.department !== undefined \|\| b\.departmentId !== undefined/);
    expect(ROUTE).toMatch(/sets\.push\(`"departmentId"=\$\$\{params\.length\}`\)/);
  });
});
