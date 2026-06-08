import { describe, it, expect } from "vitest";
import { SELF_APPROVAL_CREATOR_SQL, resolveRequester } from "../../src/lib/rbac/selfApprovalCreators.js";

// The previous inline self-approval map named non-existent tables/columns for
// 5 of 6 request types, so the maker-checker guard was silently skipped. These
// tests pin the corrected resolvers: every refType is mapped, and (with a DB)
// each resolver SQL actually executes against the real schema — which is what
// would have caught the original 42703/42P01 typos.

const REQUIRED_REF_TYPES = [
  "leave_request",
  "purchase_order",
  "expense",
  "salary_advance",
  "custody",
  "official_letter",
];

const HAS_DB = !!process.env.DATABASE_URL;

describe("self-approval creator resolvers", () => {
  it("maps every approval refType that flows through the HR decision endpoint", () => {
    for (const t of REQUIRED_REF_TYPES) {
      expect(SELF_APPROVAL_CREATOR_SQL[t], `missing resolver for refType "${t}"`).toBeTruthy();
    }
  });

  it("each resolver selects the employeeId/assignmentId shape", () => {
    for (const [t, sql] of Object.entries(SELF_APPROVAL_CREATOR_SQL)) {
      expect(sql, `${t} must expose "employeeId"`).toContain('"employeeId"');
      expect(sql, `${t} must expose "assignmentId"`).toContain('"assignmentId"');
      // tenant-scoped for defence in depth
      expect(sql, `${t} must filter by companyId`).toContain('"companyId" = $2');
    }
  });

  // DB-backed: proves every table/column referenced actually exists. Skips on
  // dev boxes without a database; runs in CI (guard.yml provisions Postgres)
  // and in the local guard (DATABASE_URL set), which is the real gate.
  it.skipIf(!HAS_DB)("every resolver SQL executes against the live schema without error", async () => {
    for (const t of REQUIRED_REF_TYPES) {
      // refId 0 / companyId 0 match nothing → expect null, but a bad table or
      // column name would throw 42P01/42703 here.
      const result = await resolveRequester(t, 0, 0);
      expect(result, `resolver "${t}" should return null for a non-existent record`).toBeNull();
    }
  });
});
