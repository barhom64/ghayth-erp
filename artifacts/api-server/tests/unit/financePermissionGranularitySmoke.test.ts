import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const FEATURE_CATALOG = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/featureCatalog.ts"),
  "utf8",
);

// ─── Audit finding F4: broad "finance" feature must be 0 usages ──────────
// The audit caught 2 routes still using the broad catch-all
// authorize({ feature: "finance", ... }) instead of granular sub-features.
// This smoke locks the fix: after the migration, no route across the
// entire backend may use the broad key.

describe("F4 — no route uses the broad 'finance' feature key", () => {
  it("scans every backend route file for authorize({ feature: \"finance\", ... })", () => {
    const offenders: string[] = [];
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const src = readFileSync(join(ROUTES_DIR, file), "utf8");
      // Look for the exact broad pattern. We want `feature: "finance"` with
      // NO dot after it — i.e. the parent key, not a sub-feature like
      // `finance.invoices`.
      const matches = src.match(/authorize\(\s*\{\s*feature:\s*"finance"(?!\.)\s*,/g);
      if (matches && matches.length > 0) {
        offenders.push(`${file}: ${matches.length} occurrence(s)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the two previously-broad routes now use granular keys", () => {
    const moduleDashboards = readFileSync(join(ROUTES_DIR, "moduleDashboards.ts"), "utf8");
    expect(moduleDashboards).toContain('feature: "finance.reports"');

    const operationsCenter = readFileSync(join(ROUTES_DIR, "operationsCenter.ts"), "utf8");
    expect(operationsCenter).toContain('feature: "finance.hardening"');
  });

  it("both granular keys are declared in the feature catalog", () => {
    expect(FEATURE_CATALOG).toMatch(/key:\s*"finance\.reports"/);
    expect(FEATURE_CATALOG).toMatch(/key:\s*"finance\.hardening"/);
  });
});
