import { EventEmitter } from "events";

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
