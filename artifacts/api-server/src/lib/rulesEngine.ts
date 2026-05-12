import { rawQuery, rawExecute } from "./rawdb.js";
import { createNotification, getManagerAssignmentId, getDirectorAssignmentId } from "./businessHelpers.js";
import { eventBus, type EventPayload } from "./eventBus.js";
import { logger } from "./logger.js";

interface BusinessRule {
  id: number;
  companyId: number | null;
  name: string;
  triggerEvent: string;
  conditionField: string | null;
  conditionOperator: string;
  conditionValue: string | null;
  actionType: string;
  actionTarget: string | null;
  actionConfig: any;
  module: string | null;
  priority: number;
  isActive: boolean;
}

function evaluateCondition(fieldValue: any, operator: string, conditionValue: string): boolean {
  const numVal = Number(conditionValue);
  const numField = Number(fieldValue);
  const isNumeric = !isNaN(numField) && !isNaN(numVal);

  switch (operator) {
    case ">=":
      return isNumeric && numField >= numVal;
    case "<=":
      return isNumeric && numField <= numVal;
    case ">":
      return isNumeric && numField > numVal;
    case "<":
      return isNumeric && numField < numVal;
    case "==":
      return String(fieldValue) === String(conditionValue);
    case "!=":
      return String(fieldValue) !== String(conditionValue);
    case "contains":
      return String(fieldValue).includes(String(conditionValue));
    default:
      return false;
  }
}

function interpolateTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{?(\w+)\}?\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : `{${key}}`;
  });
}

