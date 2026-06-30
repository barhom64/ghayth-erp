import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * مكافآت حركات النقل (الدفعة أ، تشغيلية بلا دفتر) — تحقّق ساكن للتوصيل:
 *   • المشرف يمنح مكافأة مقطوعة على حركة (أمر توزيع) باعتماد بشري منفصل.
 *   • قفل الحدود: لا قيد هنا؛ الختم (markMovementBonusesConsumed) في مكتبة
 *     الأسطول. الترحيل للراتب في الدفعة ب عبر getApprovedMovementBonuses.
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const spaSrc = join(repoRoot, "artifacts/ghayth-erp/src");
const read = (p: string) => readFileSync(p, "utf8");

const MIG_PATH = join(apiSrc, "migrations/445_transport_movement_bonuses.sql");
const MIG = read(MIG_PATH);
const LIB = read(join(apiSrc, "lib/fleet/movementBonuses.ts"));
const ROUTE = read(join(apiSrc, "routes/fleet-movement-bonuses.ts"));
const INDEX = read(join(apiSrc, "routes/index.ts"));
const CATALOG = read(join(apiSrc, "lib/rbac/featureCatalog.ts"));
const PAGE = read(join(spaSrc, "pages/fleet/movement-bonuses.tsx"));
const FLEET_ROUTES = read(join(spaSrc, "routes/fleetRoutes.tsx"));
const NAV = read(join(spaSrc, "components/layout/navigation.registry.ts"));

describe("الدفعة أ — هجرة transport_movement_bonuses", () => {
  it("جدول معزول إيجاريًا على أمر التوزيع + مبلغ موجب + بوابة حالة", () => {
    expect(existsSync(MIG_PATH)).toBe(true);
    expect(MIG).toContain("@rollback");
    expect(MIG).toContain("CREATE TABLE IF NOT EXISTS transport_movement_bonuses");
    expect(MIG).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIG).toMatch(/"dispatchOrderId"\s+INTEGER NOT NULL REFERENCES transport_dispatch_orders\(id\)/);
    expect(MIG).toContain("transport_movement_bonuses_amount_pos");
    for (const s of ["pending", "approved", "void"]) expect(MIG).toContain(`'${s}'`);
    expect(MIG).toContain('"payrollLineId"'); // علامة الاستهلاك
  });
});

describe("المنطق — lib/fleet/movementBonuses", () => {
  it("يُصدّر المنح/الاعتماد/القائمة + عقد القراءة + الختم", () => {
    for (const fn of [
      "export async function awardMovementBonus",
      "export async function approveMovementBonus",
      "export async function listMovementBonuses",
      "export async function getApprovedMovementBonuses",
      "export async function markMovementBonusesConsumed",
      "export const awardBonusSchema",
    ]) expect(LIB, `missing ${fn}`).toContain(fn);
  });
  it("المبلغ: المُدخَل وإلا إعداد fleet.bonus.movementDefault", () => {
    expect(LIB).toContain('"fleet.bonus.movementDefault"');
    expect(LIB).toContain("لا مبلغ مكافأة مُعدّ");
  });
  it("بوابة الاعتماد: pending فقط + فصل عن المنح + أثر تدقيق", () => {
    expect(LIB).toMatch(/UPDATE transport_movement_bonuses[\s\S]*?status = 'approved'[\s\S]*?status = 'pending'/);
    expect(LIB).toContain('action: "movement_bonus_approved"');
  });
  it("عقد القراءة: المعتمد وغير المُستهلَك فقط", () => {
    expect(LIB).toMatch(/getApprovedMovementBonuses[\s\S]*?status = 'approved' AND "payrollLineId" IS NULL/);
  });
});

describe("منتقي الحركات — قائمة الحركات المؤهَّلة (قراءة فقط)", () => {
  it("المكتبة تُصدّر listEligibleMovements بفلتر حالة العمل الفعلي + سياق + hasBonus", () => {
    expect(LIB).toContain("export async function listEligibleMovements");
    expect(LIB).toContain("d.status IN ('executing','completed','closed')");
    expect(LIB).toContain('AS "driverName"');
    expect(LIB).toContain('AS "vehiclePlate"');
    expect(LIB).toContain('AS "hasBonus"');
    // علامة وجود مكافأة غير ملغاة قائمة (لا تمنع، إعلامية)
    expect(LIB).toMatch(/EXISTS \([\s\S]*?transport_movement_bonuses mb[\s\S]*?mb\.status <> 'void'/);
  });
  it("المسار يعرض الحركات المؤهَّلة عبر صلاحية القائمة، مسار مميّز", () => {
    expect(ROUTE).toMatch(/"\/fleet\/movement-bonuses\/eligible-movements"[\s\S]{0,160}fleet\.movement_bonus[\s\S]{0,30}"list"/);
    expect(ROUTE).toContain("listEligibleMovements");
  });
  it("الواجهة تستبدل الإدخال اليدوي بمنتقي قابل للبحث (SearchableSelect)", () => {
    expect(PAGE).toContain("SearchableSelect");
    expect(PAGE).toContain("/fleet/movement-bonuses/eligible-movements");
    // لم يعد رقم أمر التوزيع يُدخَل يدويًا كحقل رقمي
    expect(PAGE).not.toMatch(/placeholder="من لوحة التوزيع"/);
  });
});

describe("قفل الحدود — لا دفتر، الختم في مكتبة الأسطول", () => {
  it("لا قيد ولا جداول مالية في كود المكافآت", () => {
    for (const src of [LIB, ROUTE]) {
      expect(src).not.toContain("postJournalEntry");
      expect(src).not.toContain("credit_memos");
      expect(src).not.toMatch(/INSERT INTO payroll/i);
    }
  });
  it("ختم جدول المكافآت يعيش في المكتبة (markMovementBonusesConsumed)", () => {
    expect(LIB).toContain("UPDATE transport_movement_bonuses");
    expect(LIB).toContain("export async function markMovementBonusesConsumed");
  });
});

describe("المسار + RBAC", () => {
  it("GET/POST/approve على fleet.movement_bonus (list/update/approve) ومُسجّل", () => {
    expect(ROUTE).toMatch(/"\/fleet\/movement-bonuses"[\s\S]{0,140}fleet\.movement_bonus[\s\S]{0,30}"list"/);
    expect(ROUTE).toMatch(/"\/fleet\/movement-bonuses"[\s\S]{0,140}"update"/);
    expect(ROUTE).toMatch(/"\/fleet\/movement-bonuses\/:id\/approve"[\s\S]{0,140}"approve"/);
    expect(INDEX).toContain('from "./fleet-movement-bonuses.js"');
    expect(INDEX).toContain("router.use(fleetMovementBonusesRouter)");
  });
  it("ميزة fleet.movement_bonus بفصل الاعتماد عن المنح", () => {
    expect(CATALOG).toMatch(/key:\s*"fleet\.movement_bonus"[\s\S]{0,200}approvableActions:\s*\["approve"\]/);
  });
});

describe("الواجهة — شاشة مكافآت حركات النقل", () => {
  it("نموذج منح + اعتماد بصلاحيات منفصلة + مُسجّلة", () => {
    expect(PAGE).toContain("منح مكافأة على حركة");
    expect(PAGE).toMatch(/perm="fleet\.movement_bonus:update"/);
    expect(PAGE).toMatch(/perm="fleet\.movement_bonus:approve"/);
    expect(PAGE).toContain("/fleet/movement-bonuses");
    expect(FLEET_ROUTES).toContain('path: "/fleet/movement-bonuses"');
    expect(NAV).toContain('perm: "fleet.movement_bonus:list"');
  });
});
