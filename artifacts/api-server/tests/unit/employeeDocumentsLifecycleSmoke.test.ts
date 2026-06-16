/**
 * HR-REV-9 (#2222) — employee documents lifecycle smoke.
 *
 * Completes the employee_documents CRUD: PATCH (edit metadata) + DELETE,
 * plus a derived expiry status (valid / expiring_soon / expired) on the
 * list endpoint so iqama/passport renewals surface without client math.
 * Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

const PATCH_BLOCK =
  SRC.match(
    /router\.patch\("\/employee-documents\/:id"[\s\S]*?^\}\);/m,
  )?.[0] || "";
const DELETE_BLOCK =
  SRC.match(
    /router\.delete\("\/employee-documents\/:id"[\s\S]*?^\}\);/m,
  )?.[0] || "";

describe("HR-REV-9 — derived expiry status on list", () => {
  it("GET /employee-documents computes daysToExpiry + computedStatus", () => {
    expect(SRC).toMatch(/\(ed\."expiryDate" - CURRENT_DATE\) AS "daysToExpiry"/);
    expect(SRC).toMatch(/CURRENT_DATE \+ INTERVAL '30 days' THEN 'expiring_soon'/);
    expect(SRC).toMatch(/ed\."expiryDate" < CURRENT_DATE THEN 'expired'/);
    expect(SRC).toMatch(/END AS "computedStatus"/);
  });
});

describe("HR-REV-9 — PATCH /employee-documents/:id", () => {
  it("is registered and gated on hr.employees:update", () => {
    expect(SRC).toMatch(
      /router\.patch\("\/employee-documents\/:id", authorize\(\{ feature: "hr\.employees", action: "update" \}\)/,
    );
  });
  it("404s when the document does not exist", () => {
    expect(PATCH_BLOCK).toMatch(/throw new NotFoundError\("وثيقة الموظف غير موجودة"\)/);
  });
  it("rejects an empty patch with a ValidationError", () => {
    expect(PATCH_BLOCK).toMatch(/sets\.length === 0/);
    expect(PATCH_BLOCK).toMatch(/throw new ValidationError\("لا توجد حقول للتحديث"\)/);
  });
  it("is a partial update (does not touch employeeId)", () => {
    expect(PATCH_BLOCK).toMatch(/employeeDocumentSchema\.partial\(\)\.safeParse/);
    expect(PATCH_BLOCK).not.toMatch(/"employeeId"=\$/);
  });
  it("audits the update", () => {
    expect(PATCH_BLOCK).toMatch(/action: "update", entity: "employee_documents"/);
  });
});

describe("HR-REV-9 — DELETE /employee-documents/:id", () => {
  it("is registered and gated on hr.employees:delete", () => {
    expect(SRC).toMatch(
      /router\.delete\("\/employee-documents\/:id", authorize\(\{ feature: "hr\.employees", action: "delete" \}\)/,
    );
  });
  it("hard-deletes (no representable soft-delete state) and audits it", () => {
    expect(DELETE_BLOCK).toMatch(/DELETE FROM employee_documents WHERE id=\$1 AND "companyId"=\$2/);
    expect(DELETE_BLOCK).toMatch(/action: "delete", entity: "employee_documents"/);
  });
  it("404s when the document does not exist", () => {
    expect(DELETE_BLOCK).toMatch(/throw new NotFoundError\("وثيقة الموظف غير موجودة"\)/);
  });
});
