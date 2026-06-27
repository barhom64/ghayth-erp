/**
 * Spec ملف 05 §إيجار متأخر السداسي (السطر 59):
 *   «إيجار 3000 ريال استحقاق 1 مارس: يوم 1 SMS → يوم 5 غرامة 2% = 60
 *    → يوم 14 مهمة متابعة ميدانية → يوم 21 إنذار رسمي →
 *    يوم 30 تصعيد GM والقانونية → يوم 60 إخلاء»
 *
 * Slice 3 of 9. Scope: tenant-facing day-1 SMS reminder ONLY.
 * The other tiers (day-5 fee, day-14 field visit, day-21 notice,
 * day-30 GM/legal escalation, day-60 eviction) are reshuffled into
 * slice 4 because:
 *   - day-5 fee = a ledger entry → needs GL assertion test
 *     (ghayth-constitution §3 rule 3)
 *   - day-21 notice is missing entirely from the existing cron
 *   - day-30/60 dates conflict with the existing
 *     monthlyRentPenalties ladder (day-60 currently does fee, not
 *     eviction; day-90 currently does legal_transfer, not day-60).
 *
 * This test pins:
 *   1. Migration 420 seeds property.rent.overdue.day1 in sms + email +
 *      whatsapp (ar + en for each).
 *   2. The cron picks up tenantPhone, tenantEmail, and a usable
 *      unitName (CONCAT building + unitNumber, with a fallback to
 *      #unitId so the message is never empty).
 *   3. A new phase 0 ("tenant_reminder") fires on day 1, BEFORE the
 *      existing 'alert' phase (which starts at day 3).
 *   4. dispatchNotification is called with EXPLICIT tenant-facing
 *      channels (sms/email/whatsapp). NO in_app — that would fan out
 *      to all employees (the Codex P2 lesson from slice 1).
 *   5. The dispatch + the late_rent_actions log are idempotent (one
 *      reminder per payment, not one per cron run).
 *   6. Tenants with no contact details are skipped without erroring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "423_seed_rent_overdue_day1_template.sql"),
  "utf8",
);

function section(marker: string, len = 12000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Rent overdue → tenant SMS reminder on day 1 (spec ملف 05)", () => {
  const cron = section("async function monthlyRentPenalties");

  it("migration 423 seeds property.rent.overdue.day1 in sms + email + whatsapp (ar + en)", () => {
    // 3 channels × 2 languages = 6 INSERT tuples.
    const count = MIG.split("'property.rent.overdue.day1'").length - 1;
    expect(count).toBeGreaterThanOrEqual(6);
    expect(MIG).toContain("WHERE NOT EXISTS"); // idempotent
  });

  it("migration 423 seeds as GLOBAL default (companyId IS NULL) so future companies inherit it", () => {
    // Codex P2: per-existing-company seeding would leave companies created
    // by bootstrapCompany (settings.ts:897) with blank rent reminders.
    // Global row is matched by getTemplate's
    // (companyId = $1 OR companyId IS NULL) fallback.
    expect(MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(MIG).toContain('nt."companyId" IS NULL');
    expect(MIG).not.toMatch(/FROM companies c\s+CROSS JOIN/);
  });

  it("SELECT picks up the tenant contact details + a usable unit name (with fallback)", () => {
    // Tenant contact resolution coalesces from the contract first
    // (denormalized for offline contracts), then from the linked tenants
    // row (the normalized source of truth — Codex P2: contract fields are
    // optional and frequently blank, but tenants.phone/email are typically
    // populated).
    expect(cron).toMatch(/COALESCE\(NULLIF\(c\."tenantPhone", ''\), t\.phone\)/);
    expect(cron).toMatch(/COALESCE\(NULLIF\(c\."tenantEmail", ''\), t\.email\)/);
    expect(cron).toMatch(/COALESCE\(NULLIF\(c\."tenantName", ''\), t\.name\)/);
    expect(cron).toMatch(/LEFT JOIN tenants t ON t\.id = c\."tenantId"/);
    // Unit name fallback chain: "Building - #Unit" else "#unitId" — never empty.
    expect(cron).toContain('"unitName"');
    expect(cron).toContain("CONCAT_WS");
  });

  it("a new day-1 phase ('tenant_reminder', phase 0) exists and is FIRST in the ladder", () => {
    expect(cron).toContain("'tenant_reminder'");
    expect(cron).toMatch(/lateDays\s*>=\s*1.*tenant_reminder.*targetPhase\s*=\s*0/s);
  });

  it("day-1 dispatch uses the tenant-facing channels EXPLICITLY (no in_app fan-out)", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day1"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day1"');
    // Channels are populated from tenant contact: sms + whatsapp from phone,
    // email from email. NO in_app — slice 1 Codex lesson.
    expect(cron).toMatch(/tenantChannels\.push\("sms"\)/);
    expect(cron).toMatch(/tenantChannels\.push\("whatsapp"\)/);
    expect(cron).toMatch(/tenantChannels\.push\("email"\)/);
    expect(cron).toContain("channels: tenantChannels");
  });

  it("templateVars match the seeded placeholders EXACTLY (interpolateTemplate is strict)", () => {
    const dispatch = cron.slice(cron.indexOf('templateKey: "property.rent.overdue.day1"'));
    expect(dispatch).toContain("tenantName:");
    expect(dispatch).toContain("unitName:");
    expect(dispatch).toContain("dueDate:");
    expect(dispatch).toContain("amount:");
  });

  it("idempotency — the late_rent_actions guard still fires before phase 0 (one reminder per payment)", () => {
    // The existing existing-check uses paymentId + phase. Phase 0 must
    // be subject to it too. We check that the dispatch lives INSIDE the
    // existing if-found-skip flow.
    const guard = cron.indexOf('SELECT id FROM late_rent_actions WHERE "paymentId"');
    const dispatch = cron.indexOf('property.rent.overdue.day1');
    expect(guard).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(guard); // dispatch comes after the guard
    // And a row is inserted so it doesn't re-send next day.
    expect(cron).toContain('phase,action,"sentAt",notes');
    expect(cron).toContain("'تذكير المستأجر'");
  });

  it("safely skips tenants without any contact details", () => {
    expect(cron).toContain("!tenantPhone && !tenantEmail");
    expect(cron).toContain("tenant has no contact");
  });

  it("the original escalation ladder (alert/notification/field_visit/escalation/penalty_applied/legal_transfer) is preserved", () => {
    // Slice 3 is PURELY ADDITIVE — slice 4 will reshape this ladder.
    for (const stage of ['alert', 'notification', 'field_visit', 'escalation', 'penalty_applied', 'legal_transfer']) {
      expect(cron).toContain(`'${stage}'`);
    }
  });
});
