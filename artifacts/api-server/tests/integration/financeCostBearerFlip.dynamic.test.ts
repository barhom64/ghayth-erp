// م٥ — integration assertion that migration 422's cost-bearer receivable mappings
// resolve to POSTABLE accounts on the seeded chart, so the costBearer journal flip
// (expense → party ذمة, docs/25 §١٠) lands on a real receivable, never a bad/group
// account. The flip LOGIC itself is asserted on the journal LINES (pure) in
// tests/unit/financeDocumentJournal.test.ts. resolveAccountCode throws via
// assertPostableAccount if the resolved code is non-postable — reaching the
// assertion means it IS postable. Skips without the test DB. Constitution rule 3.
import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // Al-Diyaa (seeded SOCPA chart)

d("م٥ — cost-bearer receivable intents resolve to POSTABLE accounts (live DB)", () => {
  let resolveAccountCode: (op: string, fb: string) => Promise<string>;

  beforeAll(async () => {
    const { financialEngine } = await import("../../src/lib/engines/index.js");
    resolveAccountCode = (op, fb) => financialEngine.resolveAccountCode(COMPANY, op, "debit", fb);
  });

  const cases: Array<[string, string]> = [
    ["cost_bearer_receivable_driver", "1143"],
    ["cost_bearer_receivable_employee", "1143"],
    ["cost_bearer_receivable_tenant", "1131"],
    ["cost_bearer_receivable_customer", "1131"],
    ["cost_bearer_receivable_supplier", "1190"],
    ["cost_bearer_receivable_insurance", "1191"],
    ["cost_bearer_receivable_third_party", "1192"],
  ];

  it("every cost-bearer intent resolves to a real postable receivable (migration 422 seed)", async () => {
    for (const [op, fb] of cases) {
      // throws (assertPostableAccount) if the resolved account is missing / non-postable.
      const code = await resolveAccountCode(op, fb);
      expect(code, `${op} must resolve to a code`).toBeTruthy();
    }
  });
});
