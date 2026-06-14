import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkVehicleDocumentReadiness,
  maintenanceBlockReason,
  type VehicleReadinessRow,
  type MaintenanceBlock,
} from "../../src/lib/fleet/vehicleReadiness.js";

/**
 * #2079 PE-02 — Vehicle Readiness Gate.
 *
 * Owner's mandate (2026-06-11):
 *   «أي مركبة عليها صيانة مانعة أو ترخيص/فحص/تأمين منتهي يجب أن
 *    تُقصى أو تُعلّم بسبب واضح قبل وصولها للمشغّل.»
 *
 * Closes CONF-01 (maintenance overlap) + CONF-05 (document expiry)
 * from `docs/transport-audit/20_planning_engine_audit.md` §7.
 *
 * Tests are unit + structural — the live A-01..A-05 E2E proof runs
 * under db:provision-agent separately per «لا ترحيل بـtypecheck فقط».
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");

/* ── Test fixtures ────────────────────────────────────────────── */

const SCHED_END = "2026-07-15T18:00:00+03:00";

function row(over: Partial<VehicleReadinessRow> = {}): VehicleReadinessRow {
  return {
    id: 1,
    registrationExpiry: null,
    insuranceExpiry: null,
    nextInspectionDate: null,
    ...over,
  };
}

/* ── checkVehicleDocumentReadiness ────────────────────────────── */

describe("#2079 PE-02 — document readiness verdicts", () => {
  it("vehicle with NO expiry data is allowed (legacy fleet stays usable)", () => {
    const v = checkVehicleDocumentReadiness(row(), SCHED_END);
    expect(v.blocked).toBe(false);
    expect(v.reason).toBeNull();
  });

  it("registrationExpiry BEFORE booking end is a blocker (Arabic reason includes the date)", () => {
    const v = checkVehicleDocumentReadiness(row({ registrationExpiry: "2026-07-14" }), SCHED_END);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/استمارة المركبة منتهية الصلاحية/);
    expect(v.reason).toContain("2026-07-14");
  });

  it("registrationExpiry SAME-DAY as booking end is still valid (legal cut-off)", () => {
    const v = checkVehicleDocumentReadiness(row({ registrationExpiry: "2026-07-15" }), SCHED_END);
    expect(v.blocked).toBe(false);
  });

  it("insuranceExpiry expired in the past is a blocker", () => {
    const v = checkVehicleDocumentReadiness(row({ insuranceExpiry: "2026-06-10" }), SCHED_END);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/وثيقة التأمين منتهية الصلاحية/);
  });

  it("nextInspectionDate lapsed is a blocker — operator may not catch it on the calendar alone", () => {
    const v = checkVehicleDocumentReadiness(row({ nextInspectionDate: "2026-07-01" }), SCHED_END);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/الفحص الدوري متأخّر/);
  });

  it("first-failing check wins — registration before insurance before inspection", () => {
    // All three are expired; the function returns on the first hit,
    // so the operator sees the registration message (most actionable
    // since it's the document the traffic department checks first).
    const v = checkVehicleDocumentReadiness(
      row({
        registrationExpiry: "2026-06-01",
        insuranceExpiry: "2026-06-02",
        nextInspectionDate: "2026-06-03",
      }),
      SCHED_END,
    );
    expect(v.reason).toMatch(/استمارة المركبة/);
    expect(v.reason).not.toMatch(/وثيقة التأمين/);
  });
});

/* ── maintenanceBlockReason ────────────────────────────────────── */

describe("#2079 PE-02 — maintenance block reason formatting", () => {
  it("includes the maintenance type + scheduled date in Arabic", () => {
    const hit: MaintenanceBlock = {
      vehicleId: 1,
      maintenanceType: "تغيير زيت + فلتر",
      serviceDate: "2026-07-15",
      nextServiceDate: null,
      status: "scheduled",
    };
    const msg = maintenanceBlockReason(hit);
    expect(msg).toMatch(/صيانة مجدولة/);
    expect(msg).toContain("تغيير زيت");
    expect(msg).toContain("2026-07-15");
    expect(msg).toMatch(/تتعارض مع نافذة الرحلة/);
  });

  it("falls back to 'صيانة' when type is null (legacy / breakdown row)", () => {
    const msg = maintenanceBlockReason({
      vehicleId: 1, maintenanceType: null,
      serviceDate: "2026-07-15", nextServiceDate: null, status: "in_progress",
    });
    expect(msg).toMatch(/صيانة مجدولة \(صيانة\)/);
  });

  it("falls back to 'غير محدّد' when serviceDate is null (defensive)", () => {
    const msg = maintenanceBlockReason({
      vehicleId: 1, maintenanceType: "فحص", serviceDate: null, nextServiceDate: null, status: "scheduled",
    });
    expect(msg).toContain("غير محدّد");
  });
});

