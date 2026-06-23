import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENT_CATALOG } from "../../src/lib/eventCatalog.js";

/**
 * §10 of #1870 — pins the umrah Events Catalog completeness +
 * the new canonical emit hooks.
 *
 * The issue lists 17 required events; this PR's job:
 *   1. Every required event has a catalog entry (Arabic label,
 *      description, payload schema, consumers, side-effects).
 *   2. Events emitted in code use the canonical names. Legacy
 *      names stay alongside the new ones (back-compat — runtime
 *      listeners don't break) until callers migrate.
 *
 * The two deferred events (commission.approved, commission.posted)
 * have catalog entries but no emit hook yet — the state machine
 * work that fires them is multi-PR scope. group.ready_for_transport
 * is in the same bucket.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
const INVOICING = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
// U-07 Phase 21 — the sales-invoice generate route (and its dual emits) was
// carved into umrah-invoices.ts; the route-path emit assertions read it there.
const ENTITIES_ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-invoices.ts"),
  "utf8",
);
const NOTIFY = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInternalNotifications.ts"),
  "utf8",
);

const REQUIRED_EVENTS = [
  "umrah.import.previewed",
  "umrah.import.confirmed",
  "umrah.import.unlinked_rows_detected",
  "umrah.pilgrim.created",
  "umrah.pilgrim.arrived",
  "umrah.pilgrim.departed",
  "umrah.pilgrim.overstay_risk",
  "umrah.pilgrim.overstayed",
  "umrah.penalty.created",
  "umrah.group.created",
  "umrah.group.ready_for_transport",
  "umrah.transport.requested",
  "umrah.nusk_invoice.created",
  "umrah.sales_invoice.created",
  "umrah.commission.calculated",
  "umrah.commission.approved",
  "umrah.commission.posted",
] as const;

describe("event catalog — §10 coverage", () => {
  it("every required umrah event from #1870 §10 has a catalog entry", () => {
    const present = new Set(EVENT_CATALOG.map((e) => e.name));
    const missing = REQUIRED_EVENTS.filter((name) => !present.has(name));
    expect(
      missing,
      `missing from EVENT_CATALOG (#1870 §10): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("each §10 entry has a non-empty Arabic label", () => {
    for (const name of REQUIRED_EVENTS) {
      const entry = EVENT_CATALOG.find((e) => e.name === name);
      expect(entry, `missing entry for ${name}`).toBeTruthy();
      expect(entry!.label, `${name} label`).toBeTruthy();
      expect(entry!.label.length, `${name} label`).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(entry!.label), `${name} label needs Arabic`).toBe(true);
    }
  });

  it("each §10 entry sits under the 'umrah' domain", () => {
    for (const name of REQUIRED_EVENTS) {
      const entry = EVENT_CATALOG.find((e) => e.name === name);
      expect(entry!.domain, `${name}`).toBe("umrah");
    }
  });

  it("each §10 entry declares at least one payload field", () => {
    for (const name of REQUIRED_EVENTS) {
      const entry = EVENT_CATALOG.find((e) => e.name === name);
      expect(
        Object.keys(entry!.payload).length,
        `${name} needs a documented payload`,
      ).toBeGreaterThan(0);
    }
  });

  it("commission.approved + commission.posted are flagged critical", () => {
    // Without `critical: true`, the eventBus drops these on errors
    // — and a missed commission posting is a finance integrity
    // issue, not just a missed UX update.
    const approved = EVENT_CATALOG.find((e) => e.name === "umrah.commission.approved");
    const posted = EVENT_CATALOG.find((e) => e.name === "umrah.commission.posted");
    expect(approved!.critical).toBe(true);
    expect(posted!.critical).toBe(true);
  });

  it("import.confirmed + sales_invoice.created are flagged critical", () => {
    expect(EVENT_CATALOG.find((e) => e.name === "umrah.import.confirmed")!.critical).toBe(true);
    expect(EVENT_CATALOG.find((e) => e.name === "umrah.sales_invoice.created")!.critical).toBe(true);
  });
});

describe("emit hooks — import.confirmed alongside legacy event", () => {
  it("confirmMutamersImport emits both legacy AND canonical event", () => {
    // Back-compat: legacy listeners keep receiving the old event.
    // The new canonical event lets new listeners (rule builder,
    // operations dashboard) subscribe to the spec name.
    expect(ENGINE).toMatch(/action: "umrah\.mutamers\.imported"/);
    expect(ENGINE).toMatch(/action: "umrah\.import\.confirmed"[\s\S]{0,200}fileType: "mutamers"/);
  });

  it("confirmVouchersImport emits both legacy AND canonical event", () => {
    expect(ENGINE).toMatch(/action: "umrah\.vouchers\.imported"/);
    expect(ENGINE).toMatch(/action: "umrah\.import\.confirmed"[\s\S]{0,200}fileType: "vouchers"/);
  });
});

describe("emit hooks — sales_invoice.created alongside legacy event", () => {
  it("generateSalesInvoice emits both legacy AND canonical event", () => {
    expect(INVOICING).toMatch(/action: "umrah\.invoice\.generated"/);
    expect(INVOICING).toMatch(/action: "umrah\.sales_invoice\.created"/);
  });

  it("POST /invoices route emits both legacy AND canonical event", () => {
    // Defence in depth — the engine path AND the route path both
    // fire. Some callers route directly through the engine.
    expect(ENTITIES_ROUTE).toMatch(/action: "umrah\.invoice\.generated"/);
    expect(ENTITIES_ROUTE).toMatch(/action: "umrah\.sales_invoice\.created"/);
  });
});

describe("emit hooks — transport.requested alongside legacy event", () => {
  it("POST /transport emits both legacy AND canonical event", () => {
    expect(ROUTE).toMatch(/action: "umrah\.transport\.created"/);
    expect(ROUTE).toMatch(/action: "umrah\.transport\.requested"/);
  });
});

describe("emit hooks — overstay_risk fires from the visa-expiring notification", () => {
  it("notifyInternalVisaExpiring emits umrah.pilgrim.overstay_risk", () => {
    // This is the predictive event. Visa expiring AND near-overstay
    // both surface as overstay_risk so the dashboard can react
    // BEFORE the actual overstay.
    expect(NOTIFY).toMatch(/action: "umrah\.pilgrim\.overstay_risk"/);
    expect(NOTIFY).toMatch(/reason: "visa_expiring"/);
  });

  it("emits regardless of recipient count (event stream stability)", () => {
    // Was the recipient resolver fails to find a branch manager,
    // the emit must still happen — listeners that don't care
    // about who got the alert (audit, dashboard) still want the
    // raw event.
    const fn = NOTIFY.match(/notifyInternalVisaExpiring[\s\S]+?\n\}\n/);
    expect(fn).not.toBeNull();
    const emitIdx = fn![0].indexOf('action: "umrah.pilgrim.overstay_risk"');
    const recipientGuardIdx = fn![0].indexOf("recipients.length === 0");
    expect(emitIdx).toBeGreaterThan(0);
    expect(recipientGuardIdx).toBeGreaterThan(0);
    expect(emitIdx).toBeLessThan(recipientGuardIdx);
  });

  it("emitEvent is imported from businessHelpers in this file", () => {
    expect(NOTIFY).toMatch(/createNotification, emitEvent, getManagerAssignmentId/);
  });
});
