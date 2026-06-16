/**
 * P0-4 — unit status graph has exactly ONE source of truth.
 *
 * properties.ts used to carry a private UNIT_TRANSITIONS literal that
 * silently diverged from lifecycleEngine's STATE_MACHINES entry for
 * property_units (the engine knew 4 states, the route knew 6). A
 * transition the route allowed was illegal by the engine's machine
 * and vice versa — whichever copy a future feature consulted, it
 * could disagree with the other.
 *
 * The fix mirrors SUP-016 (support_tickets): the engine map is the
 * single source; the route derives its guard from it. These tests
 * pin both halves so the duplicate can't quietly come back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_MACHINES } from "../../src/lib/lifecycleEngine.js";

const PROPERTIES_SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/properties.ts"),
  "utf8",
);

const machine = STATE_MACHINES.find((sm) => sm.entity === "property_units");

describe("lifecycleEngine — property_units machine", () => {
  it("exists", () => {
    expect(machine).toBeDefined();
  });

  it("covers all six real-world unit states", () => {
    const states = Object.keys(machine!.transitions).sort();
    expect(states).toEqual(
      [
        "available",
        "maintenance",
        "out_of_service",
        "rented",
        "reserved",
        "under_maintenance",
      ].sort(),
    );
  });

  it("every transition target is itself a known source state (closed graph)", () => {
    const states = new Set(Object.keys(machine!.transitions));
    for (const [from, targets] of Object.entries(machine!.transitions)) {
      for (const to of targets) {
        expect(states.has(to), `${from} → ${to}: target not in graph`).toBe(true);
      }
    }
  });

  it("business invariants: reserved can convert or release; rented can vacate", () => {
    expect(machine!.transitions.reserved).toContain("rented");
    expect(machine!.transitions.reserved).toContain("available");
    expect(machine!.transitions.rented).toContain("available");
  });

  it("no state can jump directly from rented to reserved (must vacate first)", () => {
    expect(machine!.transitions.rented).not.toContain("reserved");
  });
});

describe("properties.ts — derives its guard from the engine, no private copy", () => {
  it("UNIT_TRANSITIONS is read from STATE_MACHINES", () => {
    expect(PROPERTIES_SRC).toContain(
      `STATE_MACHINES.find((sm) => sm.entity === "property_units")`,
    );
  });

  it("the old private transition literal is gone", () => {
    // The literal's most distinctive line: available's full fan-out
    // written as an object property inside properties.ts. The derived
    // version contains no such literal.
    expect(PROPERTIES_SRC).not.toMatch(
      /available:\s*\[\s*"rented",\s*"maintenance",\s*"under_maintenance"/,
    );
  });

  it("UNIT_STATUSES is derived from the machine's key set", () => {
    expect(PROPERTIES_SRC).toContain(
      "const UNIT_STATUSES = Object.keys(UNIT_TRANSITIONS)",
    );
  });

  it("imports STATE_MACHINES from lifecycleEngine", () => {
    expect(PROPERTIES_SRC).toMatch(
      /import \{[^}]*STATE_MACHINES[^}]*\} from "\.\.\/lib\/lifecycleEngine\.js"/,
    );
  });
});
