/**
 * HR-REV-2 (#2222) — contract-type label consolidation.
 *
 * contracts.tsx carried a local CONTRACT_TYPE_MAP that duplicated (and drifted
 * from) the central CONTRACT_TYPES in hr-type-maps.ts. This pins that the page
 * now consumes the central map via hrLabel, and that the central map carries
 * every label the local one had (incl. probation). Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MAPS = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/lib/hr-type-maps.ts"),
  "utf8",
);
const CONTRACTS = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/contracts.tsx"),
  "utf8",
);

describe("HR-REV-2 — central CONTRACT_TYPES is the single source", () => {
  it("carries every label the old local map had (incl. probation)", () => {
    expect(MAPS).toMatch(/full_time: "دوام كامل"/);
    expect(MAPS).toMatch(/part_time: "دوام جزئي"/);
    expect(MAPS).toMatch(/contract: "عقد مؤقت"/);
    expect(MAPS).toMatch(/probation: "فترة تجربة"/);
    expect(MAPS).toMatch(/freelance: "عمل حر"/);
  });
});

describe("HR-REV-2 — contracts.tsx consumes the central map", () => {
  it("imports CONTRACT_TYPES + hrLabel from hr-type-maps", () => {
    expect(CONTRACTS).toMatch(/import \{ CONTRACT_TYPES, hrLabel \} from "@\/lib\/hr-type-maps"/);
  });
  it("renders contractType via hrLabel(CONTRACT_TYPES, …)", () => {
    expect(CONTRACTS).toMatch(/hrLabel\(CONTRACT_TYPES, r\.contractType\)/);
  });
  it("no longer defines a local CONTRACT_TYPE_MAP", () => {
    expect(CONTRACTS).not.toMatch(/const CONTRACT_TYPE_MAP/);
  });
});
