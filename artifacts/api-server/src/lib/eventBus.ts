import { EventEmitter } from "events";
import { rawExecute } from "./rawdb.js";

export interface EventPayload {
  companyId?: number;
  branchId?: number;
  userId?: number;
  [key: string]: unknown;
}

export type EventName =
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "invoice.created"
  | "invoice.updated"
  | "invoice.paid"
  | "leave.requested"
  | "leave.approved"
  | "leave.rejected"
  | "attendance.checkin"
  | "attendance.checkout"
  | "purchase_request.created"
  | "purchase_request.approved"
  | "crm.opportunity.created"
  | "crm.opportunity.won"
  | "crm.opportunity.lost"
  | "task.created"
  | "task.completed"
  | "support.ticket.created"
  | "support.ticket.resolved"
  | "fleet.trip.started"
  | "fleet.trip.completed"
  | "warehouse.movement.created"
  | "payroll.processed"
  | "payroll.completed"
  | "journal.entry.created"
  | "settings.updated"
  | "company.created"
  | "expense.created"
  | "vendor.created"
  | "voucher.receipt_created"
  | "voucher.payment_created"
  | "custody.created"
  | "custody.settled"
  | "purchase_order.created"
  | "purchase_request.rejected"
  | "leave.stage1_approved"
  | "leave.escalated"
  | "workflow.submitted"
  | "workflow.approved"
  | "workflow.rejected"
  | "workflow.escalated"
  | "workflow.sla_warning"
  | string;

class EventBus extends EventEmitter {
  emit(event: EventName, payload?: EventPayload): boolean {
    return super.emit(event, payload);
  }

  on(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.on(event, listener);
  }

  once(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.once(event, listener);
  }

  off(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.off(event, listener);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(200);

export interface DLQEntry {
  type: "event" | "notification" | "audit" | "workflow";
  payload: unknown;
  error: string;
  companyId?: number;
  retryCount: number;
  createdAt: Date;
}

const dlqBuffer: DLQEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function scheduleDLQFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushDLQ();
  }, 5000);
}

async function flushDLQ(): Promise<void> {
  if (dlqBuffer.length === 0) return;
  const batch = dlqBuffer.splice(0, dlqBuffer.length);
  for (const entry of batch) {
    try {
      await rawExecute(
        `INSERT INTO event_dlq (type, payload, error, "companyId", "retryCount", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          entry.type,
          JSON.stringify(entry.payload),
          entry.error,
          entry.companyId ?? null,
          entry.retryCount,
          entry.createdAt,
        ]
      );
    } catch (dbErr) {
      console.error("[DLQ] Failed to persist DLQ entry:", dbErr);
    }
  }
}

export function pushToDLQ(
  type: DLQEntry["type"],
  payload: unknown,
  error: unknown,
  companyId?: number
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  dlqBuffer.push({ type, payload, error: errMsg, companyId, retryCount: 0, createdAt: new Date() });
  scheduleDLQFlush();
}

export function safeEmitEvent(payload: unknown & { companyId?: number }): void {
  const emitFn = (payload as any)?.action
    ? () => eventBus.emit((payload as any).action as EventName, payload as EventPayload)
    : () => {};
  try {
    emitFn();
  } catch (err) {
    pushToDLQ("event", payload, err, (payload as any)?.companyId);
  }
}
