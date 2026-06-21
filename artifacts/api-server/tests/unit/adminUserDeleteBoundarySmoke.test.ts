/**
 * حدّ معماري — حذف المستخدم في مسار الإدارة (admin) إجراء «إلغاء وصول» فقط.
 *
 * الدستور (مواد 4–9 استقلال المسارات/القائد-الخادم، مادة 18 منع الحذف الفيزيائي):
 *   • مسار الإدارة خادم لإدارة الحسابات/الصلاحيات؛ لا يملك بيانات الموارد البشرية.
 *   • تكليفات الموظف (employee_assignments) مملوكة لمسار HR القائد، ولا يجوز
 *     لمسار الإدارة حذفها فيزيائيًا عبر حدود المسار كأثر جانبي لإلغاء حساب.
 *
 * هذا الراتشيت يثبّت:
 *   1. مُعالج DELETE /users/:id لا يحتوي أي `DELETE FROM employee_assignments`.
 *   2. يظل يلغي الوصول فعليًا: سحب أدوار RBAC + إبطال جلسات refresh_tokens.
 *   3. يبقى يُصدر الحدث admin.user.deleted كي يتفاعل HR ضمن اختصاصه إن لزم.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ADMIN = readFileSync(resolve(ROOT, "artifacts/api-server/src/routes/admin.ts"), "utf8");

// عزل جسم مُعالج DELETE /users/:id حتى نهايته (router.post التالي).
function deleteUserHandler(src: string): string {
  const start = src.indexOf('router.delete("/users/:id"');
  expect(start).toBeGreaterThan(-1);
  const after = src.indexOf("router.post(", start);
  return src.slice(start, after === -1 ? undefined : after);
}

describe("admin DELETE /users/:id — حدّ معماري (إلغاء وصول لا حذف HR)", () => {
  const handler = deleteUserHandler(ADMIN);

  it("لا يحذف تكليفات الموظف فيزيائيًا (عبر حدود مسار HR)", () => {
    expect(handler).not.toMatch(/DELETE\s+FROM\s+employee_assignments/i);
  });

  it("يبقى يلغي الوصول فعليًا: أدوار RBAC + جلسات refresh", () => {
    expect(handler).toMatch(/DELETE\s+FROM\s+rbac_user_roles/i);
    expect(handler).toMatch(/UPDATE\s+refresh_tokens\s+SET\s+"revokedAt"\s*=\s*NOW\(\)/i);
  });

  it("يُصدر الحدث admin.user.deleted (تفاعل HR عبر ناقل الأحداث)", () => {
    expect(handler).toMatch(/action:\s*"admin\.user\.deleted"/);
  });
});
