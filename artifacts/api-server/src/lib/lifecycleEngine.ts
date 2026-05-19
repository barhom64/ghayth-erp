/**
 * lifecycleEngine — shared helpers for lifecycle transitions across modules.
 *
 * Before this file, each module (legal, fleet, recruitment, CRM) rolled its own
 * "complete / cancel / renew / terminate / close" flow. That made audit, event,
 * and notification behaviour inconsistent and left several actions wired in the
 * UI with only a status flip on the server.
 *
 * This module standardises the concerns every lifecycle action has to get right:
 *   1. State validation — is the requested transition allowed from the current
 *      state? (`fromStates`)
 *   2. Atomic application — the state change, the side-effects (`onApply`), and
 *      the event-log row all run inside a single transaction.
 *   3. Observability — after commit, every transition writes an audit log row
 *      and emits on the in-process event bus so the notification engine / BI /
 *      rule engine can react. Audit / notify helpers have their own error
 *      handling, so failing to notify never rolls back the state change.
 *
 * Usage example:
 *
 *   const row = await applyTransition({
 *     entity: "legal_contracts",
 *     id: contractId,
 *     scope,
 *     action: "legal.contract.terminated",
 *     fromStates: ["active", "draft"],
 *     toState: "terminated",
 *     reason: body.reason,
 *     setExtras: {
 *       terminationDate: { raw: "NOW()" },
 *       terminationReason: body.reason,
 *     },
 *     after: { terminationReason: body.reason },
 *     notifications: [...],
 *   });
 */

import type pg from "pg";
import { withTransaction } from "./rawdb.js";
import { createAuditLog, createNotification } from "./businessHelpers.js";
import { safeEmitEvent } from "./eventBus.js";
import { logger } from "./logger.js";

export interface LifecycleScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
}

export interface LifecycleNotification {
  assignmentId: number;
  type: string;
  title: string;
  body: string;
  priority?: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
}

export type ExtraValue =
  | string
  | number
  | boolean
  | Date
  | null
  | { raw: string };

const ALLOWED_RAW_EXPRESSIONS = new Set([
  "NOW()",
  "NULL",
  "TRUE",
  "FALSE",
  "CURRENT_TIMESTAMP",
  "CURRENT_DATE",
]);

export interface ApplyTransitionOptions {
  /** Physical table being mutated. Must be a valid SQL identifier. */
  entity: string;
  /** Primary key of the row. */
  id: number;
  /** Active user / company / branch scope. */
  scope: LifecycleScope;
  /** Dotted event name emitted after the transition (`legal.contract.terminated`). */
  action: string;
  /** Allowed source states for this transition. Leave empty for "any". */
  fromStates?: string[];
  /** Target state to write into the status column. Leave undefined to keep the current state. */
  toState?: string;
  /**
   * Name of the column that holds the lifecycle status. Defaults to `"status"`.
   * Override for tables where the lifecycle status lives elsewhere — e.g.
   * `journal_entries` uses `"approvalStatus"` for the manual-journal approval
   * workflow while `"status"` carries the posting state.
   */
  statusColumn?: string;
  /** Optional reason, stored on the audit log row. */
  reason?: string;
  /** Extra column assignments to apply in the same UPDATE, keyed by column name. Use `{ raw: "NOW()" }` for raw SQL fragments. */
  setExtras?: Record<string, ExtraValue>;
  /** Extra filters to apply to the row lookup (e.g. `"deletedAt" IS NULL`). */
  extraWhere?: string;
  /** Optional follow-up work to run inside the same transaction after the row has been updated. Receives the updated row and the pg PoolClient so the callback can issue additional SQL inside the same transaction. */
  onApply?: (row: any, client: pg.PoolClient) => Promise<void>;
  /** Optional audit-log `after` patch (on top of the status change). */
  after?: Record<string, unknown>;
  /** Optional notifications fanned out after commit. Failures are logged. */
  notifications?: LifecycleNotification[];
  /** Skip the auto `"updatedAt" = NOW()` clause (for tables without that column). */
  skipUpdatedAt?: boolean;
}

