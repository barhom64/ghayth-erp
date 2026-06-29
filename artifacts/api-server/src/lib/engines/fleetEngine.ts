// ─── Fleet Engine — محرك الأسطول ─────────────────────────────────────────
// Encapsulates all fleet-domain business logic that crosses domain boundaries.
// Fleet routes should call this engine instead of directly writing to
// finance tables (journal_entries) or HR tables (payroll_deductions).

import { financialEngine } from "./financialEngine.js";
import { eventBus } from "../eventBus.js";
import { rawQuery } from "../rawdb.js";
import { emitEvent } from "../businessHelpers.js";
import type { DomainEngine } from "./domainEngineBase.js";
import type { JournalEntryLine } from "../businessHelpers.js";

interface FleetGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

// Look up the auto-created cost-centre for a vehicle so every fleet
// GL line carries costCenterId directly. Soft fail → NULL when no CC
// row exists yet (legacy vehicles pre-autoCreate).
async function resolveVehicleCostCenter(
  companyId: number,
  vehicleId: number,
): Promise<number | null> {
  try {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM cost_centers
        WHERE "companyId" = $1
          AND ("linkedEntityType" = 'vehicle' AND "linkedEntityId" = $2
            OR  "relatedEntityType" = 'vehicle' AND "relatedEntityId" = $2)
          AND "deletedAt" IS NULL
        ORDER BY id ASC LIMIT 1`,
      [companyId, vehicleId]
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

class FleetEngineImpl implements DomainEngine {
  readonly domainId = "fleet";
  readonly label = "إدارة الأسطول";

  async postFuelExpenseGL(
    ctx: FleetGLContext,
    fuelLog: { id: number; vehicleId: number; amount: number; driverId?: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_expense", "debit", "5510"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);
    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, fuelLog.vehicleId);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `FUEL-${fuelLog.id}`,
      description: fuelLog.description ?? `مصروف وقود — مركبة #${fuelLog.vehicleId}`,
      type: "general",
      sourceType: "fleet_fuel_log",
      sourceId: fuelLog.id,
      sourceKey: `fleet:fuel:${fuelLog.id}`,
      guardTable: "fleet_fuel_logs",
      guardId: fuelLog.id,
      lines: [
        { accountCode: debitCode, debit: fuelLog.amount, credit: 0, description: "مصروف وقود", vehicleId: fuelLog.vehicleId, driverId: fuelLog.driverId, costCenterId: costCenterId ?? undefined },
        { accountCode: creditCode, debit: 0, credit: fuelLog.amount, vehicleId: fuelLog.vehicleId, driverId: fuelLog.driverId, costCenterId: costCenterId ?? undefined },
      ],
    });
  }

  /**
   * البند ٤ شريحة ٢ — صيانة المركبة → قيد حسب التوجيه (مبدآ إبراهيم). يُرحَّل عند
   * **مادْيَلة** ترشيح المحاسب (حدّ TA-T18: النقل لا يمسّ الدفتر؛ المالية هي السلطة).
   *   • مبدأ (٢) حساب الأصل: نُفضّل الحساب الفرعي للوحة (صيانة) المفتوح تلقائيًّا عند
   *     إضافة المركبة، ونسقط للحساب الأب المتخصّص `fleet_maintenance_expense`→5520.
   *   • مبدأ (١) مَن يتحمّل (costBearer) — يطابق postAccidentGL المعتمد تمامًا:
   *       - company/driver : مدين حساب صيانة المركبة، دائن النقد. (استرداد السائق يتم
   *         بخصم الراتب عبر الحدث، لا في هذا القيد.)
   *       - insurance/customer/tenant/third_party : الكلفة مستردّة من طرف خارجي →
   *         مدين ذمة مدينة (1131)، دائن حساب صيانة المركبة (التعويض يقاصّ الكلفة).
   * متوازن دائمًا · موسوم ببُعد vehicleId · idempotent عبر sourceKey/guardId. غياب
   * costBearer ⇒ "company" (السلوك السابق محفوظ).
   */
  async postMaintenanceGL(
    ctx: FleetGLContext,
    maintenance: { id: number; vehicleId: number; totalCost: number; type?: string; description?: string; costBearer?: string }
  ) {
    // مبدأ (٢): الحساب الفرعي للوحة أولًا (resolveVehicleAccountCode)، ثم الأب 5520.
    const vehicleAccount = await this.resolveVehicleAccountCode(ctx.companyId, maintenance.vehicleId, "maintenance");
    const maintCode = vehicleAccount
      ?? await financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_expense", "debit", "5520");
    const cashCode = await financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111");

    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, maintenance.vehicleId);

    // مبدأ (١): التوجيه يقرّر الحساب. القائمة المستردّة تطابق postAccidentGL.
    const costBearer = maintenance.costBearer ?? "company";
    const recoverable = ["insurance", "warranty", "customer", "tenant", "third_party"].includes(costBearer);
    let lines: JournalEntryLine[];
    if (recoverable) {
      const arCode = await financialEngine.resolveAccountCode(ctx.companyId, "accounts_receivable", "debit", "1131");
      lines = [
        { accountCode: arCode, debit: maintenance.totalCost, credit: 0, description: `ذمة صيانة — ${costBearer}`, vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: maintCode, debit: 0, credit: maintenance.totalCost, description: "تعويض صيانة المركبة", vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
      ];
    } else {
      // company / driver: الكلفة على حساب صيانة المركبة، دائن النقد.
      lines = [
        { accountCode: maintCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: cashCode, debit: 0, credit: maintenance.totalCost, vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
      ];
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `MAINT-${maintenance.id}`,
      description: maintenance.description ?? `صيانة مركبة #${maintenance.vehicleId} — ${maintenance.type ?? "عامة"}`,
      type: "general",
      sourceType: "fleet_maintenance",
      sourceId: maintenance.id,
      sourceKey: `fleet:maintenance:${maintenance.id}`,
      guardTable: "fleet_maintenance",
      guardId: maintenance.id,
      lines,
    });
  }

  /**
   * Accident assessment → GL by costBearer (الدفعة C2). يستخدم حساب المركبة
   * الفرعي المخصّص دائمًا (resolveVehicleAccountCode، إن وُجد) كطرف المركبة —
   * تطبيقًا لمبدأ «حساب مخصّص لكل أصل». السياسة المعتمدة:
   *   • company  : مدين حساب المركبة، دائن النقد.
   *   • driver   : مدين حساب المركبة، دائن النقد + (طلب خصم راتب منفصل عبر الحدث).
   *   • insurance/customer/tenant/third_party: مدين ذمة مدينة (1131)، دائن حساب
   *     المركبة (تعويض). موسوم بالكيان عبر سطور القيد.
   * متوازن دائمًا (إجمالي المدين = إجمالي الدائن = الكلفة). idempotent عبر
   * sourceKey/guardId.
   */
  async postAccidentGL(
    ctx: FleetGLContext,
    accident: { id: number; vehicleId: number; cost: number; costBearer: string; description?: string }
  ) {
    const cost = Number(accident.cost) || 0;

    // إعادة تقييم: اعكس القيد السابق (إن وُجد) قبل أي ترحيل مصحّح — لا تجميد
    // للدفتر. softDeleteJournalEntry يعكس الأرصدة ويحترم قفل الفترة، ويترك
    // المعكوس deletedAt فيسمح idempotency بإعادة الترحيل بنفس sourceKey.
    const [priorJe] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [ctx.companyId, `fleet:accident:${accident.id}`]);
    let reversedJournalId: number | null = null;
    if (priorJe) {
      const { softDeleteJournalEntry } = await import("../businessHelpers.js");
      await softDeleteJournalEntry(ctx.companyId, priorJe.id);
      reversedJournalId = priorJe.id;
    }

    // كلفة صفرية (أو إلغاء التقييم): العكس فقط، بلا قيد جديد.
    if (cost <= 0) return { journalId: null, reversedJournalId };

    const vehicleAccount = await this.resolveVehicleAccountCode(ctx.companyId, accident.vehicleId, "maintenance");
    const vehicleCode = vehicleAccount
      ?? await financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_expense", "debit", "5520");
    const cashCode = await financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111");
    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, accident.vehicleId);

    const recoverable = ["insurance", "warranty", "customer", "tenant", "third_party"].includes(accident.costBearer);
    let lines: JournalEntryLine[];
    if (recoverable) {
      // الكلفة مستردّة من طرف خارجي: مدين ذمة مدينة، دائن حساب المركبة.
      const arCode = await financialEngine.resolveAccountCode(ctx.companyId, "accounts_receivable", "debit", "1131");
      lines = [
        { accountCode: arCode, debit: cost, credit: 0, description: `ذمة حادث — ${accident.costBearer}`, vehicleId: accident.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: vehicleCode, debit: 0, credit: cost, description: "تعويض حادث المركبة", vehicleId: accident.vehicleId, costCenterId: costCenterId ?? undefined },
      ];
    } else {
      // company / driver: الكلفة تقع على المركبة، دائن النقد. (استرداد السائق
      // يتم عبر خصم الراتب لا في هذا القيد.)
      lines = [
        { accountCode: vehicleCode, debit: cost, credit: 0, description: `حادث مركبة — ${accident.costBearer}`, vehicleId: accident.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: cashCode, debit: 0, credit: cost, vehicleId: accident.vehicleId, costCenterId: costCenterId ?? undefined },
      ];
    }

    const posted = await financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `ACC-${accident.id}`,
      description: accident.description ?? `حادث مركبة #${accident.vehicleId} — يتحمّلها ${accident.costBearer}`,
      type: "general",
      sourceType: "fleet_accident",
      sourceId: accident.id,
      sourceKey: `fleet:accident:${accident.id}`,
      guardTable: "fleet_accidents",
      guardId: accident.id,
      lines,
    });
    return { ...posted, reversedJournalId };
  }

  /**
   * Driver-borne accident cost → payroll deduction via the HR event
   * boundary (no direct write to the HR-owned payroll_deductions table).
   * hrEngine listens to `fleet.accident.deduction_requested`.
   */
  async requestAccidentDeduction(
    ctx: FleetGLContext,
    params: { employeeId: number; accidentId: number; amount: number; reason: string }
  ) {
    eventBus.emit("fleet.accident.deduction_requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      employeeId: params.employeeId,
      accidentId: params.accidentId,
      amount: params.amount,
      reason: params.reason,
    });
    return { requested: true, employeeId: params.employeeId, amount: params.amount };
  }

  /**
   * Re-assessment moved an accident's cost away from the driver → ask HR to
   * cancel the as-yet-unapplied recovery deduction (event boundary).
   */
  async requestAccidentDeductionReversal(ctx: FleetGLContext, params: { accidentId: number }) {
    eventBus.emit("fleet.accident.deduction_reversed", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      accidentId: params.accidentId,
    });
    return { reversed: true, accidentId: params.accidentId };
  }

  /**
   * البند ٤ شريحة ٣ — تأمين المركبة: قسطٌ مدفوع مقدمًا يُطفأ شهريًّا (مبدأ الاستحقاق).
   *   (أ) قيد القسط: مدين «تأمينات مدفوعة مقدمًا» (1172، أصل) / دائن النقد — لا مصروفٌ
   *       فوري. (ب) جدول إطفاء (prepaid_amortization_schedules) فيتولّى الكرون القائم
   *       (runDueAmortizations) الاعتراف الشهري: مدين «تأمين المركبات»
   *       (fleet_insurance_expense→5530 بالنيّة) / دائن المدفوع مقدمًا (1172)، موسومًا
   *       ببُعد المركبة. لا محرّك إطفاء جديد — يُعاد استخدام محرّك #2247 (مبدأ إبراهيم:
   *       حساب الأصل لكل لوحة + الاستحقاق الزمني). يُفتح الجدول مرّة واحدة لكل وثيقة
   *       (idempotent على sourceType+sourceId) وفقط عند ترحيل قيد قسطٍ جديد.
   */
  async postInsuranceGL(
    ctx: FleetGLContext,
    insurance: { id: number; vehicleId: number; premium: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_prepaid_insurance", "debit", "1172"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);

    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, insurance.vehicleId);

    const posted = await financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `INS-${insurance.id}`,
      description: insurance.description ?? `تأمين مركبة #${insurance.vehicleId}`,
      type: "general",
      sourceType: "fleet_insurance",
      sourceId: insurance.id,
      sourceKey: `fleet:insurance:${insurance.id}`,
      guardTable: "fleet_insurance",
      guardId: insurance.id,
      lines: [
        { accountCode: debitCode, debit: insurance.premium, credit: 0, description: "قسط تأمين", vehicleId: insurance.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: creditCode, debit: 0, credit: insurance.premium, vehicleId: insurance.vehicleId, costCenterId: costCenterId ?? undefined },
      ],
    });

    // (ب) جدول الإطفاء الشهري — idempotent عبر فحص الوجود (sourceType+sourceId)؛ يُفتح
    // مرّة واحدة، ويُداوي ذاتيًّا لو نجح قيد القسط وفشل فتح الجدول في محاولة سابقة.
    if (insurance.premium > 0) {
      const [policy] = await rawQuery<{ startDate: string | null; endDate: string | null }>(
        `SELECT "startDate"::text AS "startDate", "endDate"::text AS "endDate"
           FROM fleet_insurance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [insurance.id, ctx.companyId],
      );
      if (policy?.startDate && policy?.endDate) {
        const [existing] = await rawQuery<{ id: number }>(
          `SELECT id FROM prepaid_amortization_schedules
            WHERE "companyId"=$1 AND "sourceType"='vehicle_insurance' AND "sourceId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
          [ctx.companyId, insurance.id],
        );
        if (!existing) {
          // ج-٧ — مُساعد مشترك (لا تكرار INSERT). الأسطول هنا per-policy (sourceId=وثيقة) + فحص الوجود أعلاه.
          const { openPrepaidSchedule } = await import("./prepaidAmortizationEngine.js");
          await openPrepaidSchedule({
            companyId: ctx.companyId, branchId: ctx.branchId,
            sourceType: "vehicle_insurance", sourceId: insurance.id,
            prepaidAccountCode: debitCode, expenseAccountPurpose: "fleet_insurance_expense",
            totalAmount: insurance.premium, startDate: policy.startDate, endDate: policy.endDate,
            dims: { vehicleId: insurance.vehicleId, costCenterId: costCenterId ?? null },
          });
        }
      }
    }

    return posted;
  }

  async postTrafficViolationGL(
    ctx: FleetGLContext,
    violation: { id: number; vehicleId: number; driverId?: number; amount: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_expense", "debit", "5560"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_payable", "credit", "2157"),
    ]);

    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, violation.vehicleId);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `TV-${violation.id}`,
      description: violation.description ?? `مخالفة مرورية — مركبة #${violation.vehicleId}`,
      type: "general",
      sourceType: "fleet_traffic_violation",
      sourceId: violation.id,
      sourceKey: `fleet:violation:${violation.id}`,
      guardTable: "fleet_traffic_violations",
      guardId: violation.id,
      lines: [
        { accountCode: debitCode, debit: violation.amount, credit: 0, description: "مخالفة مرورية", vehicleId: violation.vehicleId, driverId: violation.driverId, costCenterId: costCenterId ?? undefined },
        { accountCode: creditCode, debit: 0, credit: violation.amount, vehicleId: violation.vehicleId, costCenterId: costCenterId ?? undefined },
      ],
    });
  }

  async postViolationPaymentGL(
    ctx: FleetGLContext,
    violation: { id: number; vehicleId?: number; amount: number }
  ) {
    const [payableCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_payable", "debit", "2157"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `TV-${violation.id}-PAY`,
      description: `سداد مخالفة مرورية #${violation.id}`,
      type: "general",
      sourceType: "fleet_traffic_violation_payment",
      sourceId: violation.id,
      sourceKey: `fleet:violation_pay:${violation.id}`,
      guardTable: "fleet_traffic_violations",
      guardId: violation.id,
      lines: [
        { accountCode: payableCode, debit: violation.amount, credit: 0, vehicleId: violation.vehicleId },
        // البُعد vehicleId يُنشر على سطر النقد أيضًا حتى تكون تقارير
        // التدفّق النقدي لكل مركبة كاملة (السطران معًا)؛ ميتاداتا فقط — لا
        // أثر على المبالغ أو التوازن.
        { accountCode: cashCode, debit: 0, credit: violation.amount, vehicleId: violation.vehicleId },
      ],
    });
  }

  async postVehicleAssetGL(
    ctx: FleetGLContext,
    vehicle: { id: number; purchasePrice: number; plateNumber: string; make?: string; model?: string }
  ) {
    const [assetCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_vehicle_asset", "debit", "1210"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_vehicle_purchase_cash", "credit", "1111"),
    ]);

    const vName = `${vehicle.plateNumber} ${vehicle.make || ""} ${vehicle.model || ""}`.trim();

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `VEHICLE-${vehicle.id}`,
      description: `إثبات أصل مركبة ${vName}`,
      type: "general",
      sourceType: "fleet_vehicle",
      sourceId: vehicle.id,
      sourceKey: `fleet:vehicle_asset:${vehicle.id}`,
      guardTable: "fleet_vehicles",
      guardId: vehicle.id,
      lines: [
        { accountCode: assetCode, debit: vehicle.purchasePrice, credit: 0, vehicleId: vehicle.id },
        { accountCode: cashCode, debit: 0, credit: vehicle.purchasePrice },
      ],
    });
  }

  /**
   * Resolve a vehicle's own postable subsidiary account code for a given
   * accountType ("fuel" | "maintenance" | "depreciation"), auto-created on
   * vehicle creation. Returns null when none is configured (caller falls back
   * to the company/default account), so the routing is purely additive.
   */
  private async resolveVehicleAccountCode(
    companyId: number,
    vehicleId: number,
    accountType: string,
  ): Promise<string | null> {
    if (!vehicleId) return null;
    const rows = await rawQuery<{ code: string }>(
      `SELECT coa.code
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts coa ON coa.id = sa."accountId"
        WHERE sa."companyId" = $1 AND sa."entityType" = 'vehicle'
          AND sa."entityId" = $2 AND sa."accountType" = $3
          AND sa."isActive" = true
          AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
        LIMIT 1`,
      [companyId, vehicleId, accountType],
    );
    return rows[0]?.code ?? null;
  }

  async postTripCompletionGL(
    ctx: FleetGLContext,
    trip: {
      id: number;
      vehicleId: number;
      fuelCost: number;
      driverFare: number;
      depreciation: number;
      totalCost: number;
    }
  ) {
    if (trip.totalCost <= 0) return null;

    // Per-vehicle GL routing (#1594): prefer the vehicle's OWN subsidiary
    // account (auto-created on vehicle creation) so cost posts per-plate; fall
    // back to the per-company accounting_mappings override, then to the
    // standard fleet COA leaf (corrected from the old non-postable parents
    // 5200/1100 → 5510/5710 fuel/depreciation, 5140 transport, 1110 bank).
    const [vehFuel, vehDep] = await Promise.all([
      this.resolveVehicleAccountCode(ctx.companyId, trip.vehicleId, "fuel"),
      this.resolveVehicleAccountCode(ctx.companyId, trip.vehicleId, "depreciation"),
    ]);
    const [fuelCode, fareCode, depCode, cashCode] = await Promise.all([
      vehFuel ?? financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_expense", "debit", "5510"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_driver_fare", "debit", "5140"),
      vehDep ?? financialEngine.resolveAccountCode(ctx.companyId, "fleet_depreciation", "debit", "5710"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-FLEET-${trip.id}`,
      description: `تكلفة رحلة #${trip.id} — وقود: ${trip.fuelCost.toFixed(2)} + أجرة: ${trip.driverFare.toFixed(2)} + استهلاك: ${trip.depreciation.toFixed(2)} = ${trip.totalCost.toFixed(2)} ريال`,
      type: "general",
      sourceType: "fleet_trip",
      sourceId: trip.id,
      sourceKey: `fleet:trip:${trip.id}`,
      guardTable: "fleet_trips",
      guardId: trip.id,
      lines: [
        { accountCode: fuelCode, debit: trip.fuelCost, credit: 0, vehicleId: trip.vehicleId },
        { accountCode: fareCode, debit: trip.driverFare, credit: 0, vehicleId: trip.vehicleId },
        { accountCode: depCode, debit: trip.depreciation, credit: 0, vehicleId: trip.vehicleId },
        { accountCode: cashCode, debit: 0, credit: trip.totalCost },
      ],
    });
  }

  /**
   * Request a payroll deduction for a traffic violation assigned to a driver.
   * Instead of writing directly to the HR-owned payroll_deductions table,
   * emit an event that the HR engine listens to and processes.
   */
  async requestPayrollDeduction(
    ctx: FleetGLContext,
    params: {
      employeeId: number;
      violationId: number;
      amount: number;
      reason: string;
    }
  ) {
    eventBus.emit("fleet.violation.deduction_requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      employeeId: params.employeeId,
      violationId: params.violationId,
      amount: params.amount,
      reason: params.reason,
    });

    return { requested: true, employeeId: params.employeeId, amount: params.amount };
  }

  // إعدادات تكلفة الأسطول (مرآة لـgetFleetCostSettings بالراوت — يقرؤها المحرّك
  // بنفسه تفاديًا لاعتماد محرّك→راوت). افتراضات سعودية عند غياب الإعداد.
  private async resolveTripCostSettings(companyId: number) {
    const D = { fuelPricePerLiter: 2.5, fuelEfficiencyKmPerLiter: 10, driverFarePerKm: 0.5, depreciationPerKm: 0.15 };
    try {
      const rows = await rawQuery<{ key: string; value: string | null }>(
        `SELECT key, value FROM system_settings
          WHERE key IN ('fleet.fuel_price_per_liter','fleet.fuel_efficiency_km_per_liter','fleet.driver_fare_per_km','fleet.depreciation_per_km')
            AND ( "companyId" = $1 OR "companyId" IS NULL )
          ORDER BY ("companyId" IS NULL) ASC`, [companyId]);
      const pick = (k: string, fb: number) => {
        const r = rows.find((x) => x.key === k); const n = r?.value == null ? NaN : Number(r.value);
        return Number.isFinite(n) && n > 0 ? n : fb;
      };
      return {
        fuelPricePerLiter: pick("fleet.fuel_price_per_liter", D.fuelPricePerLiter),
        fuelEfficiencyKmPerLiter: pick("fleet.fuel_efficiency_km_per_liter", D.fuelEfficiencyKmPerLiter),
        driverFarePerKm: pick("fleet.driver_fare_per_km", D.driverFarePerKm),
        depreciationPerKm: pick("fleet.depreciation_per_km", D.depreciationPerKm),
      };
    } catch { return D; }
  }

  /**
   * Compute a completed trip's actual cost (fuel/fare/depreciation from trip
   * distance + per-company rates + tagged fuel logs) and post the completion
   * GL — idempotent via sourceKey `fleet:trip:<id>`. Closes the gap where a
   * driver-completed trip (POST /me/trips/:id/complete) never reached the
   * costing the manager route does. Tagged fuel logs already posted their own
   * GL, so their cost is excluded here (no double-count). Same money math as
   * the manager route; the manager path's direct post wins (this no-ops then).
   */
  async computeAndPostTripGL(ctx: FleetGLContext, tripId: number) {
    const [trip] = await rawQuery<{ id: number; vehicleId: number | null; distance: string | number | null }>(
      `SELECT id, "vehicleId", distance FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [tripId, ctx.companyId]);
    if (!trip || !trip.vehicleId) return null;

    const s = await this.resolveTripCostSettings(ctx.companyId);
    const distance = Number(trip.distance) || 0;
    const estimatedFuelCost = s.fuelEfficiencyKmPerLiter > 0 ? (distance / s.fuelEfficiencyKmPerLiter) * s.fuelPricePerLiter : 0;
    const [fuelRow] = await rawQuery<{ total: string }>(
      `SELECT COALESCE(SUM("totalCost"),0)::text AS total FROM fleet_fuel_logs WHERE "companyId"=$1 AND "tripId"=$2 AND "deletedAt" IS NULL`,
      [ctx.companyId, tripId]).catch(() => [{ total: "0" }]);
    const actualFuelFromLogs = Number(fuelRow?.total ?? 0);
    const glFuelCost = actualFuelFromLogs > 0 ? 0 : estimatedFuelCost; // tagged fuel already posted
    const driverFare = distance * s.driverFarePerKm;
    const depreciation = distance * s.depreciationPerKm;
    const totalCost = glFuelCost + driverFare + depreciation;
    if (totalCost <= 0) return null;

    return this.postTripCompletionGL(ctx,
      { id: tripId, vehicleId: trip.vehicleId, fuelCost: glFuelCost, driverFare, depreciation, totalCost });
  }

  async postTripGL(
    ctx: FleetGLContext,
    trip: { id: number; vehicleId: number; totalCost: number; driverId?: number }
  ) {
    if (trip.totalCost <= 0) return null;

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_trip_expense", "debit", "5140"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_trip_payable", "credit", "2111"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-TRIP-${trip.id}`,
      description: `تكلفة رحلة #${trip.id} — مركبة #${trip.vehicleId}`,
      type: "general",
      sourceType: "fleet_trips",
      sourceId: trip.id,
      sourceKey: `fleet:trip:${trip.id}`,
      guardTable: "fleet_trips",
      guardId: trip.id,
      lines: [
        { accountCode: debitCode, debit: trip.totalCost, credit: 0, description: "تكلفة رحلة", vehicleId: trip.vehicleId, driverId: trip.driverId },
        { accountCode: creditCode, debit: 0, credit: trip.totalCost, description: "مستحقات رحلة", vehicleId: trip.vehicleId },
      ],
    });
  }

  /**
   * #TA-T18 finance-boundary — the SINGLE idempotent writer for a transport
   * Accounting Candidate. The six create*Candidate methods below are thin
   * mappers over this generator (one INSERT … ON CONFLICT instead of six
   * copy-pasted blocks). Transport NEVER posts GL: it enqueues a candidate the
   * accountant reviews + materialises from the finance side. Idempotent on
   * (companyId, sourceType, sourceId). Skip-conditions and events stay in each
   * mapper. Unused columns are passed NULL — equivalent to omitting them, since
   * every varying column is nullable with no non-NULL default (quantity
   * DEFAULT 0 is always supplied).
   */
  async createBillingCandidate(
    ctx: FleetGLContext,
    c: {
      sourceType: string;
      sourceId: number;
      sourceRef: string;
      serviceType: string;
      serviceDate?: string | null;
      operationalStatus: string;
      quantity: number;
      unitOfMeasure: string;
      customerId?: number | null;
      routeFrom?: string | null;
      routeTo?: string | null;
      vehicleId?: number | null;
      driverId?: number | null;
      suggestedRevenue?: number | null;
      suggestedCost?: number | null;
      notes?: string | null;
      // البند ٤ ج-٥ — مَن يتحمّل (يُخزَّن على الترشيح فيصل المحاسب كافتراض).
      costBearer?: string | null;
    }
  ): Promise<{ id: number; created: boolean } | null> {
    const rows = await rawQuery<{ id: number; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO transport_billing_candidates (
           "companyId", "branchId",
           "sourceType", "sourceId", "sourceRef",
           "customerId", "serviceType", "serviceDate",
           "routeFrom", "routeTo",
           "vehicleId", "driverId",
           quantity, "unitOfMeasure",
           "operationalStatus",
           "suggestedRevenue", "suggestedCost",
           notes, "createdBy", "costBearer"
         )
         VALUES (
           $1, $2,
           $3, $4, $5,
           $6, $7, COALESCE($8::date, CURRENT_DATE),
           $9, $10,
           $11, $12,
           $13, $14,
           $15,
           $16, $17,
           $18, $19, $20
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = $3 AND "sourceId" = $4
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [
        ctx.companyId, ctx.branchId || null,
        c.sourceType, c.sourceId, c.sourceRef,
        c.customerId ?? null, c.serviceType, c.serviceDate ?? null,
        c.routeFrom ?? null, c.routeTo ?? null,
        c.vehicleId ?? null, c.driverId ?? null,
        c.quantity, c.unitOfMeasure,
        c.operationalStatus,
        c.suggestedRevenue ?? null, c.suggestedCost ?? null,
        c.notes ?? null, ctx.createdBy, c.costBearer ?? null,
      ]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, created: !row.existed };
  }

  /**
   * #1733 — transport never posts to GL. After the operational close
   * (`delivered` transition), we insert a pending row into
   * `transport_billing_candidates` that the accountant reviews and
   * materializes from the finance side. Idempotent on
   * (companyId, sourceType, sourceId): re-firing the transition is
   * a no-op once the candidate exists.
   *
   * Returns the candidate id (existing or newly inserted) or null when
   * the source carries no commercial dimension (zero revenue + cost).
   */
  async createCargoBillingCandidate(
    ctx: FleetGLContext,
    manifest: {
      id: number;
      manifestNumber: string;
      freightRevenue: number;
      freightCost: number;
      customerId?: number | null;
      vehicleId?: number | null;
      driverId?: number | null;
      fromLocation?: string | null;
      toLocation?: string | null;
      totalWeight?: number | null;
      deliveryDate?: string | null;
      notes?: string | null;
    }
  ): Promise<{ id: number; created: boolean } | null> {
    const revenue = Number(manifest.freightRevenue) || 0;
    const cost = Number(manifest.freightCost) || 0;
    // A zero-revenue + zero-cost manifest is a pure operational record
    // (internal transfer, sample run) — no handoff needed.
    if (revenue <= 0 && cost <= 0) return null;

    const r = await this.createBillingCandidate(ctx, {
      sourceType: "cargo_manifest", sourceId: manifest.id, sourceRef: manifest.manifestNumber,
      serviceType: "freight", serviceDate: manifest.deliveryDate ?? null, operationalStatus: "delivered",
      quantity: Number(manifest.totalWeight) || 0, unitOfMeasure: "kg",
      customerId: manifest.customerId ?? null,
      routeFrom: manifest.fromLocation ?? null, routeTo: manifest.toLocation ?? null,
      vehicleId: manifest.vehicleId ?? null, driverId: manifest.driverId ?? null,
      suggestedRevenue: revenue > 0 ? revenue : null, suggestedCost: cost > 0 ? cost : null,
      notes: manifest.notes ?? null,
    });
    if (r?.created) {
      eventBus.emit("fleet.cargo.billing_candidate.created", {
        companyId: ctx.companyId,
        manifestId: manifest.id,
        candidateId: r.id,
      });
    }
    return r;
  }

  /**
   * #TA-T18 finance-boundary — maintenance cost → Accounting Candidate.
   * Owner's rule: transport NEVER posts GL directly. Completing a
   * maintenance ticket queues an EXPENSE candidate the accountant
   * reviews + materialises (postMaintenanceGL runs at materialise-time,
   * not on completion). Mirrors createCargoBillingCandidate; revenue is
   * NULL (pure expense), suggestedCost carries the amount. Idempotent on
   * (company, sourceType, sourceId).
   */
  async createMaintenanceExpenseCandidate(
    ctx: FleetGLContext,
    maintenance: { id: number; vehicleId: number; cost: number; type?: string | null; description?: string | null; sourceRef?: string | null; costBearer?: string | null }
  ): Promise<{ id: number; created: boolean } | null> {
    const cost = Number(maintenance.cost) || 0;
    if (cost <= 0) return null;
    return this.createBillingCandidate(ctx, {
      sourceType: "maintenance", sourceId: maintenance.id,
      sourceRef: maintenance.sourceRef ?? `MAINT-${maintenance.id}`,
      serviceType: "maintenance", operationalStatus: "completed",
      quantity: 1, unitOfMeasure: "service",
      vehicleId: maintenance.vehicleId,
      suggestedCost: cost, notes: maintenance.description ?? null,
      // البند ٤ ج-٥ — اختيار المُكمِل لمَن يتحمّل يصل المحاسب كافتراض.
      costBearer: maintenance.costBearer ?? null,
    });
  }

  /**
   * #TA-T18 finance-boundary — fuel cost → Accounting Candidate.
   * Logging a fuel entry queues an EXPENSE candidate (no direct GL);
   * the accountant materialises it (postFuelExpenseGL runs then).
   */
  async createFuelExpenseCandidate(
    ctx: FleetGLContext,
    fuel: { id: number; vehicleId: number; cost: number; description?: string | null; sourceRef?: string | null }
  ): Promise<{ id: number; created: boolean } | null> {
    const cost = Number(fuel.cost) || 0;
    if (cost <= 0) return null;
    return this.createBillingCandidate(ctx, {
      sourceType: "fuel", sourceId: fuel.id, sourceRef: fuel.sourceRef ?? `FUEL-${fuel.id}`,
      serviceType: "fuel", operationalStatus: "completed",
      quantity: 1, unitOfMeasure: "service",
      vehicleId: fuel.vehicleId, suggestedCost: cost, notes: fuel.description ?? null,
    });
  }

  /**
   * #TA-T18 finance-boundary — insurance premium → Accounting Candidate.
   * Recording a policy queues an EXPENSE candidate (no direct GL); the
   * accountant materialises it (postInsuranceGL runs then).
   */
  async createInsuranceExpenseCandidate(
    ctx: FleetGLContext,
    insurance: { id: number; vehicleId: number; cost: number; description?: string | null; sourceRef?: string | null }
  ): Promise<{ id: number; created: boolean } | null> {
    const cost = Number(insurance.cost) || 0;
    if (cost <= 0) return null;
    return this.createBillingCandidate(ctx, {
      sourceType: "insurance", sourceId: insurance.id, sourceRef: insurance.sourceRef ?? `INS-${insurance.id}`,
      serviceType: "insurance", operationalStatus: "completed",
      quantity: 1, unitOfMeasure: "policy",
      vehicleId: insurance.vehicleId, suggestedCost: cost, notes: insurance.description ?? null,
    });
  }

  /**
   * #1812 — rental close → Accounting Candidate (الإيراد عند الإغلاق).
   * Mirrors createCargoBillingCandidate for the third transport leg.
   * Fired from the rental /return endpoint after the contract flips
   * to `completed`. The candidate carries:
   *
   *   • quantity = rental days (startDate → actualEndDate inclusive
   *     of the first day) + unitOfMeasure 'day', so the accountant
   *     can recognise the revenue over the rental DURATION (التأجير
   *     على مدى المدة) rather than as a single-day event.
   *   • suggestedRevenue = totalAmount + overageAmount (the overage
   *     is itemised in notes so it can become a separate invoice line).
   *   • serviceDate = actualEndDate — the operational close date.
   *
   * Idempotent on (companyId, 'fleet_rental_contract', contractId):
   * re-firing the return transition is a no-op once the candidate
   * exists. NO journal entry is posted here — the accountant
   * materializes from the finance side, same as cargo.
   */
  async createRentalBillingCandidate(
    ctx: FleetGLContext,
    contract: {
      id: number;
      ref?: string | null;
      clientId: number;
      vehicleId: number;
      driverId?: number | null;
      startDate: string;
      actualEndDate: string;
      totalAmount?: number | null;
      overageAmount?: number | null;
      notes?: string | null;
    }
  ): Promise<{ id: number; created: boolean } | null> {
    const baseRevenue = Number(contract.totalAmount) || 0;
    const overage = Number(contract.overageAmount) || 0;
    const revenue = baseRevenue + overage;
    // A zero-value contract (courtesy loan, internal use) is a pure
    // operational record — no handoff needed.
    if (revenue <= 0) return null;

    // Rental days: difference + 1 so a same-day rent-and-return counts
    // as one day. Falls back to 1 on unparsable dates.
    const start = new Date(contract.startDate);
    const end = new Date(contract.actualEndDate);
    const rentalDays =
      Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
        ? 1
        : Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

    const periodNote =
      `إيجار مركبة للفترة ${contract.startDate} → ${contract.actualEndDate} (${rentalDays} يوم)` +
      (overage > 0 ? ` — يشمل زائد إرجاع ${overage} (بند منفصل مقترح)` : "") +
      (contract.notes ? `\n${contract.notes}` : "");

    const r = await this.createBillingCandidate(ctx, {
      sourceType: "fleet_rental_contract", sourceId: contract.id, sourceRef: contract.ref ?? `RENT-${contract.id}`,
      serviceType: "rental", serviceDate: contract.actualEndDate, operationalStatus: "returned",
      quantity: rentalDays, unitOfMeasure: "day",
      customerId: contract.clientId,
      vehicleId: contract.vehicleId, driverId: contract.driverId ?? null,
      suggestedRevenue: revenue, notes: periodNote,
    });
    if (r?.created) {
      eventBus.emit("fleet.rental.billing_candidate.created", {
        companyId: ctx.companyId,
        contractId: contract.id,
        candidateId: r.id,
      });
    }
    return r;
  }

  /**
   * #1812 / #2079 TA-T18-01 — passenger booking close → Accounting
   * Candidate (إيراد رحلة الركاب يصل طابور المحاسب).
   * Mirrors createCargoBillingCandidate + createRentalBillingCandidate
   * for the passenger leg. Fired from the booking PATCH when status
   * transitions to `completed` AND tripFamily = 'passenger'. The
   * candidate carries:
   *
   *   • quantity = passengerCount + unitOfMeasure 'pax', so the
   *     accountant prices by head count (umrah groups, charter trips,
   *     daily passenger runs).
   *   • suggestedRevenue is NOT set here — passenger pricing is rule-
   *     driven downstream (transport_price_rules + pricingEngine on
   *     the service-line side), unlike cargo/rental where the trip
   *     row already carries the agreed amount. The candidate signals
   *     «جاهز للتسعير» and the accountant materialises it through
   *     the existing pricing pipeline.
   *   • serviceDate = current Riyadh date (booking row carries no
   *     completedAt column; the operational close moment IS now).
   *
   * Idempotent on (companyId, 'transport_booking_passenger', bookingId):
   * re-firing the completed transition is a no-op once the candidate
   * exists. NO journal entry is posted here — the accountant
   * materialises from the finance side, same boundary as cargo + rental.
   *
   * Skip cases (return null without inserting):
   *   • passengerCount <= 0 — pure operational record (internal
   *     transfer / equipment booking misclassified at intake), no
   *     billable headcount.
   *   • tripFamily != 'passenger' — guard against accidental calls
   *     from cargo bookings (those go through createCargoBillingCandidate).
   */
  async createPassengerBillingCandidate(
    ctx: FleetGLContext,
    booking: {
      id: number;
      bookingNumber: string;
      tripFamily: string | null;
      customerId: number | null;
      passengerCount: number | null;
      fromLocationText: string | null;
      toLocationText: string | null;
      vehicleId?: number | null;
      driverId?: number | null;
      notes?: string | null;
    }
  ): Promise<{ id: number; created: boolean } | null> {
    if (booking.tripFamily !== "passenger") return null;
    const pax = Number(booking.passengerCount) || 0;
    if (pax <= 0) return null;

    const route =
      booking.fromLocationText && booking.toLocationText
        ? `${booking.fromLocationText} → ${booking.toLocationText}`
        : (booking.fromLocationText ?? booking.toLocationText ?? "بدون مسار");
    const note =
      `نقل ركاب — حجز ${booking.bookingNumber}، ${pax} راكب على المسار ${route}` +
      (booking.notes ? `\n${booking.notes}` : "");

    const r = await this.createBillingCandidate(ctx, {
      sourceType: "transport_booking_passenger", sourceId: booking.id, sourceRef: booking.bookingNumber,
      serviceType: "passenger", operationalStatus: "completed",
      quantity: pax, unitOfMeasure: "pax",
      customerId: booking.customerId,
      routeFrom: booking.fromLocationText, routeTo: booking.toLocationText,
      vehicleId: booking.vehicleId ?? null, driverId: booking.driverId ?? null,
      notes: note,
    });
    if (r?.created) {
      eventBus.emit("fleet.passenger.billing_candidate.created", {
        companyId: ctx.companyId,
        bookingId: booking.id,
        candidateId: r.id,
      });
    }
    return r;
  }

  /**
   * Post the financial impact of a delivered cargo manifest in ONE
   * balanced journal entry. A road-freight shipment has two money
   * flows that net to a single balanced JE:
   *   • Revenue earned from the customer  → DR A/R, CR freight revenue
   *   • Cost owed for hauling the freight → DR freight cost, CR payable
   * Total debits (revenue + cost) == total credits (revenue + cost),
   * so the entry balances even when only one side is non-zero (the
   * zero-amount lines are dropped before posting).
   *
   * #1733 — Transport routes MUST NOT call this directly. It is invoked
   * from the accountant-side materialize endpoint
   * (`/api/finance/transport-billing-candidates/:id/materialize`) which
   * resolves a candidate row and only then asks fleetEngine to post.
   * The financialEngine guard (cargo_manifests / id) keeps the JE
   * idempotent even when the accountant clicks materialize twice.
   */
  async postCargoDeliveryGL(
    ctx: FleetGLContext,
    manifest: {
      id: number;
      manifestNumber: string;
      freightRevenue: number;
      freightCost: number;
      customerId?: number | null;
      vehicleId?: number | null;
      driverId?: number | null;
    }
  ) {
    const revenue = Number(manifest.freightRevenue) || 0;
    const cost = Number(manifest.freightCost) || 0;
    if (revenue <= 0 && cost <= 0) return null;

    const [arCode, revenueCode, costCode, payableCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "cargo_receivable", "debit", "1131"),
      financialEngine.resolveAccountCode(ctx.companyId, "cargo_freight_revenue", "credit", "4153"),
      financialEngine.resolveAccountCode(ctx.companyId, "cargo_freight_cost", "debit", "5140"),
      financialEngine.resolveAccountCode(ctx.companyId, "cargo_freight_payable", "credit", "2111"),
    ]);

    const lines: JournalEntryLine[] = [];
    if (revenue > 0) {
      lines.push({ accountCode: arCode, debit: revenue, credit: 0, description: `ذمم شحن — بوليصة ${manifest.manifestNumber}`, clientId: manifest.customerId ?? undefined, vehicleId: manifest.vehicleId ?? undefined, driverId: manifest.driverId ?? undefined });
      lines.push({ accountCode: revenueCode, debit: 0, credit: revenue, description: `إيراد شحن — بوليصة ${manifest.manifestNumber}`, clientId: manifest.customerId ?? undefined, vehicleId: manifest.vehicleId ?? undefined });
    }
    if (cost > 0) {
      lines.push({ accountCode: costCode, debit: cost, credit: 0, description: `تكلفة شحن — بوليصة ${manifest.manifestNumber}`, vehicleId: manifest.vehicleId ?? undefined, driverId: manifest.driverId ?? undefined });
      lines.push({ accountCode: payableCode, debit: 0, credit: cost, description: `مستحقات شحن — بوليصة ${manifest.manifestNumber}`, vehicleId: manifest.vehicleId ?? undefined });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-CARGO-${manifest.id}`,
      description: `تسليم بوليصة شحن ${manifest.manifestNumber} — إيراد: ${revenue.toFixed(2)} / تكلفة: ${cost.toFixed(2)} ريال`,
      type: "general",
      sourceType: "cargo_manifest",
      sourceId: manifest.id,
      sourceKey: `fleet:cargo:${manifest.id}`,
      guardTable: "cargo_manifests",
      guardId: manifest.id,
      lines,
    });
  }

  async requestFixedAssetRegistration(
    ctx: FleetGLContext,
    asset: {
      vehicleId: number;
      code: string;
      name: string;
      description: string;
      purchaseDate: string;
      purchaseCost: number;
      salvageValue: number;
      usefulLifeYears: number;
    }
  ) {
    const [assetAccountCode, depreciationAccountCode, accDepreciationAccountCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_vehicle_asset", "debit", "1210"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_depreciation", "debit", "5710"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_acc_depreciation", "credit", "1211"),
    ]);

    eventBus.emit("finance.fixed_asset.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      category: "مركبات",
      assetAccountCode,
      depreciationAccountCode,
      accDepreciationAccountCode,
      ...asset,
    });
    return { requested: true };
  }

  async requestWarehouseDeduction(
    ctx: FleetGLContext,
    params: {
      maintenanceId: number;
      parts: Array<{
        productId: number;
        quantity: number;
        unitCost?: number;
      }>;
    }
  ) {
    eventBus.emit("fleet.warehouse_deduction.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      maintenanceId: params.maintenanceId,
      parts: params.parts,
    });
    return { requested: true };
  }
}

export const fleetEngine = new FleetEngineImpl();
