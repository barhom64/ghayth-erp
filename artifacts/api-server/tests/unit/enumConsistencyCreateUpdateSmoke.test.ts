/**
 * اتّساق enum بين الإنشاء والتحديث. كان الحقل z.enum في مخطّط الإنشاء لكن z.string()
 * في مخطّط التحديث/التعديل لنفس الكيان — فيمرّر التحديث قيمًا يرفضها الإنشاء، فتفسد
 * منطق سير العمل الذي يبدّل على هذه القيم. وُحِّد جانب التحديث على نفس enum الإنشاء.
 * اختبار سلوكي على مخطّطات التحديث المُصدَّرة.
 *
 * ملاحظة: fleet createFuelLogSchema.fuelType (كيان مختلف، بلا enum أصلًا) تُرك كما هو
 * عمدًا — ليس نظير تحديث-المركبة.
 */
import { describe, it, expect } from "vitest";
import { updateRiskSchema } from "../../src/routes/governance.js";
import { updateVehicleSchema } from "../../src/routes/fleet.js";
import { updateRequestSchema } from "../../src/routes/requests.js";

describe("enum consistency (create↔update) — governance risk severity", () => {
  it("rejects an out-of-enum severity on update", () => {
    expect(updateRiskSchema.safeParse({ severity: "critical_fail" }).success).toBe(false);
  });
  it("accepts a valid severity and an absent one", () => {
    expect(updateRiskSchema.safeParse({ severity: "high" }).success).toBe(true);
    expect(updateRiskSchema.safeParse({}).success).toBe(true);
  });
});

describe("enum consistency (create↔update) — fleet vehicle fuelType", () => {
  it("rejects an out-of-enum fuelType on update", () => {
    expect(updateVehicleSchema.safeParse({ fuelType: "plasma" }).success).toBe(false);
  });
  it("accepts a valid fuelType and an absent one", () => {
    expect(updateVehicleSchema.safeParse({ fuelType: "diesel" }).success).toBe(true);
    expect(updateVehicleSchema.safeParse({}).success).toBe(true);
  });
});

describe("enum consistency (create↔update) — request priority", () => {
  it("rejects an out-of-enum priority on update", () => {
    expect(updateRequestSchema.safeParse({ priority: "super_critical" }).success).toBe(false);
  });
  it("accepts a valid priority and an absent one", () => {
    expect(updateRequestSchema.safeParse({ priority: "high" }).success).toBe(true);
    expect(updateRequestSchema.safeParse({}).success).toBe(true);
  });
});
