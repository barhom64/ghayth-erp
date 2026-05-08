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
      creditFallback = "1300";

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "project_wip", "debit", "1350"),
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
      financialEngine.resolveAccountCode(ctx.companyId, "project_cost_transfer", "debit", "5225"),
      financialEngine.resolveAccountCode(ctx.companyId, "project_cost_transfer", "credit", "1350"),
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
