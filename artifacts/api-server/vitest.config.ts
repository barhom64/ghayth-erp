import { defineConfig } from "vitest/config";

// Two vitest projects so unit tests keep parallel execution (~17s) and
// integration tests run serially against the shared test-postgres
// instance. The integration suite under tests/integration/*.dynamic.
// test.ts TRUNCATEs the same companies / branches / users tables in its
// fixture setUp; vitest's default file-level parallelism races those
// TRUNCATEs across files (one file's fixture wipes another's auth
// tokens → 401 on cross-tenant routes, or wipes companies between two
// FK lookups → branches_companyId_fkey violation). fileParallelism:
// false on the integration project alone serialises that suite without
// slowing the unit suite down.
export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 10000,
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          testTimeout: 10000,
          hookTimeout: 10000,
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
