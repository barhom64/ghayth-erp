import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const LISTENERS = read("eventListeners.ts");
const CATALOG = read("eventCatalog.ts");

// ── Event Listeners — exports ─────────────────────────────────────────────

describe("eventListeners — exports", () => {
  it("exports registerEventListeners", () => {
    expect(LISTENERS).toContain("export function registerEventListeners");
  });

  it("has logEvent helper", () => {
    expect(LISTENERS).toContain("async function logEvent");
  });

  it("has logAudit helper", () => {
    expect(LISTENERS).toContain("async function logAudit");
  });
});

// ── HR domain events ──────────────────────────────────────────────────────

describe("eventListeners — HR events", () => {
  for (const e of [
    "employee.created", "employee.updated", "employee.deleted",
    "leave.requested", "leave.approved", "leave.rejected", "leave.completed",
    "attendance.checkin", "attendance.checkout",
    "payroll.processed", "payroll.completed",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Finance domain events ─────────────────────────────────────────────────

describe("eventListeners — finance events", () => {
  for (const e of [
    "invoice.created", "invoice.updated", "invoice.paid",
    "expense.created", "vendor.created",
    "voucher.receipt_created", "voucher.payment_created",
    "custody.created", "custody.settled",
    "journal.entry.created",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Procurement events ────────────────────────────────────────────────────

describe("eventListeners — procurement events", () => {
  for (const e of [
    "purchase_request.created", "purchase_request.approved", "purchase_request.rejected",
    "purchase_order.created", "purchase_order.received",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── CRM events ────────────────────────────────────────────────────────────

describe("eventListeners — CRM events", () => {
  for (const e of [
    "crm.opportunity.created", "crm.opportunity.won", "crm.opportunity.lost",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Task events ───────────────────────────────────────────────────────────

describe("eventListeners — task events", () => {
  it("handles task.created", () => {
    expect(LISTENERS).toContain('"task.created"');
  });

  it("handles task.completed", () => {
    expect(LISTENERS).toContain('"task.completed"');
  });
});

// ── Support events ────────────────────────────────────────────────────────

describe("eventListeners — support events", () => {
  for (const e of [
    "support.ticket.created", "support.ticket.resolved",
    "support.ticket.status_changed", "support.ticket.closed",
    "support.ticket.assigned", "support.ticket.deleted",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Fleet events ──────────────────────────────────────────────────────────

describe("eventListeners — fleet events", () => {
  for (const e of [
    "fleet.trip.started", "fleet.trip.completed", "fleet.trip.cancelled",
    "fleet.vehicle.created", "fleet.vehicle.breakdown",
    "fleet.driver.created",
    "fleet.maintenance.completed", "fleet.maintenance.cancelled",
    "fleet.preventive.due",
    "fleet.traffic_violation.created", "fleet.traffic_violation.paid",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Warehouse events ──────────────────────────────────────────────────────

describe("eventListeners — warehouse events", () => {
  for (const e of [
    "warehouse.product.created", "warehouse.product.updated",
    "warehouse.product.status_changed", "warehouse.product.deleted",
    "warehouse.movement.created",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Property events ───────────────────────────────────────────────────────

describe("eventListeners — property events", () => {
  for (const e of [
    "lease.created", "lease.expired", "lease.renewal_notice",
    "tenant.created", "rent_payment.received",
    "deposit.received", "deposit.refunded",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Legal events ──────────────────────────────────────────────────────────

describe("eventListeners — legal events", () => {
  for (const e of [
    "legal.case.created", "legal.case.closed", "legal.case.judgment",
    "legal.contract.renewed", "legal.contract.terminated",
    "legal.contract.created", "legal.contract.updated",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Project events ────────────────────────────────────────────────────────

describe("eventListeners — project events", () => {
  for (const e of [
    "project.created", "project.updated", "project.status_changed", "project.deleted",
    "project.phase.created", "project.phase.completed",
    "project.task.updated", "project.task.status_changed",
    "project.closed",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── Umrah events ──────────────────────────────────────────────────────────

describe("eventListeners — umrah events", () => {
  for (const e of [
    "umrah.mutamers.imported", "umrah.vouchers.imported",
    "umrah.overstay.detected", "umrah.absconder.detected",
    "umrah.invoice.generated", "umrah.payment.received",
    "umrah.commission.calculated", "umrah.agent.linked",
    "umrah.violation.created", "umrah.season.opened",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── HR discipline events ──────────────────────────────────────────────────

describe("eventListeners — HR discipline and transfer events", () => {
  for (const e of [
    "hr.memo.created", "hr.memo.justified", "hr.memo.gm_decided",
    "hr.transfer.requested", "hr.transfer.completed",
    "hr.letter.approved", "hr.letter.rejected",
    "hr.discipline.regulation.create",
  ]) {
    it(`handles ${e}`, () => {
      expect(LISTENERS).toContain(`"${e}"`);
    });
  }
});

// ── System events ─────────────────────────────────────────────────────────

describe("eventListeners — system events", () => {
  it("handles settings.updated", () => {
    expect(LISTENERS).toContain('"settings.updated"');
  });

  it("handles company.created", () => {
    expect(LISTENERS).toContain('"company.created"');
  });

  it("handles system.obligation.breached", () => {
    expect(LISTENERS).toContain('"system.obligation.breached"');
  });

  it("handles system.obligation.escalated", () => {
    expect(LISTENERS).toContain('"system.obligation.escalated"');
  });
});

// ── Cross-domain handlers ─────────────────────────────────────────────────

describe("eventListeners — cross-domain handlers", () => {
  for (const h of [
    "property.invoice.requested",
    "crm.deal.invoice_requested",
    "legal.invoice.requested",
    "project.invoice.requested",
    "finance.fixed_asset.requested",
    "fleet.warehouse_deduction.requested",
    "property.legal_case.requested",
    "crm.legal_contract.requested",
  ]) {
    it(`registers cross-domain handler: ${h}`, () => {
      expect(LISTENERS).toContain(`"${h}"`);
    });
  }
});

// ── Security ──────────────────────────────────────────────────────────────

describe("eventListeners — security", () => {
  it("uses parameterized queries", () => {
    const params = [...LISTENERS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("logs to audit_logs table", () => {
    expect(LISTENERS).toContain("audit_logs");
  });

  it("logs to event_logs table", () => {
    expect(LISTENERS).toContain("event_logs");
  });

  it("includes companyId in event logging", () => {
    expect(LISTENERS).toContain("payload.companyId");
  });

  it("computes diff for audit entries", () => {
    expect(LISTENERS).toContain("computeDiff");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EVENT CATALOG
// ══════════════════════════════════════════════════════════════════════════

describe("eventCatalog — exports", () => {
  it("exports EventDomain type", () => {
    expect(CATALOG).toContain("export type EventDomain");
  });

  it("exports EventDefinition interface", () => {
    expect(CATALOG).toContain("export interface EventDefinition");
  });

  it("exports EVENT_CATALOG array", () => {
    expect(CATALOG).toContain("export const EVENT_CATALOG");
  });

  it("exports getEventDefinition", () => {
    expect(CATALOG).toContain("export function getEventDefinition");
  });

  it("exports listEventsByDomain", () => {
    expect(CATALOG).toContain("export function listEventsByDomain");
  });

  it("exports listCriticalEvents", () => {
    expect(CATALOG).toContain("export function listCriticalEvents");
  });

  it("exports countEventsByDomain", () => {
    expect(CATALOG).toContain("export function countEventsByDomain");
  });

  it("exports validateEventPayload", () => {
    expect(CATALOG).toContain("export function validateEventPayload");
  });
});

describe("eventCatalog — domain coverage", () => {
  for (const domain of [
    "finance", "hr", "fleet", "property", "legal", "crm",
    "support", "store", "warehouse", "project", "workflow",
    "system", "umrah", "auth", "admin",
  ]) {
    it(`declares domain: ${domain}`, () => {
      expect(CATALOG).toContain(`"${domain}"`);
    });
  }
});

describe("eventCatalog — event naming convention", () => {
  it("contains hundreds of event definitions", () => {
    const events = [...CATALOG.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1]);
    expect(events.length).toBeGreaterThan(100);
  });

  it("majority follow domain.aggregate.verb pattern (2+ segments)", () => {
    const events = [...CATALOG.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1]);
    const multiSegment = events.filter(e => e.split(".").length >= 2);
    expect(multiSegment.length).toBeGreaterThan(events.length * 0.9);
  });
});
