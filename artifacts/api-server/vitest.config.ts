import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Integration tests under tests/integration/*.dynamic.test.ts share
    // a single test-postgres instance and TRUNCATE the same companies /
    // branches / users tables in their fixture setUp. Vitest's default
    // file-level parallelism races those TRUNCATEs against each other:
    // one test's fixture wipes another's auth tokens (→ 401 on routes
    // that expect 403/404/422), or wipes companies between two FK
    // lookups (→ branches_companyId_fkey violation). Pin integration
    // tests to a single fork so fixtures stay atomic. Unit tests keep
    // parallel execution — they don't touch the real DB.
    poolMatchGlobs: [
      ["tests/integration/**/*.test.ts", "forks"],
    ],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
