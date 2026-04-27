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
  constructor(
    message: string,
    public readonly status: number = 422,
    public readonly field?: string
  ) {
    super(message);
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

    // 2. Build the UPDATE SET list.
    const sets: string[] = [];
    const params: any[] = [];
    if (toState !== undefined) {
      params.push(toState);
      sets.push(`${statusColId} = $${params.length}`);
    }
    if (setExtras) {
      for (const [col, val] of Object.entries(setExtras)) {
        if (val && typeof val === "object" && "raw" in val) {
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
      await client.query(
        `UPDATE ${tableId} SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    // 3. Read the updated row back.
    const updatedRes = await client.query(
      `SELECT * FROM ${tableId} WHERE id = $1`,
      [id]
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
  }).catch((err) => console.error("lifecycleEngine audit error:", err));

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
      }).catch((err) => console.error("lifecycleEngine notify error:", err));
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
      approved: ["sent", "cancelled", "rejected"],
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
      pending_approval: ["approved", "rejected"],
      approved: ["partially_received", "received", "cancelled"],
      partially_received: ["received"],
      received: ["paid"],
      rejected: ["draft"],
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
      draft: ["pending_approval", "posted"],
      pending_approval: ["posted", "rejected"],
      posted: ["reversed"],
      rejected: ["draft"],
      reversed: [],
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
      draft: ["active", "cancelled"],
      active: ["terminated", "expired", "renewed"],
      terminated: [],
      expired: ["renewed"],
      renewed: ["active"],
      cancelled: [],
    },
  },
  {
    entity: "hr_leave_requests",
    label: "طلب إجازة",
    transitions: {
      pending: ["approved", "rejected"],
      approved: ["cancelled", "completed"],
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
      pending_employee: ["pending_manager"],
      pending_manager: ["pending_gm"],
      pending_gm: ["approved", "rejected"],
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
      scheduled: ["in_progress", "cancelled"],
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
      pending: ["approved", "rejected", "escalated"],
      escalated: ["approved", "rejected"],
      approved: [],
      rejected: [],
    },
  },
  {
    entity: "umrah_sales_invoices",
    label: "فاتورة عمرة",
    transitions: {
      draft: ["confirmed", "cancelled"],
      confirmed: ["paid", "partial", "cancelled"],
      partial: ["paid", "cancelled"],
      paid: [],
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
      pending_approval: ["approved", "rejected"],
      approved: ["closed"],
      rejected: ["draft"],
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
];

const _smIndex = new Map<string, StateMachine>(
  STATE_MACHINES.map((sm) => [sm.entity, sm])
);

export function getStateMachine(entity: string): StateMachine | undefined {
  return _smIndex.get(entity);
}

export function isValidTransition(entity: string, from: string, to: string): boolean {
  const sm = _smIndex.get(entity);
  if (!sm) return true;
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