/* ── Engine wiring ─────────────────────────────────────────────── */

describe("#2079 PE-02 — engine wires the readiness gate", () => {
  it("imports the readiness helpers from the canonical path", () => {
    expect(ENGINE).toMatch(/from "\.\/vehicleReadiness\.js"/);
    expect(ENGINE).toMatch(/checkVehicleDocumentReadiness/);
    expect(ENGINE).toMatch(/type MaintenanceBlock/);
  });

  it("vehicle SELECT hydrates the three expiry columns", () => {
    for (const col of ["registrationExpiry", "insuranceExpiry", "nextInspectionDate"]) {
      expect(ENGINE, `column ${col} missing from vehicle SELECT`).toContain(`v."${col}"`);
    }
  });

  it("VehicleRow interface declares the three expiry fields as string|null", () => {
    expect(ENGINE).toMatch(/registrationExpiry: string \| null;/);
    expect(ENGINE).toMatch(/insuranceExpiry: string \| null;/);
    expect(ENGINE).toMatch(/nextInspectionDate: string \| null;/);
  });

  it("runs a maintenance window probe against fleet_maintenance (scheduled|in_progress only)", () => {
    expect(ENGINE).toMatch(/FROM fleet_maintenance m/);
    expect(ENGINE).toMatch(/m\.status IN \('scheduled', 'in_progress'\)/);
    // The ±1 day buffer treats a same-day workorder as a same-day
    // overlap even if it has no explicit end time.
    expect(ENGINE).toMatch(/m\."serviceDate" >= \$2::date - INTERVAL '1 day'/);
    expect(ENGINE).toMatch(/m\."serviceDate" <= \$3::date \+ INTERVAL '1 day'/);
  });

  it("builds a maintenanceByVehicleId Map and ejects matches before scoring", () => {
    expect(ENGINE).toMatch(/const maintenanceByVehicleId = new Map<number, MaintenanceBlock>\(\);/);
    // P0-4 (TA-T18-UX-AUDIT-01): الإقصاء يسجّل السبب في c.sink قبل continue.
    expect(ENGINE).toMatch(/if \(maintenanceByVehicleId\.has\(v\.id\)\) \{[\s\S]{0,260}continue;\s*\}/);
  });

  it("calls checkVehicleDocumentReadiness in the eligibility pre-loop", () => {
    expect(ENGINE).toMatch(/const readiness = checkVehicleDocumentReadiness\(v, end\);/);
    // P0-4 (TA-T18-UX-AUDIT-01): الإقصاء يسجّل السبب في c.sink قبل continue.
    expect(ENGINE).toMatch(/if \(readiness\.blocked\) \{[\s\S]{0,260}continue;\s*\}/);
  });

  it("readiness checks happen inside the loop that populates eligibleVehicles (not after)", () => {
    const eligibleBlock = ENGINE.slice(
      ENGINE.indexOf("const eligibleVehicles: VehicleRow[] = [];"),
      ENGINE.indexOf("for (const v of eligibleVehicles)"),
    );
    expect(eligibleBlock).toContain("checkVehicleDocumentReadiness");
    expect(eligibleBlock).toContain("maintenanceByVehicleId");
    expect(eligibleBlock).toContain("eligibleVehicles.push(v)");
  });
});

/* ── Boundary pin — no financial / non-PE-02 changes ───────────── */

describe("#2079 PE-02 — boundary intact", () => {
  it("engine still does not import any finance / GL / journal helpers", () => {
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("vehicleReadiness module never reaches into pricing / cost fields", () => {
    const lib = readFileSync(join(apiSrc, "lib/fleet/vehicleReadiness.ts"), "utf8");
    expect(lib).not.toMatch(/price|cost|revenue|invoice|amount/i);
  });
});
