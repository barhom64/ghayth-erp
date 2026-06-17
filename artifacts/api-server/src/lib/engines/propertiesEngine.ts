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
      financialEngine.resolveAccountCode(ctx.companyId, "rent_receivable", "debit", "1132"),
      financialEngine.resolveAccountCode(ctx.companyId, "rent_revenue", "credit", "4121"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_output", "credit", "2131"),
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
        clientId: payment.tenantId,
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
        clientId: payment.tenantId,
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
      /** property_buildings.id — the parent building the maintenance ran on. */
      propertyId: number;
      /** property_units.id — the specific unit (sub-property) being maintained. */
      unitId?: number | null;
      /** clients.id of the tenant assigned to the unit at maintenance time. */
      tenantId?: number | null;
      totalCost: number;
      type?: string;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_maintenance_expense", "debit", "5610"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_maintenance_payable", "credit", "2150"),
    ]);

    // Carry unitId + clientId on every line — caller (properties.ts:complete)
    // pulls unitId from maintenance_requests and tenantId from the active
    // rental_contract assigned to that unit. Per-unit / per-tenant maintenance
    // cost drilldowns rely on these dims; without them, the entity-360
    // financial profile for both unit and tenant came back empty.
    const unitId = maintenance.unitId ?? undefined;
    const clientId = maintenance.tenantId ?? undefined;

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
        { accountCode: debitCode, debit: maintenance.totalCost, credit: 0, description: `صيانة — ${maintenance.type ?? "عامة"}`, propertyId: maintenance.propertyId, unitId, clientId },
        { accountCode: creditCode, debit: 0, credit: maintenance.totalCost, description: "مستحقات صيانة", propertyId: maintenance.propertyId, unitId, clientId },
      ],
    });
  }

  /**
   * postMaintenanceOwnerBillingGL — maintenance billed to a
   * third-party owner.
   *
   * Per the doctrine: maintenance falls on the OWNER. If we OWN the
   * property → `postMaintenanceExpenseGL` already handles it (debits
   * a property maintenance expense). But when we MANAGE a property
   * for a third party, the maintenance cost is a receivable from
   * that owner — they will pay us via a tax invoice we issue.
   *
   * Bookkeeping:
   *   - DR property_owner_receivable     = cost + VAT (gross)
   *   - CR property_maintenance_payable  = cost (net) — what we owe
   *     the vendor / our maintenance team
   *   - CR vat_output                    = VAT (when applicable)
   *
   * The routing decision (which of the two engine methods to call)
   * is the route's concern: it reads property_buildings.ownerType or
   * rental_contracts.contractType='management' and picks. PR-7b
   * wires that. This method only owns the GL contract.
   *
   * Account codes resolve through `resolveAccountCode`, so an
   * operator's `accounting_mappings` row beats the engine's
   * fallbacks (1131 owner receivable / 2150 accrued-expenses payable / 2131 VAT).
   *
   * Idempotency: `guardTable=maintenance_requests` + `guardId=id`
   * AND a `sourceKey` that DIFFERS from the company-paid path
   * (`property:maintenance:<id>` vs `property:maintenance_owner:<id>`)
   * so a maintenance request that gets reclassified from "we pay"
   * to "owner pays" correctly posts a NEW entry — the dedupe guard
   * treats them as distinct events rather than colliding.
   */
  async postMaintenanceOwnerBillingGL(
    ctx: PropertyGLContext,
    maintenance: {
      /** maintenance_requests.id — identifies the source request.
       *  Used as sourceId, guardId, and inside sourceKey. */
      id: number;
      /** property_buildings.id — for per-property AR drilldowns. */
      propertyId: number;
      /** property_units.id — when the maintenance is unit-scoped
       *  (not building-wide). Optional. */
      unitId?: number | null;
      /** clients.id of the third-party owner being billed. Carried
       *  on every line so owner AR aging aggregates straight from
       *  journal_lines (filter by accountCode=1141 + clientId). */
      ownerId: number;
      /** Net cost owed to the maintenance vendor / our team. */
      totalCost: number;
      /** Optional VAT on the tax invoice issued to the owner. The
       *  rate/decision live on the route (PR-7b will read
       *  getCompanyVatRate + owner.vatRegistered for the call). */
      vatAmount?: number;
      /** Free-form maintenance type for description text. */
      type?: string;
    },
  ) {
    const vatAmount = maintenance.vatAmount ?? 0;
    const hasVat = vatAmount > 0;

    const [receivableCode, payableCode, vatCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_owner_receivable", "debit", "1131"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_maintenance_payable", "credit", "2150"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_output", "credit", "2131"),
    ]);

    const unitId = maintenance.unitId ?? undefined;
    const clientId = maintenance.ownerId;
    const description = `صيانة عقار — ${maintenance.type ?? "عامة"} (على المالك)`;

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
      propertyId?: number;
      unitId?: number;
      clientId?: number;
    }> = [
      {
        accountCode: receivableCode,
        debit: maintenance.totalCost + vatAmount,
        credit: 0,
        description,
        propertyId: maintenance.propertyId,
        unitId,
        clientId,
      },
      {
        accountCode: payableCode,
        debit: 0,
        credit: maintenance.totalCost,
        description: "مستحقات صيانة",
        propertyId: maintenance.propertyId,
        unitId,
        clientId,
      },
    ];

    if (hasVat) {
      lines.push({
        accountCode: vatCode,
        debit: 0,
        credit: vatAmount,
        description: `ضريبة القيمة المضافة — صيانة محمّلة على المالك`,
        propertyId: maintenance.propertyId,
        unitId,
        clientId,
      });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-MAINT-OWNER-${maintenance.id}`,
      description: `صيانة عقار #${maintenance.propertyId} — ${maintenance.type ?? "عامة"} — على المالك`,
      type: "general",
      sourceType: "maintenance_requests",
      sourceId: maintenance.id,
      sourceKey: `property:maintenance_owner:${maintenance.id}`,
      guardTable: "maintenance_requests",
      guardId: maintenance.id,
      lines,
    });
  }

  async postSecurityDepositGL(
    ctx: PropertyGLContext,
    deposit: {
      id: number;
      contractId: number;
      propertyId: number;
      /** clients.id of the tenant — deposit is a per-tenant liability,
       *  so the tenant subledger must carry it. */
      tenantId?: number | null;
      amount: number;
      type: "received" | "refunded";
    }
  ) {
    const [depositLiability, cashAccount] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "security_deposit_liability", "credit", "2170"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_cash", "debit", "1111"),
    ]);

    const isReceived = deposit.type === "received";
    // clientId — tenant subledger. Without this, AR aging + tenant
    // financial profile showed no liability for the held deposit; the
    // liability sat in 2300 with no per-tenant breakdown.
    const clientId = deposit.tenantId ?? undefined;

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      // ref carries the deposit direction (received / refunded) the same
      // way sourceKey does — otherwise the refund call collides with the
      // receive call on `uniq_journal_entries_ref` because both share the
      // same deposit.id. Caught live by the extended rent journey
      // (verify-property-rent-journey.sh) when the refund step started
      // returning 502 with "duplicate key value violates unique
      // constraint uniq_journal_entries_ref".
      ref: `JE-DEP-${deposit.id}-${deposit.type === "received" ? "R" : "F"}`,
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
          clientId,
        },
        {
          accountCode: depositLiability,
          debit: isReceived ? 0 : deposit.amount,
          credit: isReceived ? deposit.amount : 0,
          description: `التزام تأمين — عقد #${deposit.contractId}`,
          propertyId: deposit.propertyId,
          contractId: deposit.contractId,
          clientId,
        },
      ],
    });
  }

  async postEarlyTerminationGL(
    ctx: PropertyGLContext,
    termination: {
      contractId: number;
      propertyId: number;
      /** clients.id of the tenant — penalty receivable should land in the
       *  tenant subledger so AR aging reflects it. */
      tenantId?: number | null;
      penaltyAmount: number;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "rent_receivable", "debit", "1132"),
      // Service revenue (4130) — aligns with migration 342's accounting_mappings
      // seed. An early-termination penalty is property service income, NOT fleet
      // revenue; the prior "4150" (Fleet/Transport Revenue) fallback mis-classified
      // it for tenants lacking the seeded mapping.
      financialEngine.resolveAccountCode(ctx.companyId, "early_termination_revenue", "credit", "4130"),
    ]);

    const clientId = termination.tenantId ?? undefined;

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
        { accountCode: debitCode, debit: termination.penaltyAmount, credit: 0, description: "ذمم غرامة إنهاء مبكر", propertyId: termination.propertyId, contractId: termination.contractId, clientId },
        { accountCode: creditCode, debit: 0, credit: termination.penaltyAmount, description: "إيرادات غرامة إنهاء مبكر", propertyId: termination.propertyId, contractId: termination.contractId, clientId },
      ],
    });
  }

  async postBuildingAssetGL(
    ctx: PropertyGLContext,
    building: { id: number; purchasePrice: number; name: string }
  ) {
    const [assetCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_asset", "debit", "1240"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_purchase_cash", "credit", "1111"),
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
        { accountCode: cashCode, debit: 0, credit: building.purchasePrice, propertyId: building.id },
      ],
    });
  }

  /**
  /**
   * postManagementCollectionGL — collection on a managed contract.
   *
   * The third Properties activity branch (#1999, contractType=management).
   * We collect rent on behalf of a third-party owner and keep a
   * commission. The rent is NOT our revenue; the commission is.
   *
   * Splits the cash receipt three ways:
   *   - DR property_cash               (gross rent — what the bank shows)
   *   - CR property_owner_payable      (rent − commission — what we owe
   *     the owner, the line the periodic owner statement aggregates)
   *   - CR property_management_commission (commission — OUR revenue)
   *
   * The commission rate is per-contract and lives in the data layer —
   * the engine just takes a resolved commission amount. The route adds
   * a column to rental_contracts in PR-6b and multiplies before calling.
   * Account codes resolve through `resolveAccountCode`; the fallbacks
   * (1100 cash / 2150 owner payable / 4130 commission revenue) only
   * fire when a tenant hasn't seeded a mapping.
   *
   * Dimensions: every line carries propertyId + contractId. The CASH
   * line is tagged with the tenant's clientId (per-tenant collection
   * drilldowns); the OWNER PAYABLE line is tagged with the owner's
   * clientId so the owner statement aggregates straight from
   * journal_lines.
   *
   * Zero-commission edge case: an introductory month / pro-bono
   * arrangement passes commissionAmount=0; the engine omits the
   * commission line entirely (financialEngine rejects zero-amount
   * lines as a balanced-pair safeguard).
   *
   * Idempotency: guardTable=property_management_collections +
   * guardId=collection.id so a double-post surfaces as a unique
   * violation against the future collection row's id.
   */
  async postManagementCollectionGL(
    ctx: PropertyGLContext,
    collection: {
      id: number;
      contractId: number;
      propertyId: number;
      ownerId: number;
      tenantId: number;
      rentAmount: number;
      commissionAmount: number;
    },
  ) {
    const [cashCode, ownerPayableCode, commissionCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_cash", "debit", "1111"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_owner_payable", "credit", "2150"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_management_commission", "credit", "4130"),
    ]);

    const ownerShare = collection.rentAmount - collection.commissionAmount;

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
      propertyId?: number;
      contractId?: number;
      clientId?: number;
    }> = [
      {
        accountCode: cashCode,
        debit: collection.rentAmount,
        credit: 0,
        description: `تحصيل إيجار — عقد إدارة #${collection.contractId}`,
        propertyId: collection.propertyId,
        contractId: collection.contractId,
        clientId: collection.tenantId,
      },
      {
        accountCode: ownerPayableCode,
        debit: 0,
        credit: ownerShare,
        description: `مستحق للمالك — عقد إدارة #${collection.contractId}`,
        propertyId: collection.propertyId,
        contractId: collection.contractId,
        clientId: collection.ownerId,
      },
    ];

    if (collection.commissionAmount > 0) {
      lines.push({
        accountCode: commissionCode,
        debit: 0,
        credit: collection.commissionAmount,
        description: `عمولة إدارة عقار`,
        propertyId: collection.propertyId,
        contractId: collection.contractId,
      });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-MGMT-${collection.id}`,
      description: `تحصيل عقد إدارة #${collection.contractId} — عقار #${collection.propertyId}`,
      type: "general",
      sourceType: "property_management_collections",
      sourceId: collection.id,
      sourceKey: `property:mgmt_collection:${collection.id}`,
      guardTable: "property_management_collections",
      guardId: collection.id,
      lines,
    });
  }

  /**
   * postSaleGL — property disposal at sale.
   *
   * The fourth Properties activity branch (#1999). Removes the building
   * asset from the books at its CARRYING VALUE (book value — credit to
   * the asset account), debits the buyer's receivable for the full
   * sale price (gross — including VAT when commercial), and recognises
   * the realised gain or loss as the delta between net sale price and
   * book value.
   */
  async postSaleGL(
    ctx: PropertyGLContext,
    sale: {
      id: number;
      propertyId: number;
      buyerId: number | null;
      salePrice: number;
      bookValue: number;
      vatAmount?: number;
      saleDate: string;
    },
  ) {
    const vatAmount = sale.vatAmount ?? 0;
    const netSalePrice = sale.salePrice - vatAmount;
    const gainOrLoss = netSalePrice - sale.bookValue;
    const hasGain = gainOrLoss > 0;
    const hasLoss = gainOrLoss < 0;
    const hasVat = vatAmount > 0;

    const [
      receivableCode,
      assetCode,
      gainCode,
      lossCode,
      vatCode,
    ] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_sale_receivable", "debit", "1131"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_asset", "credit", "1240"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_sale_gain", "credit", "4910"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_sale_loss", "debit", "5810"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_output", "credit", "2131"),
    ]);

    const lineDims = {
      propertyId: sale.propertyId,
      clientId: sale.buyerId ?? undefined,
    };

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
      propertyId?: number;
      clientId?: number;
    }> = [
      {
        accountCode: receivableCode,
        debit: sale.salePrice,
        credit: 0,
        description: `بيع عقار — مستحق على المشتري`,
        ...lineDims,
      },
      {
        accountCode: assetCode,
        debit: 0,
        credit: sale.bookValue,
        description: `استبعاد أصل عقاري بالقيمة الدفترية`,
        ...lineDims,
      },
    ];

    if (hasVat) {
      lines.push({
        accountCode: vatCode,
        debit: 0,
        credit: vatAmount,
        description: `ضريبة القيمة المضافة — بيع عقار`,
        ...lineDims,
      });
    }

    if (hasGain) {
      lines.push({
        accountCode: gainCode,
        debit: 0,
        credit: gainOrLoss,
        description: `مكسب بيع أصل عقاري`,
        ...lineDims,
      });
    } else if (hasLoss) {
      lines.push({
        accountCode: lossCode,
        debit: -gainOrLoss,
        credit: 0,
        description: `خسارة بيع أصل عقاري`,
        ...lineDims,
      });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-SALE-${sale.id}`,
      description: `بيع عقار #${sale.propertyId} بتاريخ ${sale.saleDate}`,
      type: "general",
      sourceType: "property_sales",
      sourceId: sale.id,
      sourceKey: `property:sale:${sale.id}`,
      guardTable: "property_sales",
      guardId: sale.id,
      lines,
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
      /** Tenant FK so per-tenant AR + rent revenue reports tie out from the GL. */
      tenantId?: number;
    }
  ) {
    const cashDefault = payment.method === "cash" ? "1100" : "1110";
    const [cashCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "rental_cash_receipt", "debit", cashDefault),
      financialEngine.resolveAccountCode(ctx.companyId, "rental_revenue", "credit", "4121"),
    ]);

    // unitId belongs in the unitId slot. The previous shape wrote
    // `propertyId: payment.unitId` — semantic bug because unitId points
    // to property_units while propertyId points to property_buildings
    // (different FK targets). Per-unit rent revenue reports drilled into
    // the wrong table.
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
        { accountCode: cashCode, debit: payment.amount, credit: 0, unitId: payment.unitId, contractId: payment.contractId, clientId: payment.tenantId },
        { accountCode: revenueCode, debit: 0, credit: payment.amount, unitId: payment.unitId, contractId: payment.contractId, clientId: payment.tenantId },
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
    }
  ) {
    const [assetAccountCode, depreciationAccountCode, accDepreciationAccountCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "property_building_asset", "debit", "1240"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_depreciation", "debit", "5740"),
      financialEngine.resolveAccountCode(ctx.companyId, "property_acc_depreciation", "credit", "1241"),
    ]);

    eventBus.emit("finance.fixed_asset.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      category: "عقارات",
      assetAccountCode,
      depreciationAccountCode,
      accDepreciationAccountCode,
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

  /**
   * Post the cash leg of an owner payout — the reciprocal of the
   * commission/management-fee accruals that build up during the month
   * from postRentRevenueGL.
   *
   *   Dr owner_payable  (clear the liability we owe the owner)
   *   Cr cash           (treasury pays out)
   *
   * sourceKey includes the period so a redo of the same period (after
   * the payout was soft-deleted and re-recorded) ends up as a fresh
   * journal entry, not a no-op at the financialEngine dedup layer.
   * postOwnerPayoutGL is called from POST /properties/owners/:id/payouts
   * with the payout row's id appended so each correction gets its own
   * traceable JE.
   */
  async postOwnerPayoutGL(
    ctx: PropertyGLContext,
    payout: {
      payoutId: number;
      ownerId: number;
      period: string;
      amount: number;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "owner_payable", "debit", "2150"),
      financialEngine.resolveAccountCode(ctx.companyId, "cash", "credit", "1111"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-OWNERPAY-${payout.payoutId}`,
      description: `سداد مستحقات مالك العقار #${payout.ownerId} عن ${payout.period}`,
      type: "general",
      sourceType: "property_owner_payouts",
      sourceId: payout.payoutId,
      sourceKey: `property:owner_payout:${payout.payoutId}`,
      guardTable: "property_owner_payouts",
      guardId: payout.payoutId,
      lines: [
        {
          accountCode: debitCode,
          debit: payout.amount,
          credit: 0,
          description: `إقفال مستحقات المالك — ${payout.period}`,
        },
        {
          accountCode: creditCode,
          debit: 0,
          credit: payout.amount,
          description: `سداد نقدي للمالك`,
        },
      ],
    });
  }
}

export const propertiesEngine = new PropertiesEngineImpl();
