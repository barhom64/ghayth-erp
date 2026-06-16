import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FIN-SUB-05 (#2101) — the finance direction/label maps used to be hand-kept
// in two identical copies (D-02/D-07): the backend enforcement map in
// financeOperationContext.ts and the frontend form-hint map in
// scenario-model.ts. Drift = the form allowing what the server rejects.
// They now both consume ONE canonical source:
//   @workspace/api-zod/financeDirectionMaps
// This test pins that unification: (1) the BE export is the exact shared
// object (identity), and (2) the FE no longer carries its own literal copy —
// it imports from the shared package.

import {
  VOUCHER_COUNTER_ACCOUNT_TYPES as SHARED_COUNTER_TYPES,
  ACCOUNT_TYPE_LABELS as SHARED_LABELS,
} from "@workspace/api-zod/financeDirectionMaps";
import { VOUCHER_OPERATION_COUNTER_TYPES } from "../../src/lib/financeOperationContext.js";

const repoRoot = join(import.meta.dirname!, "../../../..");
const SCENARIO_MODEL = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/lib/finance/scenario-model.ts"),
  "utf8",
);

describe("FIN-SUB-05 (#2101) — unified finance direction maps", () => {
  it("the backend export is the SAME object as the shared canonical source (identity)", () => {
    // Re-export under the legacy BE name must be the shared object itself,
    // not a copy — so they can never drift.
    expect(VOUCHER_OPERATION_COUNTER_TYPES).toBe(SHARED_COUNTER_TYPES);
  });

  it("the shared map preserves the exact #1945 semantics (no value change)", () => {
    expect(SHARED_COUNTER_TYPES).toEqual({
      receipt: ["revenue"],
      rent: ["revenue"],
      invoice_payment: ["asset"],
      deposit: ["liability"],
      refund: ["expense", "revenue"],
      payment: ["expense"],
      vendor_invoice: ["liability", "expense"],
      salary: ["expense"],
      advance: ["asset"],
      legal_fee: ["expense"],
      purchase: ["expense", "asset"],
      custody: ["asset"],
      insurance: ["expense", "asset"],
      maintenance: ["expense"],
    });
  });

  it("the shared labels preserve the exact Arabic labels (no value change)", () => {
    expect(SHARED_LABELS).toEqual({
      asset: "أصول/ذمم",
      liability: "التزامات",
      equity: "حقوق ملكية",
      revenue: "إيراد",
      expense: "مصروف",
    });
  });

  it("the frontend scenario-model imports the maps from the shared package", () => {
    expect(SCENARIO_MODEL).toMatch(
      /from\s+["']@workspace\/api-zod\/financeDirectionMaps["']/,
    );
  });

  it("the frontend no longer carries its own literal copy of the maps", () => {
    // The old duplicate declared `export const VOUCHER_COUNTER_ACCOUNT_TYPES:
    // Record<string, AccountTypeKey[]> = { ... }`. After unification the FE
    // only re-exports it (`export { VOUCHER_COUNTER_ACCOUNT_TYPES }`); there
    // must be no local literal definition anymore.
    expect(SCENARIO_MODEL).not.toMatch(
      /(export\s+)?const\s+VOUCHER_COUNTER_ACCOUNT_TYPES\s*[:=]/,
    );
    expect(SCENARIO_MODEL).not.toMatch(
      /(export\s+)?const\s+ACCOUNT_TYPE_LABELS_AR\s*[:=]/,
    );
  });
});
