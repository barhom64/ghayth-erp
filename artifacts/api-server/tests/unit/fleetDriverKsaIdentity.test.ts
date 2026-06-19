import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's explicit gap:
//   "حقول رخص السائق غير صحيحة — يجب أن تكون النوع/الفئة/تاريخ
//    الانتهاء + الهوية/الإقامة لا مجرد رقم رخصة."
//   (KSA driver license fields wrong — need type/class/expiry +
//    ID/Iqama, not just a license number.)
//
// Migration 280 adds 5 inline columns (nationalId, iqamaNumber,
// licenseIssueDate, licenseIssuingAuthority, licenseOrigin) to
// fleet_drivers. Backend declares LICENSE_ORIGIN_VALUES enum and
// gates create/update through a Saudi/non-Saudi identity rule.
// SPA drivers-create form gets pickers + required-when-saudi logic.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const MIGRATION = readApi("migrations/280_fleet_driver_ksa_identity.sql");
const FLEET     = readApi("routes/fleet.ts");
const FORM      = readSpa("pages/create/fleet/driver-create-form.tsx");

describe("#1812 — migration 280: KSA driver identity + license origin", () => {
  it("migration file has @rollback header", () => {
    expect(MIGRATION).toContain("@rollback");
  });

  it("adds 5 expected columns to fleet_drivers", () => {
    for (const col of [
      "nationalId", "iqamaNumber",
      "licenseIssueDate", "licenseIssuingAuthority", "licenseOrigin",
    ]) {
      expect(MIGRATION, `column ${col} missing`).toContain(`"${col}"`);
    }
  });

  it("indexes nationalId + iqamaNumber per-company (partial, IMMUTABLE-safe)", () => {
    expect(MIGRATION).toMatch(/idx_fleet_drivers_national_id/);
    expect(MIGRATION).toMatch(/idx_fleet_drivers_iqama/);
    expect(MIGRATION).toMatch(/WHERE "nationalId" IS NOT NULL AND "deletedAt" IS NULL/);
    expect(MIGRATION).toMatch(/WHERE "iqamaNumber" IS NOT NULL AND "deletedAt" IS NULL/);
  });
});

describe("#1812 — backend driver schema (KSA identity)", () => {
  it("LICENSE_ORIGIN_VALUES declares the 4 KSA-canonical sources", () => {
    expect(FLEET).toContain("LICENSE_ORIGIN_VALUES");
    for (const v of ["saudi", "gcc", "international", "temporary"]) {
      expect(FLEET, `origin ${v} missing`).toContain(`"${v}"`);
    }
  });

  it("createDriverSchema validates nationalId + iqamaNumber as 10 digits", () => {
    expect(FLEET).toMatch(/nationalId:\s*z\.string\(\)\.regex\(\/\^\\d\{10\}\$\/,\s*"الهوية الوطنية يجب أن تكون 10 أرقام"\)/);
    expect(FLEET).toMatch(/iqamaNumber:\s*z\.string\(\)\.regex\(\/\^\\d\{10\}\$\/,\s*"رقم الإقامة يجب أن يكون 10 أرقام"\)/);
  });

  it("createDriverSchema gates licenseOrigin through the enum", () => {
    expect(FLEET).toMatch(/licenseOrigin:\s*z\.enum\(LICENSE_ORIGIN_VALUES\)\.optional\(\)/);
  });

  it("refines: saudi → nationalId required; non-saudi → iqamaNumber required", () => {
    expect(FLEET).toMatch(/if \(d\.licenseOrigin === "saudi"\) return !!d\.nationalId/);
    expect(FLEET).toMatch(/return !!d\.iqamaNumber/);
    expect(FLEET).toMatch(/الرخصة سعودية — رقم الهوية الوطنية مطلوب/);
    expect(FLEET).toMatch(/السائق غير سعودي — رقم الإقامة مطلوب/);
  });

  it("updateDriverSchema inherits the same KSA fields", () => {
    // Use a targeted slice search since the schema is split.
    const updateBlock = FLEET.slice(FLEET.indexOf("updateDriverSchema"));
    expect(updateBlock).toContain("nationalId");
    expect(updateBlock).toContain("iqamaNumber");
    expect(updateBlock).toContain("licenseIssueDate");
    expect(updateBlock).toContain("licenseOrigin");
  });

  it("INSERT INTO fleet_drivers writes the 5 new columns", () => {
    for (const col of [
      "\"nationalId\"", "\"iqamaNumber\"",
      "\"licenseIssueDate\"", "\"licenseIssuingAuthority\"", "\"licenseOrigin\"",
    ]) {
      expect(FLEET).toContain(col);
    }
  });

  it("PATCH driver tracks the 5 new columns in trackedFields + colMap", () => {
    const patchBlock = FLEET.slice(FLEET.indexOf("trackedFields"));
    expect(patchBlock).toContain('"nationalId"');
    expect(patchBlock).toContain('"iqamaNumber"');
    expect(patchBlock).toContain('"licenseOrigin"');
  });

  it("/me driver SELECT exposes the new columns to the client", () => {
    const meBlock = FLEET.slice(FLEET.indexOf("Driver self-profile"));
    expect(meBlock).toContain('"licenseClass"');
    expect(meBlock).toContain('"nationalId"');
    expect(meBlock).toContain('"iqamaNumber"');
    expect(meBlock).toContain('"licenseOrigin"');
  });
});

