// ─── Fleet Engine — محرك الأسطول ─────────────────────────────────────────
// Encapsulates all fleet-domain business logic that crosses domain boundaries.
// Fleet routes should call this engine instead of directly writing to
// finance tables (journal_entries) or HR tables (payroll_deductions).

import { financialEngine } from "./financialEngine.js";
import { eventBus } from "../eventBus.js";
import { rawQuery, rawExecute } from "../rawdb.js";
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

  async postMaintenanceGL(
    ctx: FleetGLContext,
    maintenance: { id: number; vehicleId: number; totalCost: number; type?: string; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_expense", "debit", "5520"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);

    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, maintenance.vehicleId);

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
      lines: [
        { accountCode: debitCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
        { accountCode: creditCode, debit: 0, credit: maintenance.totalCost, vehicleId: maintenance.vehicleId, costCenterId: costCenterId ?? undefined },
      ],
    });
  }

  async postInsuranceGL(
    ctx: FleetGLContext,
    insurance: { id: number; vehicleId: number; premium: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_prepaid_insurance", "debit", "1172"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1111"),
    ]);

    const costCenterId = await resolveVehicleCostCenter(ctx.companyId, insurance.vehicleId);

    return financialEngine.postJournalEntry({
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
        { accountCode: cashCode, debit: 0, credit: violation.amount },
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
           notes,
           "createdBy"
         )
         VALUES (
           $1, $2,
           'cargo_manifest', $3, $4,
           $5, 'freight', COALESCE($6::date, CURRENT_DATE),
           $7, $8,
           $9, $10,
           $11, 'kg',
           'delivered',
           $12, $13,
           $14,
           $15
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'cargo_manifest' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [
        ctx.companyId,
        ctx.branchId || null,
        manifest.id,
        manifest.manifestNumber,
        manifest.customerId ?? null,
        manifest.deliveryDate ?? null,
        manifest.fromLocation ?? null,
        manifest.toLocation ?? null,
        manifest.vehicleId ?? null,
        manifest.driverId ?? null,
        Number(manifest.totalWeight) || 0,
        revenue > 0 ? revenue : null,
        cost > 0 ? cost : null,
        manifest.notes ?? null,
        ctx.createdBy,
      ]
    );
    const row = rows[0];
    if (!row) return null;
    if (!row.existed) {
      eventBus.emit("fleet.cargo.billing_candidate.created", {
        companyId: ctx.companyId,
        manifestId: manifest.id,
        candidateId: row.id,
      });
    }
    return { id: row.id, created: !row.existed };
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
    maintenance: { id: number; vehicleId: number; cost: number; type?: string | null; description?: string | null; sourceRef?: string | null }
  ): Promise<{ id: number; created: boolean } | null> {
    const cost = Number(maintenance.cost) || 0;
    if (cost <= 0) return null;
    const rows = await rawQuery<{ id: number; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO transport_billing_candidates (
           "companyId", "branchId",
           "sourceType", "sourceId", "sourceRef",
           "serviceType", "serviceDate",
           "vehicleId",
           quantity, "unitOfMeasure",
           "operationalStatus",
           "suggestedRevenue", "suggestedCost",
           notes,
           "createdBy"
         )
         VALUES (
           $1, $2,
           'maintenance', $3, $4,
           'maintenance', CURRENT_DATE,
           $5,
           1, 'service',
           'completed',
           NULL, $6,
           $7,
           $8
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'maintenance' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [
        ctx.companyId,
        ctx.branchId || null,
        maintenance.id,
        maintenance.sourceRef ?? `MAINT-${maintenance.id}`,
        maintenance.vehicleId,
        cost,
        maintenance.description ?? null,
        ctx.createdBy,
      ]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, created: !row.existed };
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
    const rows = await rawQuery<{ id: number; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO transport_billing_candidates (
           "companyId", "branchId", "sourceType", "sourceId", "sourceRef",
           "serviceType", "serviceDate", "vehicleId",
           quantity, "unitOfMeasure", "operationalStatus",
           "suggestedRevenue", "suggestedCost", notes, "createdBy"
         )
         VALUES (
           $1, $2, 'fuel', $3, $4,
           'fuel', CURRENT_DATE, $5,
           1, 'service', 'completed',
           NULL, $6, $7, $8
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'fuel' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [ctx.companyId, ctx.branchId || null, fuel.id, fuel.sourceRef ?? `FUEL-${fuel.id}`, fuel.vehicleId, cost, fuel.description ?? null, ctx.createdBy]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, created: !row.existed };
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
    const rows = await rawQuery<{ id: number; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO transport_billing_candidates (
           "companyId", "branchId", "sourceType", "sourceId", "sourceRef",
           "serviceType", "serviceDate", "vehicleId",
           quantity, "unitOfMeasure", "operationalStatus",
           "suggestedRevenue", "suggestedCost", notes, "createdBy"
         )
         VALUES (
           $1, $2, 'insurance', $3, $4,
           'insurance', CURRENT_DATE, $5,
           1, 'policy', 'completed',
           NULL, $6, $7, $8
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'insurance' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [ctx.companyId, ctx.branchId || null, insurance.id, insurance.sourceRef ?? `INS-${insurance.id}`, insurance.vehicleId, cost, insurance.description ?? null, ctx.createdBy]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, created: !row.existed };
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

    const rows = await rawQuery<{ id: number; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO transport_billing_candidates (
           "companyId", "branchId",
           "sourceType", "sourceId", "sourceRef",
           "customerId", "serviceType", "serviceDate",
           "vehicleId", "driverId",
           quantity, "unitOfMeasure",
           "operationalStatus",
           "suggestedRevenue",
           notes,
           "createdBy"
         )
         VALUES (
           $1, $2,
           'fleet_rental_contract', $3, $4,
           $5, 'rental', COALESCE($6::date, CURRENT_DATE),
           $7, $8,
           $9, 'day',
           'returned',
           $10,
           $11,
           $12
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'fleet_rental_contract' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [
        ctx.companyId,
        ctx.branchId || null,
        contract.id,
        contract.ref ?? `RENT-${contract.id}`,
        contract.clientId,
        contract.actualEndDate,
        contract.vehicleId,
        contract.driverId ?? null,
        rentalDays,
        revenue,
        periodNote,
        ctx.createdBy,
      ]
    );
    const row = rows[0];
    if (!row) return null;
    if (!row.existed) {
      eventBus.emit("fleet.rental.billing_candidate.created", {
        companyId: ctx.companyId,
        contractId: contract.id,
        candidateId: row.id,
      });
    }
    return { id: row.id, created: !row.existed };
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
           notes,
           "createdBy"
         )
         VALUES (
           $1, $2,
           'transport_booking_passenger', $3, $4,
           $5, 'passenger', CURRENT_DATE,
           $6, $7,
           $8, $9,
           $10, 'pax',
           'completed',
           $11,
           $12
         )
         ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING
         RETURNING id, FALSE AS existed
       )
       SELECT id, existed FROM ins
       UNION ALL
       SELECT id, TRUE AS existed
         FROM transport_billing_candidates
        WHERE "companyId" = $1 AND "sourceType" = 'transport_booking_passenger' AND "sourceId" = $3
          AND NOT EXISTS (SELECT 1 FROM ins)
       LIMIT 1`,
      [
        ctx.companyId,
        ctx.branchId || null,
        booking.id,
        booking.bookingNumber,
        booking.customerId,
        booking.fromLocationText,
        booking.toLocationText,
        booking.vehicleId ?? null,
        booking.driverId ?? null,
        pax,
        note,
        ctx.createdBy,
      ]
    );
    const row = rows[0];
    if (!row) return null;
    if (!row.existed) {
      eventBus.emit("fleet.passenger.billing_candidate.created", {
        companyId: ctx.companyId,
        bookingId: booking.id,
        candidateId: row.id,
      });
    }
    return { id: row.id, created: !row.existed };
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
