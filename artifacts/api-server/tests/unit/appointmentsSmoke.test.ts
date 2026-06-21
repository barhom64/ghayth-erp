import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * #2704 — المواعيد + دعوة .ics (P2). اختبار ثابت (يقرأ المصدر) — لا DB.
 * يؤكّد: الهجرة 393 (جدول appointments)، مسارات CRUD + استرجاع + .ics على
 * calendar.ts بصلاحية calendar.my + حصر companyId في كل عبارة SQL
 * (الجدول حديث، خارج لقطة المخطّط بعد — كنمط employee_tracking_policies)،
 * وتدقيق عبر auditFromRequest، ودمجها في /upcoming.
 */
const API_SRC = join(import.meta.dirname!, "../../src");
const CALENDAR = readFileSync(join(API_SRC, "routes/calendar.ts"), "utf8");

describe("appointments — migration 393", () => {
  it("creates the appointments table (idempotent, companyId-scoped, soft-delete)", () => {
    const p = join(API_SRC, "migrations/405_appointments.sql");
    expect(existsSync(p)).toBe(true);
    const sql = readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS appointments/);
    expect(sql).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"startsAt"\s+TIMESTAMPTZ NOT NULL/);
    expect(sql).toMatch(/"deletedAt"\s+TIMESTAMPTZ/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_appointments_company_start/);
  });
});

describe("appointments — CRUD + restore + ics routes (calendar.ts)", () => {
  it("all routes guard the calendar.my feature with the right actions", () => {
    expect(CALENDAR).toMatch(/calendarRouter\.get\("\/appointments",\s*authorize\(\{ feature: "calendar\.my", action: "list" \}\)/);
    expect(CALENDAR).toMatch(/calendarRouter\.post\("\/appointments",\s*authorize\(\{ feature: "calendar\.my", action: "create" \}\)/);
    expect(CALENDAR).toMatch(/calendarRouter\.patch\("\/appointments\/:id",\s*authorize\(\{ feature: "calendar\.my", action: "update" \}\)/);
    expect(CALENDAR).toMatch(/calendarRouter\.delete\("\/appointments\/:id",\s*authorize\(\{ feature: "calendar\.my", action: "delete" \}\)/);
    expect(CALENDAR).toMatch(/calendarRouter\.post\("\/appointments\/:id\/restore",\s*authorize\(\{ feature: "calendar\.my", action: "update" \}\)/);
    expect(CALENDAR).toMatch(/calendarRouter\.get\("\/appointments\/:id\/ics",\s*authorize\(\{ feature: "calendar\.my", action: "view" \}\)/);
  });

  it("writes are company-scoped + carry Audit/Event", () => {
    expect(CALENDAR).toMatch(/INSERT INTO appointments/);
    expect(CALENDAR).toMatch(/auditFromRequest\(req, "create", "appointments"/);
    expect(CALENDAR).toMatch(/action: "appointment\.created"/);
    expect(CALENDAR).toMatch(/UPDATE appointments SET "deletedAt" = NOW\(\) WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
    expect(CALENDAR).toMatch(/UPDATE appointments SET "deletedAt" = NULL WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NOT NULL/);
    expect(CALENDAR).toMatch(/action: "appointment\.restored"/);
  });

  it("PATCH re-validates start/end ordering against the effective (merged) values (F1)", () => {
    // POST validates endsAt >= startsAt; PATCH must too, or a partial update can
    // set startsAt after endsAt. PATCH loads current values and checks the merged pair.
    expect(CALENDAR).toMatch(/const effStart = b\.startsAt \?\? cur\.startsAt/);
    expect(CALENDAR).toMatch(/const effEnd = b\.endsAt \?\? cur\.endsAt/);
    // both POST and PATCH now carry the inverted-ordering guard
    expect((CALENDAR.match(/\)\.getTime\(\) < new Date\([^)]*\)\.getTime\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("emits a valid iCalendar (.ics) document with escaped fields", () => {
    expect(CALENDAR).toMatch(/BEGIN:VCALENDAR/);
    expect(CALENDAR).toMatch(/BEGIN:VEVENT/);
    expect(CALENDAR).toMatch(/text\/calendar; charset=utf-8/);
    expect(CALENDAR).toMatch(/function icsEscape/);
  });

  it("list trash view uses two literal predicates (no SQL interpolation)", () => {
    expect(CALENDAR).toMatch(/showDeleted\s*\n?\s*\?\s*`"companyId" = \$1 AND "deletedAt" IS NOT NULL`\s*:\s*`"companyId" = \$1 AND "deletedAt" IS NULL`/);
  });
});

describe("appointments — integrated into the unified /upcoming feed", () => {
  it("queries scheduled appointments in the window and pushes them as events", () => {
    expect(CALENDAR).toMatch(/FROM appointments\s+WHERE "companyId" = \$1 AND "deletedAt" IS NULL AND status = 'scheduled'/);
    expect(CALENDAR).toMatch(/category: "appointment"/);
    expect(CALENDAR).toMatch(/appointments: appointments\.length/);
  });
});
