import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SUPPORT_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/support.ts"), "utf8");
// SUP-016 — the ticket transition graph is now defined once, in the
// lifecycleEngine support_tickets state machine; support.ts derives its
// inline guard from it.
const LIFECYCLE_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/lifecycleEngine.ts"), "utf8");
const TICKET_SM = LIFECYCLE_SRC.slice(
  LIFECYCLE_SRC.indexOf('entity: "support_tickets"'),
  LIFECYCLE_SRC.indexOf('entity: "support_tickets"') + 600,
);

// ─── Support Golden Path Tests ──────────────────────────────────────────────
// P4.1 of the unification plan. Lock in the support ticket lifecycle
// contracts BEFORE any refactoring.

describe("Support route structure", () => {
  it("POST /tickets endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.post("/tickets"');
  });

  it("PATCH /tickets/:id endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.patch("/tickets/:id"');
  });

  it("DELETE /tickets/:id endpoint exists (soft delete)", () => {
    expect(SUPPORT_ROUTE).toContain('router.delete("/tickets/:id"');
  });

  it("POST /tickets/:id/replies endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.post("/tickets/:id/replies"');
  });

  it("POST /tickets/:id/field-visit endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.post("/tickets/:id/field-visit"');
  });

  it("POST /tickets/:id/csat endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.post("/tickets/:id/csat"');
  });

  it("POST /tickets/check-sla endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.post("/tickets/check-sla"');
  });

  it("GET /stats endpoint exists", () => {
    expect(SUPPORT_ROUTE).toContain('router.get("/stats"');
  });

  it("KB CRUD endpoints exist", () => {
    expect(SUPPORT_ROUTE).toContain('router.get("/kb"');
    expect(SUPPORT_ROUTE).toContain('router.post("/kb"');
    expect(SUPPORT_ROUTE).toContain('router.patch("/kb/:id"');
    expect(SUPPORT_ROUTE).toContain('router.delete("/kb/:id"');
    expect(SUPPORT_ROUTE).toContain('router.post("/kb/:id/feedback"');
  });
});

describe("Support ticket state machine", () => {
  it("derives TICKET_TRANSITIONS from the lifecycle state machine", () => {
    expect(SUPPORT_ROUTE).toContain("TICKET_TRANSITIONS");
    expect(SUPPORT_ROUTE).toContain('STATE_MACHINES.find((sm) => sm.entity === "support_tickets")');
  });

  it("open transitions to: in_progress, pending_customer, field_visit, resolved, closed", () => {
    const openLine = TICKET_SM.slice(TICKET_SM.indexOf("open:"), TICKET_SM.indexOf("\n", TICKET_SM.indexOf("open:")));
    expect(openLine).toContain("in_progress");
    expect(openLine).toContain("pending_customer");
    expect(openLine).toContain("field_visit");
    expect(openLine).toContain("resolved");
    expect(openLine).toContain("closed");
  });

  it("closed is a terminal state with no transitions", () => {
    expect(TICKET_SM).toContain("closed: [],");
  });

  it("resolved can reopen via in_progress", () => {
    const resolvedLine = TICKET_SM.slice(
      TICKET_SM.indexOf("resolved:"),
      TICKET_SM.indexOf("\n", TICKET_SM.indexOf("resolved:"))
    );
    expect(resolvedLine).toContain("in_progress");
  });

  it("rejects illegal transitions with ConflictError", () => {
    expect(SUPPORT_ROUTE).toContain("ConflictError");
    expect(SUPPORT_ROUTE).toContain("TICKET_TRANSITIONS[ticket.status]");
  });

  it("provides allowed next states in error meta", () => {
    expect(SUPPORT_ROUTE).toContain("allowedNext");
  });
});