export class LifecycleError extends Error {
  public readonly statusCode: number;
  constructor(
    message: string,
    public readonly status: number = 422,
    public readonly field?: string
  ) {
    super(message);
    this.statusCode = status;
  }
}

/**
 * Apply a lifecycle transition atomically. Returns the updated row.
 *
 * Throws `LifecycleError` when the target row does not exist (404) or when the
 * current state does not allow the requested transition (409). Any other error
 * propagates unchanged and the transaction is rolled back.
 */
export async function applyTransition<TRow = any>(
  opts: ApplyTransitionOptions
): Promise<TRow> {
  const {
    entity,
    id,
    scope,
    action,
    fromStates,
    toState,
    statusColumn,
    reason,
    setExtras,
    extraWhere,
    onApply,
    after,
    notifications,
  } = opts;

  const tableId = quoteIdent(entity);
  const statusCol = statusColumn ?? "status";
  const statusColId = quoteIdent(statusCol);

  const { updated, existingStatus } = await withTransaction(async (client) => {
    // 1. Lock the row and validate state.
    if (extraWhere && !/^[\w\s"'.=()]+$/.test(extraWhere)) {
      throw new LifecycleError("extraWhere contains disallowed characters", 400);
    }
    const lockSql =
      `SELECT * FROM ${tableId} WHERE id = $1 AND "companyId" = $2` +
      (extraWhere ? ` AND ${extraWhere}` : "") +
      ` FOR UPDATE`;
    const lockRes = await client.query(lockSql, [id, scope.companyId]);
    const existing = lockRes.rows[0];
    if (!existing) {
      throw new LifecycleError("السجل غير موجود", 404);
    }

    if (fromStates && fromStates.length > 0) {
      const currentStatus = existing[statusCol] as string | null | undefined;
      if (!currentStatus || !fromStates.includes(currentStatus)) {
        throw new LifecycleError(
          `لا يمكن تنفيذ العملية من الحالة الحالية (${currentStatus ?? "غير محددة"})`,
          409,
          statusCol
        );
      }
    }

    if (toState !== undefined) {
      const currentStatus = (existing[statusCol] as string) ?? "*";
      // Defence-in-depth: when a state machine is registered in
      // STATE_MACHINES, enforce it on top of the route's `fromStates`
      // whitelist (validated above). Entities without a registered
      // state machine — e.g. warehouse_products, inventory_counts —
      // trust the route's explicit `fromStates` as the sole authority.
      // Previously this branch rejected every transition for unregistered
      // entities, breaking `POST /inventory-counts/:id/approve` from a
      // brand-new `draft` count (issue #646).
      const sm = getStateMachine(entity, statusCol);
      if (sm && !isValidTransition(entity, currentStatus, toState, statusCol)) {
        throw new LifecycleError(
          `الانتقال غير مسموح: ${entity} ${currentStatus} → ${toState}`,
          409
        );
      }
    }

    // 2. Build the UPDATE SET list.
    const sets: string[] = [];
    const params: unknown[] = [];
    if (toState !== undefined) {
      params.push(toState);
      sets.push(`${statusColId} = $${params.length}`);
    }
    if (setExtras) {
      for (const [col, val] of Object.entries(setExtras)) {
        if (val && typeof val === "object" && "raw" in val) {
          if (!ALLOWED_RAW_EXPRESSIONS.has(val.raw.toUpperCase().trim())) {
            throw new Error(`Blocked raw SQL expression in setExtras: "${val.raw}". Use parameterized values instead.`);
          }
          sets.push(`${quoteIdent(col)} = ${val.raw}`);
          continue;
        }
        params.push(val);
        sets.push(`${quoteIdent(col)} = $${params.length}`);
      }
    }
    const hasExplicitUpdatedAt = setExtras && Object.keys(setExtras).some((k) => k === "updatedAt");
    if (!hasExplicitUpdatedAt && !opts.skipUpdatedAt) {
      sets.push(`"updatedAt" = NOW()`);
    }

    if (sets.length > 0) {
      params.push(id);
      params.push(scope.companyId);
      await client.query(
        `UPDATE ${tableId} SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length}`,
        params
      );
    }

    // 3. Read the updated row back.
    const updatedRes = await client.query(
      `SELECT * FROM ${tableId} WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    const updatedRow = updatedRes.rows[0];

    // 4. Run caller-supplied side-effects inside the same transaction.
    if (onApply) {
      await onApply(updatedRow, client);
    }

    // 5. Write the event-log row inside the transaction so it only becomes
    //    visible if the transition commits.
    await client.query(
      `INSERT INTO event_logs ("companyId", "userId", action, entity, "entityId", details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        scope.companyId,
        scope.userId,
        action,
        entity,
        String(id),
        JSON.stringify({
          statusColumn: statusCol,
          fromStatus: existing[statusCol] ?? null,
          toStatus: toState ?? existing[statusCol] ?? null,
          reason: reason ?? null,
          after: after ?? null,
        }),
      ]
    );

    return { updated: updatedRow, existingStatus: existing[statusCol] ?? null };
  });

  // --- After commit ------------------------------------------------------
  // Audit log, event bus fan-out, and notifications all run outside the
  // transaction. createAuditLog and createNotification already catch their
  // own errors, and safeEmitEvent parks failures in the DLQ, so a failure
  // here never rolls back the state change.
  createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action,
    entity,
    entityId: id,
    before: { [statusCol]: existingStatus },
    after: { [statusCol]: toState ?? existingStatus, ...(after ?? {}) },
    reason,
  }).catch((err) => logger.error(err, "lifecycleEngine audit error:"));

  safeEmitEvent({
    action,
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    entity,
    entityId: id,
    before: { [statusCol]: existingStatus },
    after: { [statusCol]: toState ?? existingStatus, ...(after ?? {}) },
    reason,
  } as any);

  if (notifications && notifications.length > 0) {
    for (const n of notifications) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: n.assignmentId,
        type: n.type,
        title: n.title,
        body: n.body,
        priority: n.priority,
        refType: n.refType,
        refId: n.refId,
        actionUrl: n.actionUrl,
      }).catch((err) => logger.error(err, "lifecycleEngine notify error:"));
    }
  }

  return updated as TRow;
}

