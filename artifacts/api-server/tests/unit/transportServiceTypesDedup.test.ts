import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #TA-T18-UX-AUDIT — TRANSPORT_SERVICE_TYPES was copy-pasted byte-identically
// into five route files (bookings / planning / pricing / cargo /
// fleet-rules-admin). Consolidated into lib/transportEnums.ts — the backend
// mirror of the SPA-side ROUTE_TYPES dedup (lib/transport-constants.ts). This
// guard keeps the enum single-source so it can't drift back apart.

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const SHARED = "lib/transportEnums.ts";
const CONSUMERS = [
  "routes/transport-bookings.ts",
  "routes/transport-planning.ts",
  "routes/transport-pricing.ts",
  "routes/cargo.ts",
  "routes/fleet-rules-admin.ts",
];

describe("#TA-T18 — TRANSPORT_SERVICE_TYPES single source", () => {
  it("the shared module exports the enum with the six canonical values", () => {
    expect(existsSync(join(apiSrc, SHARED))).toBe(true);
    const src = read(SHARED);
    expect(src).toMatch(/export const TRANSPORT_SERVICE_TYPES/);
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(src, `value ${v} missing`).toContain(`"${v}"`);
    }
    // keeps the readonly tuple so z.enum(...) + typeof[number] stay valid.
    expect(src).toMatch(/\] as const;/);
  });

  it("all five route files import it and none redeclare it locally", () => {
    for (const f of CONSUMERS) {
      const src = read(f);
      expect(src, `${f} does not import the shared enum`).toMatch(
        /import \{ TRANSPORT_SERVICE_TYPES \} from "\.\.\/lib\/transportEnums\.js"/,
      );
      expect(src, `${f} still declares TRANSPORT_SERVICE_TYPES locally`).not.toMatch(
        /const TRANSPORT_SERVICE_TYPES\s*=/,
      );
    }
  });
});
