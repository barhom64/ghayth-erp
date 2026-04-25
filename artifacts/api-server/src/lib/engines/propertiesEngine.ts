// ─── Properties Engine — محرك العقارات ───────────────────────────────────
// Encapsulates property-domain operations that touch financial boundaries.
// Rent collection, maintenance costs, contract settlements — all GL posting
// goes through the Financial Engine.
//
// Also handles invoice creation properly by emitting events instead of
// writing directly to the finance-owned invoices table.

import { financialEngine } from "./financialEngine.js";
import { eventBus } from "../eventBus.js";
import { rawExecute } from "../rawdb.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface PropertyGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class PropertiesEngineImpl implements DomainEngine {
  readonly domainId = "property";
  readonly label = "إدارة العقارات";

  async postRentRevenueGL(
    ctx: PropertyGLContext,
    payment: {
      id: number;
      contractId: number;
      propertyId: number;
      amount: number;
      vatAmount?: number;
      tenantId?: number;
    }
  ) {
    const [debitCode, creditCode, vatCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "rent_receivable", "debit", "1200"),
      financialEngine.resolveAccountCode(ctx.companyId, "rent_revenue", "credit", "4100"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_output", "credit", "2200"),
    ]);

    const lines = [
      {
        accountCode: debitCode,
        debit: payment.amount + (payment.vatAmount ?? 0),
        credit: 0,
        description: `إيجار — عقد #${payment.contractId}`,
        propertyId: payment.propertyId,
        contractId: payment.contractId,
        clientId: payment.tenantId,
      },
      {
        accountCode: creditCode,
        debit: 0,
        credit: payment.amount,
        description: `إيرادات إيجار — عقد #${payment.contractId}`,
        propertyId: payment.propertyId,
        contractId: payment.contractId,
      },
    ];

    if (payment.vatAmount && payment.vatAmount > 0) {
      lines.push({
        accountCode: vatCode,
        debit: 0,
        credit: payment.vatAmount,
        description: `ضريبة القيمة المضافة — إيجار`,
        propertyId: payment.propertyId,
        contractId: payment.contractId,
      });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-RENT-${payment.id}`,
      description: `تحصيل إيجار — عقد #${payment.contractId} — عقار #${payment.propertyId}`,
      type: "general",
      sourceType: "rent_payments",
      sourceId: payment.id,
      sourceKey: `property:rent:${payment.id}`,
      guardTable: "rent_payments",
      guardId: payment.id,
      lines,
    });
  }

  async postMaintenanceExpenseGL(
    ctx: PropertyGLContext,
    maintenance: {
      id: number;
      propertyId: number;
      totalCost: number;
      type?: string;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_maintenance_expense", "debit", "6400"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_maintenance_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-PMAINT-${maintenance.id}`,
      description: `صيانة عقار #${maintenance.propertyId} — ${maintenance.type ?? "عامة"}`,
      type: "general",
      sourceType: "maintenance_requests",
      sourceId: maintenance.id,
      sourceKey: `property:maintenance:${maintenance.id}`,
      guardTable: "maintenance_requests",
      guardId: maintenance.id,
      lines: [
        { accountCode: debitCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, propertyId: maintenance.propertyId },
        { accountCode: creditCode, debit: 0, credit: maintenance.totalCost, description: "مستحقات صيانة", propertyId: maintenance.propertyId },
      ],
    });
  }

  async postSecurityDepositGL(
    ctx: PropertyGLContext,
    deposit: {
      id: number;
      contractId: number;
      propertyId: number;
      amount: number;
      type: "received" | "refunded";
    }
  ) {
    const [depositLiability, cashAccount] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "security_deposit_liability", "credit", "2300"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_cash", "debit", "1100"),
    ]);

    const isReceived = deposit.type === "received";

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-DEP-${deposit.id}`,
      description: `${isReceived ? "استلام" : "رد"} تأمين — عقد #${deposit.contractId}`,
      type: "general",
      sourceType: "property_security_deposits",
      sourceId: deposit.id,
      sourceKey: `property:deposit:${deposit.id}:${deposit.type}`,
      guardTable: "property_security_deposits",
      guardId: deposit.id,
      lines: [
        {
          accountCode: cashAccount,
          debit: isReceived ? deposit.amount : 0,
          credit: isReceived ? 0 : deposit.amount,
          description: `${isReceived ? "استلام" : "صرف"} تأمين`,
          propertyId: deposit.propertyId,
          contractId: deposit.contractId,
        },
        {
          accountCode: depositLiability,
          debit: isReceived ? 0 : deposit.amount,
          credit: isReceived ? deposit.amount : 0,
          description: `التزام تأمين — عقد #${deposit.contractId}`,
          propertyId: deposit.propertyId,
          contractId: deposit.contractId,
        },
      ],
    });
  }

  async postEarlyTerminationGL(
    ctx: PropertyGLContext,
    termination: {
      contractId: number;
      propertyId: number;
      penaltyAmount: number;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "rent_receivable", "debit", "1200"),
      financialEngine.resolveAccountCode(ctx.companyId, "early_termination_revenue", "credit", "4150"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-TERM-${termination.contractId}`,
      description: `غرامة إنهاء مبكر — عقد #${termination.contractId}`,
      type: "general",
      sourceType: "rental_contracts",
      sourceId: termination.contractId,
      sourceKey: `property:termination:${termination.contractId}`,
      guardTable: "rental_contracts",
      guardId: termination.contractId,
      lines: [
        { accountCode: debitCode, debit: termination.penaltyAmount, credit: 0, description: "ذمم غرامة إنهاء مبكر", propertyId: termination.propertyId, contractId: termination.contractId },
        { accountCode: creditCode, debit: 0, credit: termination.penaltyAmount, description: "إيرادات غرامة إنهاء مبكر", propertyId: termination.propertyId, contractId: termination.contractId },
      ],
    });
  }

  async postBuildingAssetGL(
    ctx: PropertyGLContext,
    building: { id: number; purchasePrice: number; name: string }
  ) {
    const [assetCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_asset", "debit", "1520"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_asset", "credit", "1100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `BLDG-${building.id}`,
      description: `إثبات أصل عقاري — ${building.name}`,
      type: "general",
      sourceType: "property_building",
      sourceId: building.id,
      sourceKey: `property:building_asset:${building.id}`,
      guardTable: "property_buildings",
      guardId: building.id,
      lines: [
        { accountCode: assetCode, debit: building.purchasePrice, credit: 0, propertyId: building.id },
        { accountCode: cashCode, debit: 0, credit: building.purchasePrice },
      ],
    });
  }

  async postInstallmentPaymentGL(
    ctx: PropertyGLContext,
    payment: {
      installmentId: number;
      contractId: number;
      unitId?: number;
      amount: number;
      method?: string;
      description?: string;
    }
  ) {
    const cashDefault = payment.method === "cash" ? "1100" : "1110";
    const [cashCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "rental_cash_receipt", "debit", cashDefault),
      financialEngine.resolveAccountCode(ctx.companyId, "rental_revenue", "credit", "4100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `RENT-SCH-${payment.installmentId}`,
      description: payment.description ?? `تحصيل قسط إيجار #${payment.installmentId}`,
      type: "general",
      sourceType: "rent_payment",
      sourceId: payment.installmentId,
      sourceKey: `property:installment:${payment.installmentId}`,
      guardTable: "property_contracts",
      guardId: payment.contractId,
      lines: [
        { accountCode: cashCode, debit: payment.amount, credit: 0, propertyId: payment.unitId, contractId: payment.contractId },
        { accountCode: revenueCode, debit: 0, credit: payment.amount, propertyId: payment.unitId, contractId: payment.contractId },
      ],
    });
  }

  /**
   * Request invoice creation from the Finance domain.
   * Instead of writing directly to the finance-owned invoices table,
   * emit an event that Finance can process.
   */
  async requestInvoiceCreation(
    ctx: PropertyGLContext,
    params: {
      clientId?: number;
      ref: string;
      description: string;
      subtotal: number;
      vatAmount: number;
      total: number;
      dueDate: string;
      sourceType: string;
      sourceId: number;
    }
  ) {
    eventBus.emit("property.invoice.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });

    return { requested: true };
  }

  async requestFixedAssetRegistration(
    ctx: PropertyGLContext,
    asset: {
      buildingId: number;
      code: string;
      name: string;
      description: string;
      purchaseDate: string;
      purchaseCost: number;
      salvageValue: number;
      usefulLifeYears: number;
      assetAccountCode: string;
      depreciationAccountCode: string;
      accDepreciationAccountCode: string;
    }
  ) {
    eventBus.emit("finance.fixed_asset.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      category: "عقارات",
      ...asset,
    });
    return { requested: true };
  }

  async requestLegalCaseCreation(
    ctx: PropertyGLContext,
    params: {
      caseNumber: string;
      title: string;
      caseType: string;
      opposingParty: string;
      lawyerName: string | null;
      description: string;
      priority: string;
    }
  ) {
    eventBus.emit("property.legal_case.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });
    return { requested: true };
  }
}

export const propertiesEngine = new PropertiesEngineImpl();
