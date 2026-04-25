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

class FleetEngineImpl implements DomainEngine {
  readonly domainId = "fleet";
  readonly label = "إدارة الأسطول";

  async postFuelExpenseGL(
    ctx: FleetGLContext,
    fuelLog: { id: number; vehicleId: number; amount: number; driverId?: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_expense", "debit", "5200"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1100"),
    ]);

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
        { accountCode: debitCode, debit: fuelLog.amount, credit: 0, description: "مصروف وقود", vehicleId: fuelLog.vehicleId, driverId: fuelLog.driverId },
        { accountCode: creditCode, debit: 0, credit: fuelLog.amount, vehicleId: fuelLog.vehicleId },
      ],
    });
  }

  async postMaintenanceGL(
    ctx: FleetGLContext,
    maintenance: { id: number; vehicleId: number; totalCost: number; type?: string; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_expense", "debit", "5300"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1100"),
    ]);

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
        { accountCode: debitCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, vehicleId: maintenance.vehicleId },
        { accountCode: creditCode, debit: 0, credit: maintenance.totalCost, vehicleId: maintenance.vehicleId },
      ],
    });
  }

  async postInsuranceGL(
    ctx: FleetGLContext,
    insurance: { id: number; vehicleId: number; premium: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_prepaid_insurance", "debit", "1350"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1100"),
    ]);

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
        { accountCode: debitCode, debit: insurance.premium, credit: 0, description: "قسط تأمين", vehicleId: insurance.vehicleId },
        { accountCode: creditCode, debit: 0, credit: insurance.premium, vehicleId: insurance.vehicleId },
      ],
    });
  }

  async postTrafficViolationGL(
    ctx: FleetGLContext,
    violation: { id: number; vehicleId: number; driverId?: number; amount: number; description?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_expense", "debit", "5290"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_payable", "credit", "2100"),
    ]);

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
        { accountCode: debitCode, debit: violation.amount, credit: 0, description: "مخالفة مرورية", vehicleId: violation.vehicleId, driverId: violation.driverId },
        { accountCode: creditCode, debit: 0, credit: violation.amount, vehicleId: violation.vehicleId },
      ],
    });
  }

  async postViolationPaymentGL(
    ctx: FleetGLContext,
    violation: { id: number; vehicleId?: number; amount: number }
  ) {
    const [payableCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fines_payable", "credit", "2100"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1100"),
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
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_vehicle_asset", "debit", "1510"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_vehicle_asset", "credit", "1100"),
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

    const [fuelCode, fareCode, depCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_expense", "debit", "5200"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_driver_fare", "debit", "5210"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_depreciation", "debit", "5220"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_cash_source", "credit", "1100"),
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
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_trip_expense", "debit", "6300"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_trip_payable", "credit", "2100"),
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
}

export const fleetEngine = new FleetEngineImpl();
