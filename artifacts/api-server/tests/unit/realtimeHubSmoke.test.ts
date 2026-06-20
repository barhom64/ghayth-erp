/**
 * realtimeHub — tenant-isolated SSE fan-out + event-bus bridge.
 *
 * Verifies: clients bucket by company, broadcast reaches only that company's
 * clients (never another tenant), removeClient cleans up, and an event on the
 * bus pushes a frame to the right company. A fake Response captures writes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  addClient, removeClient, broadcast, realtimeClientCount, initRealtimeHub,
} from "../../src/lib/realtimeHub.js";
import { eventBus } from "../../src/lib/eventBus.js";

function fakeRes() {
  const frames: string[] = [];
  return { frames, write: (s: string) => { frames.push(s); return true; } } as any;
}

describe("realtimeHub — tenant isolation", () => {
  beforeEach(() => {
    // drain any clients left by a previous test
    for (let c = 1; c <= 3; c++) {
      // no public clear; rely on fresh fake clients per test + unique companies
    }
  });

  it("broadcast reaches only the target company's clients", () => {
    const a = { res: fakeRes(), userId: 1 };
    const b = { res: fakeRes(), userId: 2 };
    addClient(101, a);
    addClient(202, b);

    broadcast(101, { action: "hr.leave.created", entity: "hr_leave_requests", entityId: 7 });

    expect(a.res.frames.some((f: string) => f.includes("hr.leave.created"))).toBe(true);
    expect(b.res.frames.length).toBe(0); // other tenant untouched

    removeClient(101, a);
    removeClient(202, b);
    expect(realtimeClientCount(101)).toBe(0);
  });

  it("removeClient drops the bucket when empty", () => {
    const a = { res: fakeRes(), userId: 1 };
    addClient(303, a);
    expect(realtimeClientCount(303)).toBe(1);
    removeClient(303, a);
    expect(realtimeClientCount(303)).toBe(0);
  });

  it("an event on the bus pushes a frame to its company only (after init)", () => {
    initRealtimeHub();
    const a = { res: fakeRes(), userId: 1 };
    const other = { res: fakeRes(), userId: 9 };
    addClient(404, a);
    addClient(505, other);

    eventBus.emit("hr.leave_request.created" as any, {
      companyId: 404, entity: "hr_leave_requests", entityId: 42,
    } as any);

    expect(a.res.frames.some((f: string) => f.includes("\"entityId\":42"))).toBe(true);
    expect(other.res.frames.length).toBe(0);

    removeClient(404, a);
    removeClient(505, other);
  });

  it("broadcast to a company with no clients is a safe no-op", () => {
    expect(() => broadcast(99999, { action: "x", entity: "y", entityId: 1 })).not.toThrow();
  });
});