async function getTargetAssignmentId(
  companyId: number,
  branchId: number | undefined,
  target: string
): Promise<number | null> {
  try {
    switch (target) {
      case "manager":
      case "branch_manager":
        return await getManagerAssignmentId(companyId, branchId ?? 0);
      case "director":
      case "general_manager": {
        const dirId = await getDirectorAssignmentId(companyId, branchId ?? 0);
        return dirId;
      }
      case "hr":
      case "hr_manager":
      case "owner":
      case "finance":
      case "finance_manager":
      case "legal":
      case "fleet_manager":
      case "property_manager":
      case "project_manager": {
        const roleMap: Record<string, string[]> = {
          hr: ["hr_manager", "general_manager", "owner"],
          hr_manager: ["hr_manager", "general_manager", "owner"],
          owner: ["owner"],
          finance: ["finance_manager", "general_manager", "owner"],
          finance_manager: ["finance_manager", "general_manager", "owner"],
          legal: ["legal", "owner"],
          fleet_manager: ["fleet_manager", "owner"],
          property_manager: ["property_manager", "owner"],
          project_manager: ["branch_manager", "general_manager", "owner"],
        };
        const roles = roleMap[target] || ["owner"];
        const [asgn] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM employee_assignments
           WHERE "companyId" = $1 AND role = ANY($2) AND status = 'active'
           ORDER BY CASE WHEN role = $3 THEN 1 ELSE 2 END LIMIT 1`,
          [companyId, roles, roles[0]]
        );
        return asgn?.id ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function executeAction(
  rule: BusinessRule,
  payload: EventPayload,
  templateData: Record<string, any>
): Promise<string> {
  const companyId = payload.companyId;
  if (!companyId) return "no_company_id";

  const config = rule.actionConfig || {};
  const title = interpolateTemplate(config.title || rule.name, templateData);
  const body = interpolateTemplate(config.body || "", templateData);

  switch (rule.actionType) {
    case "notification": {
      let assignmentId: number | null = null;

      if (rule.actionTarget === "employee" && payload.assignmentId) {
        assignmentId = payload.assignmentId as number;
      } else if (rule.actionTarget) {
        assignmentId = await getTargetAssignmentId(
          companyId,
          payload.branchId as number | undefined,
          rule.actionTarget
        );
      }

      if (assignmentId) {
        await createNotification({
          companyId,
          assignmentId,
          type: config.type || "business_rule",
          title,
          body,
          priority: config.priority || "normal",
          refType: payload.entity as string,
          refId: payload.entityId as number,
        });
        return `notification_sent_to_${rule.actionTarget}`;
      }
      return "no_target_found";
    }

    case "escalation": {
      const assignmentId = await getTargetAssignmentId(
        companyId,
        payload.branchId as number | undefined,
        rule.actionTarget || "general_manager"
      );
      if (assignmentId) {
        await createNotification({
          companyId,
          assignmentId,
          type: "escalation",
          title,
          body,
          priority: config.priority || "urgent",
          refType: payload.entity as string,
          refId: payload.entityId as number,
        });
        return `escalated_to_${rule.actionTarget}`;
      }
      return "escalation_no_target";
    }

    case "create_task": {
      const assignmentId = await getTargetAssignmentId(
        companyId,
        payload.branchId as number | undefined,
        rule.actionTarget || "hr_manager"
      );
      if (assignmentId) {
        const [emp] = await rawQuery<Record<string, unknown>>(
          `SELECT "employeeId" FROM employee_assignments WHERE id = $1`,
          [assignmentId]
        );
        if (emp) {
          await rawExecute(
            `INSERT INTO tasks ("companyId","branchId",title,description,priority,status,"assignedTo","scheduledDate","createdAt")
             VALUES ($1,$2,$3,$4,$5,'pending',$6,CURRENT_DATE,NOW())`,
            [companyId, payload.branchId ?? null, title, body, config.priority || "high", assignmentId]
          );
          return "task_created";
        }
      }
      return "task_creation_failed";
    }

    case "set_sla": {
      if (payload.entityId) {
        const slaHours = Math.max(1, Math.min(Number(config.slaHours) || 4, 720));
        await rawExecute(
          `UPDATE support_tickets SET "slaDeadline" = NOW() + make_interval(hours => $2) WHERE id = $1 AND "companyId" = $3`,
          [payload.entityId, slaHours, companyId]
        ).catch((e) => logger.error(e, "[RulesEngine] SLA update failed:"));
        return `sla_set_${slaHours}h`;
      }
      return "no_entity_for_sla";
    }

    case "status_change": {
      return `status_change_logged`;
    }

    default:
      return `unknown_action_${rule.actionType}`;
  }
}

async function logRuleExecution(
  rule: BusinessRule,
  payload: EventPayload,
  actionResult: string,
  status: string = "success"
) {
  try {
    await rawExecute(
      `INSERT INTO business_rule_logs ("ruleId","ruleName","triggerEvent","companyId","entityId","entityType","actionTaken","actionResult",status,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        rule.id,
        rule.name,
        rule.triggerEvent,
        payload.companyId ?? null,
        payload.entityId ?? null,
        payload.entity ?? null,
        rule.actionType,
        actionResult,
        status,
        JSON.stringify({ payload: { ...payload, details: undefined }, ruleConfig: rule.actionConfig }),
      ]
    );
  } catch (err) {
    logger.error(err, "[RulesEngine] Failed to log rule execution:");
  }
}

export async function evaluateRulesForEvent(eventName: string, payload: EventPayload) {
  try {
    const rules = await rawQuery<BusinessRule>(
      `SELECT * FROM business_rules 
       WHERE "triggerEvent" = $1 AND "isActive" = true 
         AND ("companyId" IS NULL OR "companyId" = $2)
       ORDER BY priority DESC`,
      [eventName, payload.companyId ?? 0]
    );

    if (rules.length === 0) return;

    const templateData: Record<string, any> = {
      ...payload,
      event: eventName,
    };

    for (const rule of rules) {
      try {
        if (rule.conditionField && rule.conditionValue !== null) {
          const fieldValue = (payload as any)[rule.conditionField];
          if (fieldValue === undefined) continue;
          if (!evaluateCondition(fieldValue, rule.conditionOperator, rule.conditionValue)) continue;
        }

        const result = await executeAction(rule, payload, templateData);
        await logRuleExecution(rule, payload, result, "success");
        logger.info({ ruleName: rule.name, result }, "Business rule fired");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await logRuleExecution(rule, payload, errMsg, "error");
        logger.error(err, `[RulesEngine] Rule "${rule.name}" failed:`);
      }
    }
  } catch (err) {
    logger.error(err, "[RulesEngine] Failed to evaluate rules:");
  }
}

export function registerRulesEngineListener() {
  const trackedEvents = [
    "attendance.checkin",
    "attendance.checkout",
    "attendance.absent",
    "invoice.created",
    "invoice.paid",
    "invoice.overdue_check",
    "leave.requested",
    "leave.approved",
    "leave.rejected",
    "expense.created",
    "support.ticket.created",
    "support.ticket.resolved",
    "fleet.trip.started",
    "fleet.trip.completed",
    "fleet.maintenance_check",
    "fleet.insurance_check",
    "contract.expiry_check",
    "project.budget_check",
    "property.contract_check",
    "legal.case.created",
    "task.created",
    "task.completed",
    "employee.created",
    "employee.updated",
    "purchase_request.created",
    "purchase_request.approved",
    "custody.created",
    "custody.settled",
    "voucher.receipt_created",
    "voucher.payment_created",
  ];

  for (const event of trackedEvents) {
    eventBus.on(event, async (payload) => {
      await evaluateRulesForEvent(event, payload);
    });
  }

  logger.info({ eventCount: trackedEvents.length }, "Business rules engine registered");
}