describe("Support ticket creation contract", () => {
  it("validates input with zod schema", () => {
    expect(SUPPORT_ROUTE).toContain("createTicketSchema.safeParse");
  });

  it("generates TKT- reference code via generateTimeRef", () => {
    expect(SUPPORT_ROUTE).toContain('generateTimeRef("TKT")');
  });

  it("auto-detects priority from text keywords", () => {
    expect(SUPPORT_ROUTE).toContain("detectPriority");
    expect(SUPPORT_ROUTE).toContain("PRIORITY_KEYWORDS");
  });

  it("calculates SLA deadline based on priority", () => {
    expect(SUPPORT_ROUTE).toContain("slaDeadlineForPriority");
    expect(SUPPORT_ROUTE).toContain("slaResponseHours");
  });

  it("auto-assigns ticket using load-balance algorithm", () => {
    expect(SUPPORT_ROUTE).toContain("loadBalanceAssign");
    expect(SUPPORT_ROUTE).toContain("openTickets");
    expect(SUPPORT_ROUTE).toContain("avgResolution");
  });

  it("pre-validates clientId FK before insert", () => {
    const idx = SUPPORT_ROUTE.indexOf('router.post("/tickets"');
    const section = SUPPORT_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("b.clientId");
    expect(section).toContain('SELECT id FROM clients WHERE id = $1 AND "companyId" = $2');
  });

  it("notifies assigned agent on creation", () => {
    expect(SUPPORT_ROUTE).toContain("تذكرة دعم جديدة مسندة إليك");
  });
});

describe("Support ticket resolution side-effects", () => {
  it("sets resolvedAt timestamp on resolution", () => {
    const hasRaw = SUPPORT_ROUTE.includes('"resolvedAt"=NOW()');
    const hasSetExtras = SUPPORT_ROUTE.includes("resolvedAt") && SUPPORT_ROUTE.includes('"NOW()"');
    expect(hasRaw || hasSetExtras).toBe(true);
  });

  it("posts billable amount to GL on resolution", () => {
    expect(SUPPORT_ROUTE).toContain("supportEngine.postBillingGL");
    expect(SUPPORT_ROUTE).toContain("billableAmount");
  });

  it("queues satisfaction survey email 24h after resolution", () => {
    expect(SUPPORT_ROUTE).toContain("email_queue");
    expect(SUPPORT_ROUTE).toContain("استبيان رضا العميل");
    expect(SUPPORT_ROUTE).toContain("24 * 60 * 60 * 1000");
  });

  it("returns surveyQueued flag in response", () => {
    expect(SUPPORT_ROUTE).toContain("surveyQueued");
  });
});

describe("Support SLA enforcement", () => {
  it("check-sla scans for breached tickets", () => {
    expect(SUPPORT_ROUTE).toContain('"slaDeadline" < NOW()');
  });

  it("escalates breached tickets to critical priority", () => {
    expect(SUPPORT_ROUTE).toContain("priority='critical'");
    expect(SUPPORT_ROUTE).toContain('"slaBreached"=true');
  });

  it("creates SLA breach notification", () => {
    expect(SUPPORT_ROUTE).toContain("SLA خرق");
  });

  it("reply handler also checks SLA on each response", () => {
    const replyIdx = SUPPORT_ROUTE.indexOf('router.post("/tickets/:id/replies"');
    const replySection = SUPPORT_ROUTE.slice(replyIdx, replyIdx + 2000);
    expect(replySection).toContain("slaDeadline");
    expect(replySection).toContain("slaBreached");
  });

  it("tracks first response time", () => {
    expect(SUPPORT_ROUTE).toContain('"firstResponseAt"=NOW()');
  });
});

