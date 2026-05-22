import { describe, it, expect } from "vitest";
import {
  eventBus,
  stampEnvelope,
  EVENT_ENVELOPE_VERSION,
  type EventPayload,
} from "../../src/lib/eventBus.js";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe("eventBus — envelope versioning", () => {
  it("stamps v + occurredAt on every emitted event", () => {
    let received: EventPayload | undefined;
    const listener = (p: EventPayload) => {
      received = p;
    };
    eventBus.once("test.envelope.basic", listener);
    eventBus.emit("test.envelope.basic", { companyId: 7 });

    expect(received).toBeDefined();
    expect(received!.v).toBe(EVENT_ENVELOPE_VERSION);
    expect(received!.occurredAt).toMatch(ISO_8601);
    expect(received!.companyId).toBe(7);
  });

  it("does not mutate the caller's payload object", () => {
    const original: EventPayload = { companyId: 1 };
    eventBus.once("test.envelope.nomutate", () => {});
    eventBus.emit("test.envelope.nomutate", original);

    expect(original.v).toBeUndefined();
    expect(original.occurredAt).toBeUndefined();
  });

  it("preserves a pre-set v / occurredAt (idempotent re-stamp)", () => {
    const preset: EventPayload = {
      v: 99,
      occurredAt: "2020-01-01T00:00:00.000Z",
      companyId: 2,
    };
    const stamped = stampEnvelope(preset);
    expect(stamped!.v).toBe(99);
    expect(stamped!.occurredAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("stampEnvelope passes undefined through unchanged", () => {
    expect(stampEnvelope(undefined)).toBeUndefined();
  });

  it("EVENT_ENVELOPE_VERSION is a positive integer", () => {
    expect(Number.isInteger(EVENT_ENVELOPE_VERSION)).toBe(true);
    expect(EVENT_ENVELOPE_VERSION).toBeGreaterThan(0);
  });
});
