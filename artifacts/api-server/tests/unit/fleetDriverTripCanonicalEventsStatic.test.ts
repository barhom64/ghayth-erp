import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Driver trip start/complete must emit the CANONICAL fleet.trip.started /
 * fleet.trip.completed events — not only the consumer-less driver_* variants.
 *
 * Gap traced from the dormant-handler review: the driver self-service routes
 * emitted `fleet.trip.driver_started` / `driver_completed` (no listeners),
 * while `fleet.trip.started` (journey "first trip" milestone + rulesEngine +
 * audit) and `fleet.trip.completed` (rules + audit) had listeners but were
 * NEVER emitted → those consumers were permanently dormant. The GL is posted
 * directly in the dispatch-completion route (not event-driven), so emitting
 * these is non-ledger and cannot double-post. Static / regex-only.
 */
const FLEET = readFileSync(
  join(import.meta.dirname!, "../../../..", "artifacts/api-server/src/routes/fleet.ts"), "utf8");

function handler(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/").replace(/:/g, ":")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method} ${path} not found`).toBeTruthy();
  return m![0];
}

describe("driver trip routes emit canonical fleet.trip events", () => {
  it("POST /me/trips/:id/start emits fleet.trip.started (alongside driver_started)", () => {
    const b = handler("post", "/me/trips/:id/start");
    expect(b).toMatch(/action: "fleet\.trip\.started"/);
    expect(b).toMatch(/action: "fleet\.trip\.driver_started"/);
  });
  it("POST /me/trips/:id/complete emits fleet.trip.completed (alongside driver_completed)", () => {
    const b = handler("post", "/me/trips/:id/complete");
    expect(b).toMatch(/action: "fleet\.trip\.completed"/);
    expect(b).toMatch(/action: "fleet\.trip\.driver_completed"/);
  });
});
