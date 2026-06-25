/**
 * حدّ معماري (#2839) — finance-hardening لا ينشئ مشروعًا بكتابة مباشرة.
 *
 * مسار المالية (finance-hardening) كان يكتب جدول projects (مملوك المشاريع)
 * مباشرةً عند إنشاء مشروع من شاشته — كتابة عابرة لحدود المسار (مواد 4–9).
 *
 * الإصلاح: نقل الإدراج إلى عقد projects.insertProjectRecord تستدعيه المالية
 * ضمن نفس المعاملة — سلوكيًا مطابق (نفس الأعمدة والقيم).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const HARDENING = read("artifacts/api-server/src/routes/finance-hardening.ts");
const PROJECTS = read("artifacts/api-server/src/routes/projects.ts");

describe("#2839 — إنشاء المشروع عبر عقد المشاريع", () => {
  it("finance-hardening لا يكتب projects مباشرة", () => {
    expect(HARDENING).not.toMatch(/INSERT\s+INTO\s+projects\b/i);
  });
  it("finance-hardening يستدعي عقد المشاريع", () => {
    expect(HARDENING).toMatch(/insertProjectRecord/);
  });
  it("عقد المشاريع موجود ويملك كتابة projects", () => {
    expect(PROJECTS).toMatch(/export async function insertProjectRecord/);
    expect(PROJECTS).toMatch(/INSERT INTO projects \("companyId",ref,name/);
  });
});
