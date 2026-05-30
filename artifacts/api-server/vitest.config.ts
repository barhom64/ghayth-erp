import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Run test files sequentially. The integration suite shares the
    // same disposable Postgres + a single `companies` table; running
    // in parallel makes one test file's `TRUNCATE ... CASCADE` wipe
    // the rows another is mid-flight on, surfacing as FK violations
    // (numberingService.dynamic.test.ts → 23503 on branches.companyId)
    // and 401 responses (branchIsolation.dynamic.test.ts — JWT users
    // get cascade-deleted). The unit suite is fast enough that losing
    // file-level parallelism adds <30s, vs. flaky CI that costs every
    // PR multiple retry cycles. See PR #1423 for the failure pattern.
    fileParallelism: false,
  },
});
