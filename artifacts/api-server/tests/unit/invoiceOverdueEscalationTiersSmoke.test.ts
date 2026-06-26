/**
 * Spec ملف 03 § تحصيل 6 مراحل (السطر 49-51):
 *   - يوم 21 → تصعيد للمدير المالي (CFO/finance_manager)
 *   - يوم 30 → إشعار GM + حظر العميل + غرامة 2% شهرياً
 *   - يوم 60 → إشعار القسم القانوني + تحديث تصنيف العميل churned
 *
 * Slice 2 of 9 in the system-wide notification activation plan (delegated
 * authority from إبراهيم on blacklist/churn business decisions).
 *
 * This test pins the source-level wiring so a regression can't silently
 * drop a tier:
 *   1. The new templates were seeded (migration 419 references the keys).
 *   2. The cron picks up branchId, isBlacklisted, classification (needed
 *      for routing + idempotency).
 *   3. Each tier (21 / 30 / 60) dispatches the correct notification key
 *      AND triggers the correct DB side-effect (blacklist on 30, churn
 *      on 60), and only when the existing state isn't already that way.
 *   4. Channels are explicitly ["email"] to avoid in_app fan-out
 *      (the Codex P2 lesson from slice 1 — same pattern, internal
 *      audience already covered by the existing broadcastAlert call).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "419_seed_invoice_escalation_templates.sql"),
  "utf8",
);

function section(marker: string, len = 18000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Invoice overdue escalation tiers (21/30/60) — spec ملف 03", () => {
  const cron = section("async function dailyInvoiceOverdueEscalation");

  it("migration 419 seeds the 3 new escalation templates (ar + en for each)", () => {
    const keys = ["invoice.escalation.fm", "invoice.blocked.gm", "invoice.legal_handover"];
    for (const key of keys) {
      // Each key must appear at least twice (ar + en).
      const count = MIG.split(`'${key}'`).length - 1;
      expect(count, `template ${key} must appear ≥2× (ar+en) in 419`).toBeGreaterThanOrEqual(2);
    }
    expect(MIG).toContain("WHERE NOT EXISTS"); // idempotent
  });

  it("SELECT includes the columns needed for routing + idempotency", () => {
    expect(cron).toContain('i."branchId"'); // for getCfoAssignmentId / getDirectorAssignmentId
    expect(cron).toContain('"clientBlacklisted"');
    expect(cron).toContain('"clientClassification"');
  });

  it("day-21 tier escalates to CFO with the right templateKey", () => {
    expect(cron).toMatch(/days\s*===\s*21/);
    expect(cron).toContain('getCfoAssignmentId(');
    expect(cron).toContain('templateKey: "invoice.escalation.fm"');
    expect(cron).toContain('eventCategory: "invoice.escalation.fm"');
  });

  it("day-30 tier blacklists the client (idempotent) AND notifies GM", () => {
    expect(cron).toMatch(/days\s*===\s*30/);
    expect(cron).toContain('getDirectorAssignmentId(');
    expect(cron).toContain('templateKey: "invoice.blocked.gm"');
    // Idempotency: don't UPDATE if already blacklisted.
    expect(cron).toContain('!inv.clientBlacklisted');
    expect(cron).toMatch(/UPDATE clients SET "isBlacklisted"\s*=\s*TRUE/);
  });

  it("day-60 tier flips classification to 'churned' (idempotent) AND notifies legal", () => {
    expect(cron).toMatch(/days\s*===\s*60/);
    expect(cron).toContain('getLegalResponsible(');
    expect(cron).toContain('templateKey: "invoice.legal_handover"');
    // Idempotency: don't UPDATE if already churned.
    expect(cron).toContain("inv.clientClassification !== \"churned\"");
    expect(cron).toMatch(/UPDATE clients SET classification\s*=\s*'churned'/);
  });

  it("all internal escalations use channels=['email'] only (no in_app fan-out — slice-1 Codex lesson)", () => {
    // The escalationBase object is reused by every tier.
    expect(cron).toContain('channels: ["email" as const]');
    // The 3 internal templateKeys must NOT appear with channels:["in_app",...].
    expect(cron).not.toMatch(/templateKey: "invoice\.(escalation\.fm|blocked\.gm|legal_handover)"[\s\S]{0,200}channels:\s*\[[^\]]*"in_app"/);
  });

  it("each tier passes the managerName var the template needs", () => {
    // Each escalation template uses {{managerName}}. The cron must populate it.
    const fmBlock = cron.slice(cron.indexOf('templateKey: "invoice.escalation.fm"'));
    expect(fmBlock).toContain("managerName:");
    const gmBlock = cron.slice(cron.indexOf('templateKey: "invoice.blocked.gm"'));
    expect(gmBlock).toContain("managerName:");
    const legalBlock = cron.slice(cron.indexOf('templateKey: "invoice.legal_handover"'));
    expect(legalBlock).toContain("managerName:");
  });

  it("internal broadcastAlert path is preserved (no regression on the existing in_app awareness)", () => {
    expect(cron).toContain('broadcastAlert');
    expect(cron).toContain('"invoice_overdue"');
  });
});