describe("Support field visit contract", () => {
  it("sets ticket status to field_visit", () => {
    const idx = SUPPORT_ROUTE.indexOf('"/tickets/:id/field-visit"');
    const section = SUPPORT_ROUTE.slice(idx, idx + 1000);
    // Route uses applyTransition with toState: "field_visit" instead of inline SQL
    expect(section).toContain("applyTransition");
    expect(section).toMatch(/toState.*field_visit/);
  });

  it("calculates distance using haversine formula", () => {
    expect(SUPPORT_ROUTE).toContain("haversineKm");
    expect(SUPPORT_ROUTE).toContain("distanceKm");
  });

  it("notifies assigned agent about field visit", () => {
    const idx = SUPPORT_ROUTE.indexOf('"/tickets/:id/field-visit"');
    const section = SUPPORT_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("زيارة ميدانية");
    expect(section).toContain("createNotification");
  });
});

describe("Support CSAT contract", () => {
  it("validates score 1-5 with zod", () => {
    expect(SUPPORT_ROUTE).toContain("createCSATSchema");
    expect(SUPPORT_ROUTE).toContain(".min(1).max(5");
  });

  it("rejects CSAT on non-resolved tickets", () => {
    expect(SUPPORT_ROUTE).toContain("لا يمكن تقييم تذكرة غير محلولة");
  });

  it("upserts CSAT rating on conflict", () => {
    expect(SUPPORT_ROUTE).toContain('ON CONFLICT ("ticketId") DO UPDATE');
  });
});

describe("Support event emission contract", () => {
  it("emits support.ticket.created on creation", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.created"');
  });

  it("emits support.ticket.resolved on resolution", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.resolved"');
  });

  it("emits support.ticket.closed on close", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.closed"');
  });

  it("emits support.ticket.status_changed on other transitions", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.status_changed"');
  });

  it("emits support.ticket.assigned on assignee change", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.assigned"');
  });

  it("emits support.ticket.field_visit on field visit", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.field_visit"');
  });

  it("emits support.reply.created on reply", () => {
    expect(SUPPORT_ROUTE).toContain('"support.reply.created"');
  });

  it("emits support.ticket.csat_rated on CSAT submission", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.csat_rated"');
  });

  it("emits support.ticket.deleted on soft delete", () => {
    expect(SUPPORT_ROUTE).toContain('"support.ticket.deleted"');
  });

  it("emits KB events: created, updated, deleted, feedback", () => {
    expect(SUPPORT_ROUTE).toContain('"support.kb.created"');
    expect(SUPPORT_ROUTE).toContain('"support.kb.updated"');
    expect(SUPPORT_ROUTE).toContain('"support.kb.deleted"');
    expect(SUPPORT_ROUTE).toContain('"support.kb.feedback"');
  });
});

