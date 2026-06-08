import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

// #1715 (comment 9) — "finance must be governed AND helpful". This smoke test
// locks the contract that the system derives a specialized posting account
// from the allocation target/item kind and surfaces it to the operator before
// they post, instead of silently dumping everything on a generic account.

describe("finance practical usability — specialized account derivation", () => {
  const LIB = read("artifacts/api-server/src/lib/financeSpecializedAccount.ts");
  const ROUTE = read("artifacts/api-server/src/routes/finance-journal.ts");

  it("the specialized-account derivation lib exists and exports the deriver", () => {
    expect(LIB).toContain("export function deriveSpecializedAccount");
    // it returns a remappable purpose + a seed default, never a bare code
    expect(LIB).toContain("purpose");
    expect(LIB).toContain("defaultCode");
    expect(LIB).toContain("capitalize");
  });

  it("covers every allocation target type so no link is left generic by accident", () => {
    for (const target of [
      "vehicle",
      "vehicle_maintenance",
      "property",
      "property_maintenance",
      "unit",
      "contract",
      "project",
      "umrah_season",
      "umrah_agent",
      "transport_trip",
      "fixed_asset",
    ]) {
      expect(LIB).toContain(`${target}:`);
    }
  });

  it("the expense impact-preview accepts targetType and surfaces the suggested account", () => {
    expect(ROUTE).toContain("targetType: z.string().optional()");
    expect(ROUTE).toContain("deriveSpecializedAccount");
    // the hint must be presented as an item in the preview response
    expect(ROUTE).toMatch(/المصروف المقترح|الرسملة المقترح/);
  });
});
