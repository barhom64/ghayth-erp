import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Dedicated component-test config (jsdom + testing-library). Kept separate
// from vite.config.ts because that file throws when PORT/BASE_PATH are unset —
// which is always the case in CI/test. Mirrors the `@` alias so component
// tests import exactly like the app does.
export default defineConfig({
  plugins: [react()],
  // Force react/react-dom to load their DEVELOPMENT builds (which export
  // `act`); otherwise the production build is resolved and RTL throws
  // "React.act is not a function".
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // React 19 + RTL: react must be transformed (ESM) so `React.act` is
    // available — otherwise vitest externalises the production CJS build of
    // react (no `act`) and RTL falls back to react-dom test-utils → throws.
    server: { deps: { inline: ["react", "react-dom", "@testing-library/react"] } },
  },
});
