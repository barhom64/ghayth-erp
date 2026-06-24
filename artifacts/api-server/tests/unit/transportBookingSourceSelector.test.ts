import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's gap #1:
//   "النقل ما زال 'نموذج إدخال' أكثر من كونه 'محرك تشغيل'. في شاشة
//    الحجز ما زال المستخدم يكتب: من / إلى / اسم العميل / جوال العميل
//    بدل أن يبدأ من: مجموعة عمرة / عقد عميل / مشروع / وقف / حجز
//    سابق / برنامج رحلة."
//
// The BookingSourceSelector is the top-of-form picker that comes
// BEFORE any free-form input. Selecting a source auto-fills the
// matching FK and pulls customer name / phone / passenger count from
// the upstream system. The 7 source tiles mirror BOOKING_SOURCES.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const SELECTOR = readFileSync(join(spaSrc, "components/shared/booking-source-selector.tsx"), "utf8");
const CREATE   = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("#1812 — BookingSourceSelector component (gap #1)", () => {
  it("file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/booking-source-selector.tsx"))).toBe(true);
  });

  it("offers all 7 BOOKING_SOURCES as tiles (matches backend enum)", () => {
    for (const v of [
      "manual_entry", "customer_request", "umrah_group",
      "contract_schedule", "import_excel", "api_integration",
      "recurring_schedule",
    ]) {
      expect(SELECTOR, `tile ${v} missing`).toMatch(new RegExp(`value:\\s*"${v}"`));
    }
  });

  it("Arabic labels for each tile + helper hints", () => {
    for (const label of [
      "مجموعة عمرة", "طلب عميل", "جدول عقد",
      "جدول متكرر", "استيراد Excel", "تكامل API", "إدخال يدوي",
    ]) {
      expect(SELECTOR, `label ${label} missing`).toContain(label);
    }
  });

  it("warns explicitly when 'manual_entry' is picked (anti-pattern)", () => {
    expect(SELECTOR).toMatch(/الإدخال اليدوي لا يربط الحجز بمصدر/);
    expect(SELECTOR).toContain("⚠️");
  });

  it("integrates UmrahGroupPicker for the umrah branch", () => {
    expect(SELECTOR).toContain("UmrahGroupPicker");
    expect(SELECTOR).toMatch(/picked === "umrah_group"/);
    expect(SELECTOR).toMatch(/umrahGroupId:\s*g\.id/);
    expect(SELECTOR).toMatch(/passengerCount:\s*g\.mutamerCount/);
  });

  it("integrates ClientSelect for customer + contract branches", () => {
    expect(SELECTOR).toContain("ClientSelect");
    expect(SELECTOR).toMatch(/picked === "customer_request"/);
    expect(SELECTOR).toMatch(/picked === "contract_schedule"/);
  });

  it("BookingSourcePrefill payload exposes 8 FK + identity fields", () => {
    for (const f of [
      "bookingSource", "customerId", "customerName", "customerPhone",
      "contractId", "projectId", "umrahGroupId", "passengerCount",
    ]) {
      expect(SELECTOR, `field ${f} missing from BookingSourcePrefill`).toContain(f);
    }
  });
});

describe("#1812 — booking-create wires the source selector at top of form", () => {
  it("imports BookingSourceSelector + BookingSourcePrefill type", () => {
    expect(CREATE).toContain("BookingSourceSelector");
    expect(CREATE).toContain("BookingSourcePrefill");
    expect(CREATE).toContain('from "@/components/shared/booking-source-selector"');
  });

  it("declares new state hooks for source-driven FKs", () => {
    expect(CREATE).toMatch(/const \[customerId, setCustomerId\]/);
    expect(CREATE).toMatch(/const \[contractId, setContractId\]/);
    expect(CREATE).toMatch(/const \[projectId, setProjectId\]/);
    // #1812 audit fix — renamed from recurringTemplateId to routePatternId.
    expect(CREATE).toMatch(/const \[routePatternId, setRoutePatternId\]/);
  });

  it("applyPrefill writes EVERY prefill field onto form state", () => {
    expect(CREATE).toContain("applyPrefill");
    expect(CREATE).toMatch(/if \(p\.customerId\) setCustomerId/);
    expect(CREATE).toMatch(/if \(p\.umrahGroupId\) setUmrahGroupId/);
    expect(CREATE).toMatch(/if \(p\.passengerCount != null\) setPassengerCount/);
  });

  it("selector is rendered FIRST inside the form (before البيانات الأساسية)", () => {
    const selectorIdx = CREATE.indexOf("<BookingSourceSelector");
    const firstCardIdx = CREATE.indexOf("البيانات الأساسية");
    expect(selectorIdx).toBeGreaterThan(0);
    expect(firstCardIdx).toBeGreaterThan(0);
    expect(selectorIdx, "selector must come before first card").toBeLessThan(firstCardIdx);
  });

  it("POST body now carries the source-driven FKs (customerId/contractId/projectId)", () => {
    expect(CREATE).toMatch(/customerId:\s*customerId \? Number\(customerId\) : undefined/);
    expect(CREATE).toMatch(/contractId:\s*contractId \? Number\(contractId\) : undefined/);
    expect(CREATE).toMatch(/projectId:\s*projectId \? Number\(projectId\) : undefined/);
  });
});
