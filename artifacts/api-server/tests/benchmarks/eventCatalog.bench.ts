// Benchmarks for the event-catalog lookup + payload validator.
// `emitEvent` (businessHelpers.ts) calls `validateEventPayload` on
// every emission, so these run N times per request where N is the
// number of side-effect events the handler emits (usually 1-3).
//
import { bench, describe } from "vitest";
import {
  getEventDefinition,
  isKnownEvent,
  validateEventPayload,
  listEventsByDomain,
  countEventsByDomain,
  listCriticalEvents,
} from "../../src/lib/eventCatalog.js";

const VALID_PAYLOAD = {
  invoiceId: 42,
  clientId: 7,
  total: 1419.68,
  status: "draft",
};

const MISSING_FIELD_PAYLOAD = {
  invoiceId: 42,
  // clientId missing
  total: 1419.68,
  status: "draft",
};

const WITH_AFTER_WRAPPER = {
  after: { invoiceId: 42, clientId: 7, total: 1419.68, status: "draft" },
};

describe("eventCatalog lookups", () => {
  bench("getEventDefinition — hot event (finance.invoice.created)", () => {
    getEventDefinition("finance.invoice.created");
  });

  bench("getEventDefinition — unknown event (Map miss)", () => {
    getEventDefinition("nonexistent.event.name");
  });

  bench("isKnownEvent — hot event", () => {
    isKnownEvent("finance.invoice.paid");
  });

  bench("isKnownEvent — unknown event", () => {
    isKnownEvent("nonexistent.event.name");
  });
});

describe("validateEventPayload", () => {
  bench("valid payload (every field present)", () => {
    validateEventPayload("finance.invoice.created", VALID_PAYLOAD);
  });

  bench("missing required field (warning path)", () => {
    validateEventPayload("finance.invoice.created", MISSING_FIELD_PAYLOAD);
  });

  bench("payload wrapped under .after (audit-diff shape)", () => {
    validateEventPayload("finance.invoice.created", WITH_AFTER_WRAPPER);
  });

  bench("uncataloged event (early return)", () => {
    validateEventPayload("test.uncataloged.event", VALID_PAYLOAD);
  });
});

describe("catalog aggregations", () => {
  bench("listEventsByDomain('finance')", () => {
    listEventsByDomain("finance");
  });

  bench("listCriticalEvents()", () => {
    listCriticalEvents();
  });

  bench("countEventsByDomain()", () => {
    countEventsByDomain();
  });
});