/**
 * Map a `LifecycleError` to a `{ status, body }` pair suitable for
 * `res.status(...).json(...)`. Returns `null` if the error is not a
 * `LifecycleError`.
 */
export function lifecycleErrorResponse(err: unknown): { status: number; body: any } | null {
  if (err instanceof LifecycleError) {
    return {
      status: err.status,
      body: { error: err.message, field: err.field },
    };
  }
  return null;
}

/**
 * Assert that `status` is one of `allowed`. Throws a `LifecycleError` otherwise.
 * Useful for callers that want to enforce a transition outside `applyTransition`.
 */
export function assertTransition(
  status: string | null | undefined,
  allowed: string[],
  msg?: string
): void {
  if (!status || !allowed.includes(status)) {
    throw new LifecycleError(
      msg ??
        `لا يمكن تنفيذ العملية من الحالة الحالية (${status ?? "غير محددة"})`,
      409,
      "status"
    );
  }
}

// ─── State Machine Definitions ──────────────────────────────────────────────
// Each entity's valid state graph. Keys are source states; values are the set
// of reachable target states. `"*"` as a source means "from any state".

export interface StateMachine {
  entity: string;
  label: string;
  statusColumn?: string;
  transitions: Record<string, string[]>;
}

export const STATE_MACHINES: StateMachine[] = [
  {
    entity: "invoices",
    label: "فاتورة مبيعات",
    transitions: {
      draft: ["approved", "rejected", "returned", "sent", "cancelled"],
      approved: ["sent", "posted", "cancelled", "rejected"],
      returned: ["draft", "approved", "cancelled"],
      rejected: ["draft", "cancelled"],
      sent: ["partial", "paid", "overdue", "cancelled"],
      posted: ["paid", "partial", "overdue", "cancelled", "closed"],
      partial: ["paid", "overdue", "cancelled"],
      overdue: ["paid", "partial", "cancelled"],
      paid: ["closed"],
      cancelled: [],
      closed: [],
    },
  },
  {
    entity: "purchase_orders",
    label: "أمر شراء",
    transitions: {
      draft: ["pending_approval", "approved", "cancelled"],
      pending: ["pending_approval", "confirmed"],
      pending_approval: ["approved", "rejected", "returned"],
      approved: ["partially_received", "received", "sent", "cancelled"],
      sent: ["confirmed", "partially_received", "received", "cancelled"],
      confirmed: ["partially_received", "received", "cancelled"],
      partially_received: ["received", "invoice_matched", "invoice_mismatch"],
      received: ["invoice_matched", "invoice_mismatch", "paid"],
      invoice_matched: ["paid", "payment_scheduled"],
      invoice_mismatch: ["invoice_matched", "cancelled"],
      payment_scheduled: ["paid"],
      rejected: ["draft"],
      returned: ["draft", "pending_approval", "approved", "cancelled"],
      paid: [],
      cancelled: [],
    },
  },
  {
    entity: "purchase_requests",
    label: "طلب شراء",
    transitions: {
      draft: ["pending", "approved"],
      pending: ["approved", "rejected"],
      approved: ["converted"],
      rejected: ["draft"],
      converted: [],
    },
  },
  {
    entity: "journal_entries",
    label: "قيد يومية",
    statusColumn: "status",
    transitions: {
      draft: ["pending_approval", "posted", "approved", "rejected", "returned"],
      pending_approval: ["posted", "approved", "rejected", "returned"],
      approved: ["posted", "rejected"],
      posted: [],
      rejected: ["draft"],
      returned: ["draft", "pending_approval", "approved"],
    },
  },
  {
    entity: "journal_entries",
    label: "قيد يومية — اعتماد يدوي",
    statusColumn: "approvalStatus",
    transitions: {
      draft: ["pending_review"],
      pending_review: ["approved", "rejected"],
      approved: ["posted", "rejected"],
      rejected: ["draft"],
      posted: [],
    },
  },
  {
    entity: "legal_cases",
    label: "قضية قانونية",
    transitions: {
      open: ["in_progress", "closed", "on_hold"],
      in_progress: ["closed", "on_hold"],
      on_hold: ["in_progress", "closed"],
      closed: [],
    },
  },
  {
    entity: "legal_contracts",
    label: "عقد قانوني",
    transitions: {
      // #663 RCA: the /contracts/:id/renew route extends endDate +
      // bumps renewalCount and keeps the contract usable. For an
      // active contract that's a status-preserving self-loop; for an
      // expired contract it reactivates it. Both edges were missing —
      // the engine only modelled renewal via a transient `renewed`
      // state that nothing actually rests in. The route's `draft`
      // fromState is dropped separately (a draft is *activated*, not
      // *renewed*); `renewed` is kept for backward compatibility.
      draft: ["active", "cancelled"],
      active: ["terminated", "expired", "renewed", "active"],
      terminated: [],
      expired: ["renewed", "active"],
      renewed: ["active"],
      cancelled: [],
    },
  },
  {
    entity: "hr_leave_requests",
    label: "طلب إجازة",
    transitions: {
      pending: ["approved", "rejected", "returned", "cancelled"],
      approved: ["cancelled", "completed"],
      returned: ["pending"],
      rejected: [],
      cancelled: [],
      completed: [],
    },
  },
  {
    entity: "hr_exit_requests",
    label: "طلب مغادرة",
    transitions: {
      pending: ["approved", "rejected"],
      approved: ["clearance", "completed"],
      clearance: ["completed"],
      rejected: [],
      completed: [],
    },
  },
  {
    entity: "hr_inquiry_memos",
    label: "مذكرة تأديبية",
    transitions: {
      // #663 RCA: the `cancelled` state already exists but was only
      // reachable from `draft`. The /memos/:id/cancel route is a
      // legitimate escape hatch — HR can withdraw a memo raised in
      // error at ANY pending review stage (employee response, manager
      // review, GM review) before it's finalised. The engine was
      // missing those three → cancelled edges; once approved/rejected
      // the memo is finalised and cancellation no longer applies.
      pending_employee: ["pending_manager", "cancelled"],
      pending_manager: ["pending_gm", "cancelled"],
      pending_gm: ["approved", "rejected", "cancelled"],
      approved: ["appeal_pending", "closed"],
      rejected: ["closed"],
      appeal_pending: ["appeal_accepted", "approved"],
      appeal_accepted: ["closed"],
      cancelled: ["closed"],
      draft: ["pending_employee", "cancelled"],
      closed: [],
    },
  },
  {
    entity: "fleet_trips",
    label: "رحلة أسطول",
    transitions: {
      planned: ["scheduled", "in_progress", "cancelled"],
      scheduled: ["in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    },
  },
  {
    entity: "fleet_maintenance",
    label: "صيانة مركبة",
    transitions: {
      // #663 RCA: a short maintenance job (oil change, tyre rotation)
      // is legitimately scheduled then completed without a separate
      // in_progress step. The /complete route guards status itself
      // (rejects already-completed / cancelled) so the direct edge is
      // safe. Adding `completed` here aligns the engine with real
      // fleet ops instead of forcing a two-hop workflow.
      scheduled: ["in_progress", "cancelled", "completed"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    },
  },
  {
    entity: "property_contracts",
    label: "عقد عقاري",
    transitions: {
      draft: ["active", "cancelled"],
      active: ["terminated", "expired", "renewed"],
      terminated: [],
      expired: ["renewed"],
      renewed: ["active"],
      cancelled: [],
    },
  },
  {
    entity: "property_units",
    label: "وحدة عقارية",
    transitions: {
      available: ["reserved", "rented", "maintenance"],
      reserved: ["rented", "available"],
      rented: ["available", "maintenance"],
      maintenance: ["available"],
    },
  },
  {
    entity: "support_tickets",
    label: "تذكرة دعم",
    transitions: {
      open: ["in_progress", "closed"],
      in_progress: ["resolved", "escalated", "closed"],
      escalated: ["in_progress", "resolved", "closed"],
      resolved: ["closed", "open"],
      closed: ["open"],
    },
  },
  {
    entity: "crm_opportunities",
    label: "فرصة بيع",
    transitions: {
      prospecting: ["qualification", "lost"],
      qualification: ["proposal", "lost"],
      proposal: ["negotiation", "lost"],
      negotiation: ["won", "lost"],
      won: [],
      lost: [],
    },
  },
  {
    entity: "workflow_instances",
    label: "طلب اعتماد",
    transitions: {
      draft: ["pending", "pending_approval"],
      pending: ["approved", "rejected", "returned", "escalated"],
      pending_approval: ["approved", "rejected", "returned"],
      returned: ["draft", "pending", "pending_approval"],
      escalated: ["approved", "rejected"],
      approved: [],
      rejected: [],
    },
  },
  {
    entity: "umrah_sales_invoices",
    label: "فاتورة عمرة",
    transitions: {
      draft: ["approved", "cancelled"],
      approved: ["sent", "cancelled"],
      sent: ["partially_paid", "paid", "overdue", "cancelled"],
      partially_paid: ["paid", "overdue", "cancelled"],
      paid: [],
      overdue: ["partially_paid", "paid", "cancelled"],
      cancelled: [],
    },
  },
  {
    entity: "umrah_pilgrims",
    label: "معتمر",
    transitions: {
      pending:    ["arrived", "cancelled"],
      arrived:    ["active", "departed", "overstayed", "cancelled"],
      active:     ["departed", "overstayed", "violated"],
      overstayed: ["departed", "violated"],
      departed:   [],
      violated:   [],
      cancelled:  [],
    },
  },
  {
    entity: "umrah_seasons",
    label: "موسم عمرة",
    transitions: {
      open:     ["closed"],
      closed:   ["archived"],
      archived: [],
    },
  },
  {
    entity: "umrah_agents",
    label: "وكيل عمرة",
    transitions: {
      active:    ["inactive", "suspended", "blocked"],
      inactive:  ["active"],
      suspended: ["active", "blocked"],
      blocked:   [],
    },
  },
  {
    entity: "umrah_transport",
    label: "نقل عمرة",
    transitions: {
      scheduled:   ["in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed:   [],
      cancelled:   [],
    },
  },
  {
    entity: "governance_policies",
    label: "سياسة حوكمة",
    transitions: {
      draft: ["active", "archived"],
      active: ["archived", "draft"],
      archived: [],
    },
  },
  {
    entity: "budgets",
    label: "ميزانية",
    transitions: {
      draft: ["pending_approval", "approved"],
      pending_approval: ["approved", "rejected", "returned"],
      approved: ["closed"],
      rejected: ["draft"],
      returned: ["draft", "pending_approval"],
      closed: [],
    },
  },
  {
    entity: "financial_periods",
    label: "فترة مالية",
    transitions: {
      open: ["closed"],
      closed: ["open"],
    },
  },
  {
    entity: "fleet_traffic_violations",
    label: "مخالفة مرورية",
    transitions: {
      pending: ["unpaid", "paid", "disputed", "cancelled"],
      unpaid: ["paid", "disputed", "cancelled"],
      disputed: ["unpaid", "paid", "cancelled"],
      paid: [],
      cancelled: [],
    },
  },
  {
    entity: "umrah_penalties",
    label: "عقوبة عمرة",
    transitions: {
      pending: ["invoiced", "waived"],
      invoiced: ["paid", "waived"],
      paid: [],
      waived: [],
    },
  },
  {
    entity: "umrah_agent_invoices",
    label: "فاتورة وكيل عمرة",
    transitions: {
      sent: ["partially_paid", "paid", "overdue", "cancelled"],
      partially_paid: ["paid", "overdue", "cancelled"],
      overdue: ["partially_paid", "paid", "cancelled"],
      paid: [],
      cancelled: [],
    },
  },
];

function _smKey(entity: string, statusColumn?: string): string {
  return statusColumn && statusColumn !== "status"
    ? `${entity}::${statusColumn}`
    : entity;
}

const _smIndex = new Map<string, StateMachine>(
  STATE_MACHINES.map((sm) => [_smKey(sm.entity, sm.statusColumn), sm])
);

export function getStateMachine(entity: string, statusColumn?: string): StateMachine | undefined {
  return _smIndex.get(_smKey(entity, statusColumn)) ?? _smIndex.get(entity);
}

export function isValidTransition(entity: string, from: string, to: string, statusColumn?: string): boolean {
  const sm = getStateMachine(entity, statusColumn);
  if (!sm) return false;
  const allowed = sm.transitions[from] ?? sm.transitions["*"];
  if (!allowed) return false;
  return allowed.includes(to);
}

function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    return `"${ident.replace(/"/g, '""')}"`;
  }
  if (/[A-Z]/.test(ident)) {
    return `"${ident}"`;
  }
  return ident;
}
