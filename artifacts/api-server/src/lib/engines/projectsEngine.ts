// ─── Projects Engine — محرك المشاريع ────────────────────────────────────
// Encapsulates project-domain GL operations — WIP costs, project closure, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus.js";
import { rawExecute } from "../rawdb.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface ProjectsGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class ProjectsEngineImpl implements DomainEngine {
  readonly domainId = "projects";
  readonly label = "إدارة المشاريع";

  async postProjectCostGL(
    ctx: ProjectsGLContext,
    cost: {
      id: number;
      projectId: number;
      projectName: string;
      amount: number;
      description: string;
      sourceType?: string;
    }
  ) {
    const srcType = String(cost.sourceType || "cash").toLowerCase();
    let creditFallback = "1100";
    if (srcType === "ap" || srcType === "vendor" || srcType === "supplier" || srcType === "invoice")
      creditFallback = "2100";
    else if (srcType === "inventory" || srcType === "material" || srcType === "materials" || srcType === "stock")
      // Task #190 fix: 1300 doesn't exist in the seeded chart_of_accounts.
      // 1150 ("المخزون") is the canonical inventory asset code.
      creditFallback = "1151";

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "project_wip", "debit", "1270"),
      financialEngine.resolveAccountCode(ctx.companyId, "project_cost_cash", "credit", creditFallback),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PROJ-COST-${cost.id}`,
      description: `تكلفة مشروع "${cost.projectName}" — ${cost.description}`,
      type: "general",
      sourceType: "project_cost",
      sourceId: cost.id,
      sourceKey: `project:cost:${cost.id}`,
      guardTable: "project_costs",
      guardId: cost.id,
      lines: [
        { accountCode: debitCode, debit: cost.amount, credit: 0, projectId: cost.projectId, description: cost.description },
        { accountCode: creditCode, debit: 0, credit: cost.amount, projectId: cost.projectId },
      ],
    });
  }

  async postProjectClosureGL(
    ctx: ProjectsGLContext,
    closure: {
      projectId: number;
      projectName: string;
      totalWip: number;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "project_cost_transfer", "debit", "5130"),
      financialEngine.resolveAccountCode(ctx.companyId, "project_cost_transfer", "credit", "1270"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PROJ-CLOSE-${closure.projectId}`,
      description: `إقفال مشروع "${closure.projectName}" — تحويل WIP ${closure.totalWip.toFixed(2)} ريال إلى تكلفة المشاريع`,
      type: "general",
      sourceType: "project_closure",
      sourceId: closure.projectId,
      sourceKey: `project:closure:${closure.projectId}`,
      guardTable: "projects",
      guardId: closure.projectId,
      lines: [
        { accountCode: debitCode, debit: closure.totalWip, credit: 0, projectId: closure.projectId, description: "تحويل WIP إلى تكلفة المشروع" },
        { accountCode: creditCode, debit: 0, credit: closure.totalWip, projectId: closure.projectId },
      ],
    });
  }

  // Development-unit sale (Wave C.2): move the unit's snapshotted cost basis
  // out of WIP into cost-of-sales, so profit = sale invoice − this COGS.
  // Account choice stays a finance decision via accounting_mappings —
  // migration 289 seeds dev_unit_cogs per company (5130 full COA / 5225 thin /
  // 5110 both). The 5110 fallback below exists postable on BOTH seeded COAs
  // (verified live: 5225 is absent from the full COA and 500'd).
  async postUnitSaleCogsGL(
    ctx: ProjectsGLContext,
    sale: {
      unitId: number;
      unitName: string;
      projectId: number;
      projectName: string;
      costBasis: number;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "dev_unit_cogs", "debit", "5110"),
      financialEngine.resolveAccountCode(ctx.companyId, "project_wip", "credit", "1270"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PROJ-UNIT-SALE-${sale.unitId}`,
      description: `بيع وحدة تطوير "${sale.unitName}" — مشروع "${sale.projectName}": ترحيل أساس التكلفة ${sale.costBasis.toFixed(2)} ريال من WIP إلى تكلفة المبيعات`,
      type: "general",
      sourceType: "dev_unit_sale",
      sourceId: sale.unitId,
      sourceKey: `project:unit_sale:${sale.unitId}`,
      guardTable: "development_units",
      guardId: sale.unitId,
      lines: [
        { accountCode: debitCode, debit: sale.costBasis, credit: 0, projectId: sale.projectId, description: `تكلفة وحدة مباعة "${sale.unitName}"` },
        { accountCode: creditCode, debit: 0, credit: sale.costBasis, projectId: sale.projectId },
      ],
    });
  }

  async requestInvoiceCreation(
    ctx: ProjectsGLContext,
    params: {
      clientId: number;
      ref: string;
      description: string;
      subtotal: number;
      vatAmount: number;
      total: number;
      dueDate: string;
      sourceType: string;
      sourceId: number;
      // Optional line-item billing (BOQ): the invoice handler creates one
      // invoice_line per entry and stamps the source BOQ items with the new id.
      projectId?: number;
      lines?: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
      boqItemIds?: number[];
      devUnitIds?: number[];
    }
  ) {
    eventBus.emit("project.invoice.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });
    return { requested: true };
  }

  async reassignTasks(params: {
    fromEmployeeQuery: { table: string; idColumn: string; id: number };
    toEmployeeQuery: { table: string; idColumn: string; id: number };
    startDate: string;
    endDate: string;
  }): Promise<void> {
    await rawExecute(
      `UPDATE project_tasks SET "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1)
       WHERE "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $2)
         AND status NOT IN ('completed','cancelled')
         AND ("dueDate" IS NULL OR "dueDate" BETWEEN $3 AND $4)
         AND "deletedAt" IS NULL`,
      [params.toEmployeeQuery.id, params.fromEmployeeQuery.id, params.startDate, params.endDate]
    ).catch((e) => logger.error(e, "project task reassignment failed"));
  }
}

export const projectsEngine = new ProjectsEngineImpl();
