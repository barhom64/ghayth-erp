/**
 * حدّ معماري (#2839) — الاستكمال الذاتي يُطبَّق عبر عقد HR لا كتابة مباشرة.
 *
 * مسار البيانات العامة (publicData، خادم بواجهة عامة) كان يحدّث جدول employees
 * (مملوك HR) مباشرةً عند استقبال نموذج الاستكمال الذاتي. الكتابة في جدول HR
 * تبقى مملوكة للمسار القائد (مواد 4–9).
 *
 * الإصلاح: نقلها إلى عقد hr.applySelfOnboardingSubmission (employees.ts) تستدعيه
 * publicData — سلوكيًا مطابق (نفس حقول الـstaging + RETURNING name).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PUBLIC = read("artifacts/api-server/src/routes/publicData.ts");
const EMPLOYEES = read("artifacts/api-server/src/routes/employees.ts");

describe("#2839 — الاستكمال الذاتي عبر عقد HR", () => {
  it("publicData لا يحدّث employees مباشرة", () => {
    expect(PUBLIC).not.toMatch(/UPDATE\s+employees\s*\n?\s*SET/i);
  });
  it("publicData يستدعي عقد HR للاستكمال الذاتي", () => {
    expect(PUBLIC).toMatch(/applySelfOnboardingSubmission/);
  });
  it("عقد HR موجود ويملك كتابة employees (حقول staging فقط)", () => {
    expect(EMPLOYEES).toMatch(/export async function applySelfOnboardingSubmission/);
    expect(EMPLOYEES).toMatch(/UPDATE employees[\s\S]{0,120}"activationStatus" = 'self_submitted'/);
  });
});
