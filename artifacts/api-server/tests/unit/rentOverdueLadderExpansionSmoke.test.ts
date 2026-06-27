/**
 * Spec ملف 05 §إيجار متأخر السداسي (السطر 59):
 *   «إيجار 3000 ريال استحقاق 1 مارس: يوم 1 SMS → يوم 5 غرامة 2% = 60
 *    → يوم 14 مهمة متابعة ميدانية → يوم 21 إنذار رسمي →
 *    يوم 30 تصعيد GM والقانونية → يوم 60 إخلاء»
 *
 * Slice 4 of 9. Scope: full ladder expansion AFTER slice 3 (day-1) landed.
 * This slice closes the remaining gaps:
 *   - day 5 (penalty_applied moves from day 60 → day 5 per spec, with
 *     tenant notification)
 *   - day 14 (field_visit with tenant notification)
 *   - day 21 (formal_notice — NEW phase 7)
 *   - day 30 (escalation now explicitly emails GM + legal_manager)
 *   - day 60 (eviction — NEW phase 8, replaces penalty_applied which moved
 *     to day 5; only NOTIFIES, doesn't auto-create a legal case)
 *   - day 90 (legal_transfer unchanged — last-resort case creation)
 *
 * This test pins:
 *   1. Migration 424 seeds 5 new templates as global defaults (companyId IS NULL).
 *   2. The lateDays branching uses the new spec-correct thresholds.
 *   3. Each new stage dispatches via the right templateKey + tenant-facing
 *      channels (NO in_app fan-out — slice-1 Codex lesson).
 *   4. Day-30 escalation emails BOTH GM (director) and legal responsible.
 *   5. Day-60 eviction does NOT auto-create a legal_case (that's day-90's job).
 *   6. The original phases (alert/notification/legal_transfer) are preserved.
 *   7. The SELECT picks up branchId for director/CFO lookup.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "424_seed_rent_overdue_ladder_templates.sql"),
  "utf8",
);

function section(marker: string, len = 24000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Rent overdue ladder expansion (day 5/14/21/30/60) — spec ملف 05", () => {
  const cron = section("async function monthlyRentPenalties");

  it("migration 424 seeds 5 new templates (day5/14/21/30/60) as GLOBAL defaults", () => {
    const keys = [
      "property.rent.overdue.day5",
      "property.rent.overdue.day14",
      "property.rent.overdue.day21",
      "property.rent.overdue.day30",
      "property.rent.overdue.day60",
    ];
    for (const key of keys) {
      const count = MIG.split(`'${key}'`).length - 1;
      expect(count, `template ${key} must appear ≥2× (ar+en) in 424`).toBeGreaterThanOrEqual(2);
    }
    // Idempotent + global (companyId IS NULL) — same pattern as 423.
    expect(MIG).toContain("WHERE NOT EXISTS");
    expect(MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(MIG).toContain('nt."companyId" IS NULL');
  });

  it("day-5 template includes the {{lateFee}} placeholder (the 2% fee amount)", () => {
    // The cron passes lateFee separately from amount; the template body
    // must show the fee distinctly so the tenant sees what was added.
    expect(MIG).toContain("{{lateFee}}");
    const day5Block = MIG.slice(MIG.indexOf("'property.rent.overdue.day5'"));
    expect(day5Block.slice(0, 4000)).toMatch(/"lateFee"/);
  });

  it("day-30 internal template addresses {{managerName}} (GM + legal each get a copy)", () => {
    // Anchor to the VALUES row (channel = email) — the @rollback comment
    // at the top has the bare key too, which would mismatch.
    const day30 = MIG.slice(MIG.indexOf("('property.rent.overdue.day30', 'email'"));
    expect(day30.slice(0, 4000)).toContain("{{managerName}}");
    // Internal escalation = email channel only (no SMS/WhatsApp to managers,
    // no in_app fan-out). Slice-1 Codex P2 lesson.
    expect(day30.slice(0, 4000)).toMatch(/'email'/);
    expect(day30.slice(0, 4000)).not.toMatch(/'in_app'/);
  });

  it("the lateDays ladder uses the spec-correct day thresholds", () => {
    // Day 5 = penalty_applied (moved from day 60).
    expect(cron).toMatch(/lateDays\s*>=\s*5\s*\).*penalty_applied.*targetPhase\s*=\s*5/s);
    // Day 21 = formal_notice (NEW phase 7).
    expect(cron).toMatch(/lateDays\s*>=\s*21\s*\).*formal_notice.*targetPhase\s*=\s*7/s);
    // Day 60 = eviction (NEW phase 8, replaces penalty_applied at day 60).
    expect(cron).toMatch(/lateDays\s*>=\s*60\s*\).*eviction.*targetPhase\s*=\s*8/s);
    // Day 90 = legal_transfer (UNCHANGED).
    expect(cron).toMatch(/lateDays\s*>=\s*90\s*\).*legal_transfer.*targetPhase\s*=\s*6/s);
  });

  it("day-5 penalty_applied dispatches tenant notification with the {{lateFee}} var", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day5"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day5"');
    const block = cron.slice(cron.indexOf('property.rent.overdue.day5'));
    // The cron computed `newTotal = amount + lateFee` and passes BOTH vars
    // so the tenant sees the fee and the new total separately.
    expect(block.slice(0, 4000)).toContain("lateFee:");
    expect(block.slice(0, 4000)).toContain("newTotal");
    // Channels: sms+whatsapp+email — explicit tenant-facing, NO in_app.
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("sms"\)/);
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("whatsapp"\)/);
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("email"\)/);
  });

  it("day-14 field_visit dispatches tenant notification (sms+email, no WhatsApp by spec choice)", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day14"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day14"');
    const block = cron.slice(cron.indexOf('property.rent.overdue.day14'));
    expect(block.slice(0, 4000)).toContain("lateDays:");
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("sms"\)/);
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("email"\)/);
  });

  it("day-21 formal_notice dispatches via ALL tenant channels (legal-grade notice)", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day21"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day21"');
    const block = cron.slice(cron.indexOf('property.rent.overdue.day21'));
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("sms"\)/);
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("whatsapp"\)/);
    expect(block.slice(0, 4000)).toMatch(/tenantChannels\.push\("email"\)/);
  });

  it("day-30 escalation emails GM + legal_manager EACH (explicit assignmentId, email only)", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day30"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day30"');
    // Lookups for GM (director) + legal responsible.
    expect(cron).toContain("getDirectorAssignmentId(");
    expect(cron).toContain("getLegalResponsible(");
    const block = cron.slice(cron.indexOf('property.rent.overdue.day30'));
    // Internal = email only, NO sms/whatsapp/in_app for managers.
    expect(block.slice(0, 4000)).toContain('channels: ["email" as const]');
    // managerName var must be populated per-recipient.
    expect(block.slice(0, 4000)).toContain("managerName:");
    // The assignmentId path (not recipientEmail) so the dispatch resolves
    // the manager's email via the assignment, not via tenant contact.
    expect(block.slice(0, 4000)).toMatch(/assignmentId: target\.assignmentId/);
  });

  it("day-60 eviction dispatches tenant notification but does NOT auto-create a legal_case", () => {
    expect(cron).toContain('templateKey: "property.rent.overdue.day60"');
    expect(cron).toContain('eventCategory: "property.rent.overdue.day60"');
    // Isolate ONLY the eviction branch — bound it BEFORE the legal_transfer
    // branch (which DOES create a case at day 90, which is correct there).
    const startEv = cron.indexOf("targetStage === 'eviction'");
    const startLegal = cron.indexOf("targetStage === 'legal_transfer'");
    const evictionOnly = cron.slice(startEv, startLegal);
    expect(evictionOnly).not.toMatch(/INSERT INTO legal_cases/);
    expect(evictionOnly).not.toMatch(/issueNumber\(\s*\{\s*[^}]*moduleKey:\s*"legal"/);
  });

  it("the SELECT picks up branchId (needed for getDirectorAssignmentId lookup)", () => {
    expect(cron).toContain('c."branchId"');
    // And the day-30 branch reads p.branchId for the GM lookup.
    expect(cron).toContain("Number(p.branchId");
  });

  it("the original phases (alert/notification/legal_transfer) and day-1 reminder are preserved", () => {
    // Day-1 from slice 3 still wired.
    expect(cron).toContain("'tenant_reminder'");
    expect(cron).toMatch(/lateDays\s*>=\s*1\s*\).*tenant_reminder.*targetPhase\s*=\s*0/s);
    // Internal alert + notification unchanged.
    expect(cron).toMatch(/lateDays\s*>=\s*3\s*\).*alert.*targetPhase\s*=\s*1/s);
    expect(cron).toMatch(/lateDays\s*>=\s*7\s*\).*notification.*targetPhase\s*=\s*2/s);
    // legal_transfer at day 90 still creates a case.
    const legalBlock = cron.slice(cron.indexOf("targetStage === 'legal_transfer'"));
    expect(legalBlock.slice(0, 4000)).toContain('INSERT INTO legal_cases');
  });

  it("day-5 penalty_applied still updates rent_payments.amount with the 2% fee (existing pattern, just moved)", () => {
    // Constitution §3 rule 3: any journal_lines write needs an assertion
    // test. The current pattern is a soft-fee bump on rent_payments (not
    // a GL posting), so it's an AR adjustment not a ledger change — safe
    // to keep, just moved from day 60 → day 5 per spec.
    expect(cron).toMatch(/UPDATE rent_payments SET amount\s*=\s*amount\s*\+\s*\$1/);
    // The fee is still computed as 2% of amount.
    expect(cron).toMatch(/Number\(p\.amount\)\s*\*\s*0\.02/);
  });

  it("each new stage records into late_rent_actions with the correct phase number for idempotency", () => {
    // Phases used in 424 expansion: 5 (existed, repurposed timing), 7 (NEW), 8 (NEW).
    // The existing INSERT is shared (uses targetPhase) — verify the
    // branching maps stages to the right phase numbers.
    expect(cron).toContain("targetPhase = 7");
    expect(cron).toContain("targetPhase = 8");
    // The shared INSERT is still in place and uses targetPhase.
    expect(cron).toMatch(/INSERT INTO late_rent_actions[\s\S]{0,400}targetPhase/);
  });
});
