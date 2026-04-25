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
    fuelLog: { id: number; vehicleId: number; amount: number; driverId?: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_expense", "debit", "6310"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_fuel_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-FUEL-${fuelLog.id}`,
      description: `مصروف وقود — مركبة #${fuelLog.vehicleId}`,
      type: "general",
      sourceType: "fleet_fuel_logs",
      sourceId: fuelLog.id,
      sourceKey: `fleet:fuel:${fuelLog.id}`,
      guardTable: "fleet_fuel_logs",
      guardId: fuelLog.id,
      lines: [
        { accountCode: debitCode, debit: fuelLog.amount, credit: 0, description: "مصروف وقود", vehicleId: fuelLog.vehicleId, driverId: fuelLog.driverId },
        { accountCode: creditCode, debit: 0, credit: fuelLog.amount, description: "مستحقات وقود", vehicleId: fuelLog.vehicleId },
      ],
    });
  }

  async postMaintenanceGL(
    ctx: FleetGLContext,
    maintenance: { id: number; vehicleId: number; totalCost: number; type?: string }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_expense", "debit", "6320"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_maintenance_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-MAINT-${maintenance.id}`,
      description: `صيانة مركبة #${maintenance.vehicleId} — ${maintenance.type ?? "عامة"}`,
      type: "general",
      sourceType: "fleet_maintenance",
      sourceId: maintenance.id,
      sourceKey: `fleet:maintenance:${maintenance.id}`,
      guardTable: "fleet_maintenance",
      guardId: maintenance.id,
      lines: [
        { accountCode: debitCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, vehicleId: maintenance.vehicleId },
        { accountCode: creditCode, debit: 0, credit: maintenance.totalCost, description: "مستحقات صيانة", vehicleId: maintenance.vehicleId },
      ],
    });
  }

  async postInsuranceGL(
    ctx: FleetGLContext,
    insurance: { id: number; vehicleId: number; premium: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_insurance_expense", "debit", "6330"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_insurance_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-INS-${insurance.id}`,
      description: `تأمين مركبة #${insurance.vehicleId}`,
      type: "general",
      sourceType: "fleet_insurance_policies",
      sourceId: insurance.id,
      sourceKey: `fleet:insurance:${insurance.id}`,
      guardTable: "fleet_insurance_policies",
      guardId: insurance.id,
      lines: [
        { accountCode: debitCode, debit: insurance.premium, credit: 0, description: "قسط تأمين", vehicleId: insurance.vehicleId },
        { accountCode: creditCode, debit: 0, credit: insurance.premium, description: "مستحقات تأمين", vehicleId: insurance.vehicleId },
      ],
    });
  }

  async postTrafficViolationGL(
    ctx: FleetGLContext,
    violation: { id: number; vehicleId: number; driverId?: number; amount: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_violation_expense", "debit", "6340"),
      financialEngine.resolveAccountCode(ctx.companyId, "fleet_violation_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-VIOL-${violation.id}`,
      description: `مخالفة مرورية — مركبة #${violation.vehicleId}`,
      type: "general",
      sourceType: "fleet_traffic_violations",
      sourceId: violation.id,
      sourceKey: `fleet:violation:${violation.id}`,
      guardTable: "fleet_traffic_violations",
      guardId: violation.id,
      lines: [
        { accountCode: debitCode, debit: violation.amount, credit: 0, description: "مخالفة مرورية", vehicleId: violation.vehicleId, driverId: violation.driverId },
        { accountCode: creditCode, debit: 0, credit: violation.amount, description: "مستحقات مخالفة", vehicleId: violation.vehicleId },
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
