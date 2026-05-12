import type { Request, Response, NextFunction } from "express";
import { eventBus } from "../lib/eventBus.js";
import { pool } from "../lib/rawdb.js";
import { computeDiff } from "../lib/auditDiff.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ENTITY_MAP: Record<string, string> = {
  "/employees": "employee",
  "/clients": "client",
  "/invoices": "invoice",
  "/finance/invoices": "invoice",
  "/finance/vouchers": "voucher",
  "/finance/expenses": "expense",
  "/finance/purchase-requests": "purchase_request",
  "/finance/purchase-orders": "purchase_order",
  "/finance/salary-advances": "salary_advance",
  "/finance/custodies": "custody",
  "/finance/vendors": "vendor",
  "/finance/budget": "budget",
  "/finance/fixed-assets": "fixed_asset",
  "/hr/leaves": "leave_request",
  "/hr/leave-requests": "leave_request",
  "/hr/check-in": "attendance",
  "/hr/check-out": "attendance",
  "/hr/violations": "violation",
  "/hr/official-letters": "official_letter",
  "/hr/performance": "performance",
  "/hr/payroll": "payroll_run",
  "/hr/evaluation-cycles": "evaluation_cycle",
  "/hr/loans": "loan",
  "/hr/training": "training_program",
  "/tasks": "task",
  "/projects": "project",
  "/support": "support_ticket",
  "/fleet/trips": "trip",
  "/fleet/vehicles": "vehicle",
  "/fleet/maintenance": "maintenance",
  "/fleet/fuel-logs": "fuel_log",
  "/warehouse/products": "warehouse_product",
  "/warehouse/movements": "warehouse_movement",
  "/crm/opportunities": "crm_opportunity",
  "/crm/activities": "crm_activity",
  "/settings/companies": "company",
  "/settings/branches": "branch",
  "/requests": "request",
  "/communications": "communication",
  "/correspondence": "correspondence",
  "/properties": "property",
};

const ENTITY_TABLE_MAP: Record<string, string> = {
  employee: "employees",
  client: "clients",
  invoice: "invoices",
  voucher: "vouchers",
  expense: "expenses",
  purchase_request: "purchase_requests",
  purchase_order: "purchase_orders",
  salary_advance: "salary_advances",
  custody: "custodies",
  vendor: "vendors",
  leave_request: "hr_leave_requests",
  attendance: "attendance",
  violation: "hr_violations",
  official_letter: "hr_official_letters",
  performance: "hr_performance_reviews",
  payroll_run: "payroll_runs",
  evaluation_cycle: "evaluation_cycles",
  loan: "hr_employee_loans",
  training_program: "training_programs",
  budget: "budgets",
  fixed_asset: "fixed_assets",
  correspondence: "correspondence",
  task: "tasks",
  project: "projects",
  support_ticket: "support_tickets",
  trip: "fleet_trips",
  vehicle: "fleet_vehicles",
  maintenance: "fleet_maintenance",
  fuel_log: "fleet_fuel_logs",
  warehouse_product: "warehouse_products",
  warehouse_movement: "warehouse_movements",
  crm_opportunity: "crm_opportunities",
  crm_activity: "crm_activities",
  company: "companies",
  branch: "branches",
  request: "requests",
  communication: "communications_log",
  property: "property_units",
};

function resolveEntity(path: string): string | null {
  const normalizedPath = path.startsWith("/api") ? path.slice(4) : path;
  for (const [prefix, entity] of Object.entries(ENTITY_MAP)) {
    if (normalizedPath === prefix || normalizedPath.startsWith(prefix + "/")) {
      return entity;
    }
  }
  return null;
}

const APPROVAL_ACTIONS = ["approve", "reject", "return", "escalate", "cancel"];

function resolveAction(method: string, path?: string): string {
  if (path) {
    const segments = path.replace(/^\/+|\/+$/g, "").split("/");
    const lastSegment = segments[segments.length - 1]?.toLowerCase();
    if (lastSegment && APPROVAL_ACTIONS.includes(lastSegment)) {
      return lastSegment;
    }
  }
  switch (method) {
    case "POST": return "create";
    case "PUT":
    case "PATCH": return "update";
    case "DELETE": return "delete";
    default: return "unknown";
  }
}

function extractEntityId(req: Request, path: string): string | null {
  const normalizedPath = path.startsWith("/api") ? path.slice(4) : path;
  for (const prefix of Object.keys(ENTITY_MAP)) {
    if (normalizedPath.startsWith(prefix + "/")) {
      const rest = normalizedPath.slice(prefix.length + 1);
      const segment = rest.split("/")[0];
      if (segment && /^\d+$/.test(segment)) return segment;
    }
  }
  const paramId = req.params?.id;
  if (Array.isArray(paramId)) return paramId[0] || null;
  return paramId || null;
}

async function fetchBeforeState(entity: string, entityId: string, companyId?: number): Promise<Record<string, unknown> | null> {
  const tableName = ENTITY_TABLE_MAP[entity];
  if (!tableName || !entityId) return null;

  try {
    const conditions = [`id = $1`];
    const params: any[] = [entityId];
    if (companyId) {
      conditions.push(`"companyId" = $2`);
      params.push(companyId);
    }
    const { rows } = await pool.query(
      `SELECT * FROM ${tableName} WHERE ${conditions.join(" AND ")} LIMIT 1`,
      params
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const entity = resolveEntity(req.path);
  if (!entity) {
    next();
    return;
  }

  const action = resolveAction(req.method, req.path);
  const preId = extractEntityId(req, req.path);
  const needsBefore = action === "update" || action === "delete" || APPROVAL_ACTIONS.includes(action);

  const doAudit = async (beforeData: Record<string, unknown> | null) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.scope) {
        const scope = req.scope;
        const entityId = body?.id || preId || null;
        const responseData = body && typeof body === "object" ? body : null;
        const afterData = action === "delete" ? null
          : responseData?.data ? responseData.data
          : responseData || req.body || null;

        const changes = computeDiff(beforeData, afterData);
        const reason = req.body?.reason || null;

        const approvalStep = req.body?.approvalStep || req.body?.workflowStep || null;
        const workflowId = req.body?.workflowId || null;

        eventBus.emit(`audit.${entity}.${action}`, {
          companyId: scope.companyId,
          branchId: scope.branchId,
          userId: scope.userId,
          entity,
          entityId: entityId ? Number(entityId) : undefined,
          action,
          before: beforeData,
          after: afterData,
          changes,
          reason,
          approvalStep,
          workflowId,
        });
      }
      return originalJson(body);
    } as any;
  };

  if (needsBefore && preId) {
    fetchBeforeState(entity, preId, req.scope?.companyId)
      .then((beforeData) => {
        (req as any).__auditBefore = beforeData;
        doAudit(beforeData);
        next();
      })
      .catch(() => {
        doAudit(null);
        next();
      });
  } else {
    doAudit(null);
    next();
  }
}
