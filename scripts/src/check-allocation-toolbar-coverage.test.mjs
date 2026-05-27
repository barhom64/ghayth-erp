// Smoke test for AllocationTabsNav coverage. Run with:
//   node --test scripts/src/check-allocation-toolbar-coverage.test.mjs
//
// Ensures every page in the finance line-level-allocation cluster
// renders the shared <AllocationTabsNav /> component, so the operator
// can bounce between rules / coverage / results / overrides / catalog
// with one click on any allocation page. Without this, future page
// additions could silently fragment the cluster again.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "../..");
const PAGES_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance");

const PAGES = [
  "allocation-rules.tsx",
  "allocation-results.tsx",
  "allocation-coverage.tsx",
  "allocation-override-log.tsx",
  "overrides-report.tsx",
  "product-catalog.tsx",
];

const COMPONENT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/allocation-tabs-nav.tsx"),
  "utf8",
);

describe("AllocationTabsNav component", () => {
  it("exports AllocationTabsNav", () => {
    assert.match(COMPONENT, /export function AllocationTabsNav\(\)/);
  });
  it("queries the enforce-line-allocation setting endpoint", () => {
    assert.ok(COMPONENT.includes('"/finance/settings/enforce-line-allocation"'));
  });
  it("lists all 7 allocation cluster destinations as tabs", () => {
    for (const href of [
      "/finance/settings-hub",
      "/finance/allocation-rules",
      "/finance/product-catalog",
      "/finance/allocation-coverage",
      "/finance/allocation-results",
      "/finance/overrides-report",
      "/finance/allocation-override-log",
    ]) {
      assert.ok(COMPONENT.includes(`href: "${href}"`), `tab missing: ${href}`);
    }
  });
});

describe("every allocation page renders AllocationTabsNav", () => {
  for (const fname of PAGES) {
    it(fname, () => {
      const path = join(PAGES_DIR, fname);
      assert.ok(existsSync(path), `page not found: ${fname}`);
      const src = readFileSync(path, "utf8");
      assert.ok(
        src.includes('from "@/components/shared/allocation-tabs-nav"'),
        `${fname} missing AllocationTabsNav import`,
      );
      assert.ok(
        src.includes("<AllocationTabsNav"),
        `${fname} missing <AllocationTabsNav /> render`,
      );
    });
  }
});