describe("#1812 — drivers-create form (KSA identity + license origin/class)", () => {
  it("initial form includes the 5 new fields", () => {
    expect(FORM).toContain("nationalId");
    expect(FORM).toContain("iqamaNumber");
    expect(FORM).toContain("licenseIssueDate");
    expect(FORM).toContain("licenseIssuingAuthority");
    expect(FORM).toContain("licenseOrigin");
    expect(FORM).toContain("licenseClass");
  });

  it("renders Arabic labels for license origin (4 KSA values)", () => {
    for (const label of ["سعودية", "خليجية", "دولية", "مؤقتة"]) {
      expect(FORM, `origin label ${label} missing`).toContain(label);
    }
  });

  it("renders Arabic labels for license class (KSA traffic-dept alphabet)", () => {
    for (const label of [
      "خاصة", "نقل خفيف", "نقل متوسط", "نقل ثقيل",
      "نقل عام", "دراجة نارية", "معدات ثقيلة",
    ]) {
      expect(FORM, `class label ${label} missing`).toContain(label);
    }
  });

  it("validation enforces Saudi → nationalId, non-Saudi → iqamaNumber", () => {
    expect(FORM).toMatch(/needsNationalId\s*&&\s*!\/\^\\d\{10\}\$\/\.test\(form\.nationalId\)/);
    expect(FORM).toMatch(/needsIqama\s*&&\s*!\/\^\\d\{10\}\$\/\.test\(form\.iqamaNumber\)/);
    expect(FORM).toMatch(/الهوية الوطنية مطلوبة \(10 أرقام\) للرخصة السعودية/);
    expect(FORM).toMatch(/رقم الإقامة مطلوب \(10 أرقام\) للسائق غير السعودي/);
  });

  it("inputs digit-mask the identity fields (paste-safe)", () => {
    expect(FORM).toMatch(/setForm\(\(f\) => \(\{ \.\.\.f, nationalId: v\.replace\(\/\\D\/g, ""\)\.slice\(0, 10\) \}\)\)/);
    expect(FORM).toMatch(/setForm\(\(f\) => \(\{ \.\.\.f, iqamaNumber: v\.replace\(\/\\D\/g, ""\)\.slice\(0, 10\) \}\)\)/);
  });

  it("issuing-authority defaults Arabic placeholder", () => {
    expect(FORM).toContain("الإدارة العامة للمرور");
  });
});
