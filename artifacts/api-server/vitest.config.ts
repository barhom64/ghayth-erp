import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Benchmark files live alongside tests but are only executed by
    // `pnpm bench` (vitest bench). The `*.bench.ts` pattern keeps them
    // out of the regular `vitest run` test suite.
    benchmark: {
      include: ["tests/**/*.bench.ts"],
    },
  },
});
