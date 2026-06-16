/**
 * HR-REV-5/6 (#2222) — centralized HR display label maps.
 *
 * The employee detail page used to render raw enum values (visaType,
 * contractType) and an inline iqamaStatus ternary. This pins the
 * centralized label maps in hr-type-maps.ts and that employee-detail.tsx
 * routes those three fields through them. Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MAPS = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/lib/hr-type-maps.ts"),
  "utf8",
);
const DETAIL = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);

describe("HR-REV-5/6 — label maps exist in hr-type-maps.ts", () => {
  it("VISA_TYPES maps the known visa enums to Arabic", () => {
    expect(MAPS).toMatch(/export const VISA_TYPES: Record<string, string> = \{/);
    expect(MAPS).toMatch(/work: "عمل"/);
    expect(MAPS).toMatch(/umrah: "عمرة"/);
  });
  it("CONTRACT_TYPES maps the contract enums to Arabic", () => {
    expect(MAPS).toMatch(/export const CONTRACT_TYPES: Record<string, string> = \{/);
    expect(MAPS).toMatch(/full_time: "دوام كامل"/);
    expect(MAPS).toMatch(/freelance: "عمل حر"/);
  });
  it("IQAMA_STATUS maps the residency-permit states to Arabic", () => {
    expect(MAPS).toMatch(/export const IQAMA_STATUS: Record<string, string> = \{/);
    expect(MAPS).toMatch(/renewal_pending: "قيد التجديد"/);
  });
  it("exports an hrLabel() resolver with raw-value + dash fallback", () => {
    expect(MAPS).toMatch(/export function hrLabel\(map: Record<string, string>, value: string \| null \| undefined\): string/);
    expect(MAPS).toMatch(/return map\[value\] \?\? value;/);
  });
});

describe("HR-REV-5/6 — employee-detail routes raw enums through the maps", () => {
  it("imports the maps + hrLabel", () => {
    expect(DETAIL).toMatch(/import \{ VISA_TYPES, CONTRACT_TYPES, IQAMA_STATUS, hrLabel \} from "@\/lib\/hr-type-maps"/);
  });
  it("renders iqamaStatus / visaType / contractType via hrLabel", () => {
    expect(DETAIL).toMatch(/hrLabel\(IQAMA_STATUS, employee\.iqamaStatus\)/);
    expect(DETAIL).toMatch(/hrLabel\(VISA_TYPES, employee\.visaType\)/);
    expect(DETAIL).toMatch(/hrLabel\(CONTRACT_TYPES, contract\.contractType\)/);
  });
  it("no longer carries the inline iqamaStatus ternary", () => {
    expect(DETAIL).not.toMatch(/employee\.iqamaStatus === "active" \? "سارية"/);
  });
});