describe("Support security contracts", () => {
  it("all ticket queries include companyId scoping", () => {
    const ticketSelects = SUPPORT_ROUTE.matchAll(
      /FROM support_tickets[^;]*WHERE[^;]*/g
    );
    for (const match of ticketSelects) {
      const sql = match[0];
      // Queries using buildScopedWhere inject companyId via ${where}
      const hasDynamicScope = sql.includes("${where}") || sql.includes("${baseWhere}");
      // Re-reads by PK after insert/update are safe (row was just created with companyId)
      const isReReadByPk = /WHERE\s+id=\$1`/.test(sql) && !sql.includes("AND ");
      if (!hasDynamicScope && !isReReadByPk) {
        expect(sql).toContain("companyId");
      }
    }
  });

  it("all ticket UPDATEs include companyId in WHERE", () => {
    const updates = SUPPORT_ROUTE.matchAll(
      /UPDATE\s+support_tickets\s+SET[^;]+WHERE[^;]+/g
    );
    for (const match of updates) {
      expect(match[0]).toContain("companyId");
    }
  });

  it("ticket list filters deletedAt IS NULL", () => {
    const listIdx = SUPPORT_ROUTE.indexOf('router.get("/tickets"');
    // Slice widened from 900 → 1600 after the handler grew (added
    // buildScopedWhere + status/priority filters + LEFT JOIN soft-delete
    // predicates) so the SELECT body falls within the captured range.
    const listSection = SUPPORT_ROUTE.slice(listIdx, listIdx + 1600);
    expect(listSection).toContain('"deletedAt" IS NULL');
  });

  it("ticket detail filters deletedAt IS NULL", () => {
    const detailIdx = SUPPORT_ROUTE.indexOf('router.get("/tickets/:id"');
    const detailSection = SUPPORT_ROUTE.slice(detailIdx, detailIdx + 600);
    expect(detailSection).toContain('"deletedAt" IS NULL');
  });

  it("soft delete uses deletedAt=NOW() not physical delete", () => {
    const deleteIdx = SUPPORT_ROUTE.indexOf('router.delete("/tickets/:id"');
    const deleteSection = SUPPORT_ROUTE.slice(deleteIdx, deleteIdx + 700);
    expect(deleteSection).toContain('"deletedAt"=NOW()');
    expect(deleteSection).not.toContain("DELETE FROM support_tickets");
  });

  it("PATCH handler requires support:write permission", () => {
    const idx = SUPPORT_ROUTE.indexOf('router.patch("/tickets/:id"');
    const lineEnd = SUPPORT_ROUTE.indexOf("\n", idx);
    const line = SUPPORT_ROUTE.slice(idx, lineEnd);
    expect(line).toContain('authorize(');
  });

  it("creation handler requires support:create permission", () => {
    const idx = SUPPORT_ROUTE.indexOf('router.post("/tickets"');
    const lineEnd = SUPPORT_ROUTE.indexOf("\n", idx);
    const line = SUPPORT_ROUTE.slice(idx, lineEnd);
    expect(line).toContain('authorize(');
  });

  it("KB articles scoped by companyId", () => {
    const kbUpdates = SUPPORT_ROUTE.matchAll(
      /UPDATE\s+kb_articles\s+SET[^;]+WHERE[^;]+/g
    );
    for (const match of kbUpdates) {
      expect(match[0]).toContain("companyId");
    }
  });
});

describe("Support audit log contract", () => {
  it("creates audit log on ticket creation", () => {
    const createIdx = SUPPORT_ROUTE.indexOf('router.post("/tickets"');
    const section = SUPPORT_ROUTE.slice(createIdx, SUPPORT_ROUTE.indexOf("router.", createIdx + 10));
    expect(section).toContain("createAuditLog");
    expect(section).toContain('entity: "support_tickets"');
  });

  it("creates audit log on ticket update (via applyTransition)", () => {
    const patchIdx = SUPPORT_ROUTE.indexOf('router.patch("/tickets/:id"');
    const section = SUPPORT_ROUTE.slice(patchIdx, SUPPORT_ROUTE.indexOf("router.", patchIdx + 10));
    expect(section).toContain("applyTransition");
    expect(section).toContain('entity: "support_tickets"');
  });

  it("creates audit log on ticket deletion", () => {
    const deleteIdx = SUPPORT_ROUTE.indexOf('router.delete("/tickets/:id"');
    const section = SUPPORT_ROUTE.slice(deleteIdx, SUPPORT_ROUTE.indexOf("router.", deleteIdx + 10));
    expect(section).toContain("createAuditLog");
    expect(section).toContain('action: "delete"');
  });

  it("creates audit log on reply creation", () => {
    const replyIdx = SUPPORT_ROUTE.indexOf('router.post("/tickets/:id/replies"');
    const section = SUPPORT_ROUTE.slice(replyIdx, SUPPORT_ROUTE.indexOf("router.", replyIdx + 10));
    expect(section).toContain("createAuditLog");
    expect(section).toContain('entity: "ticket_replies"');
  });

  it("creates audit log on field visit", () => {
    const fieldIdx = SUPPORT_ROUTE.indexOf('router.post("/tickets/:id/field-visit"');
    const section = SUPPORT_ROUTE.slice(fieldIdx, SUPPORT_ROUTE.indexOf("router.", fieldIdx + 10));
    expect(section).toContain("createAuditLog");
    expect(section).toContain('entity: "field_visits"');
  });
});
