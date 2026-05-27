// Smoke test for the "محرك التوجيه المحاسبي" sidebar group.
//   node --test scripts/src/check-allocation-sidebar-coverage.test.mjs
//
// Ensures the line-level-allocation cluster has a dedicated sidebar
// group with all 6 destinations + the settings hub root. Locks the
// "globally reachable from any page" contract that PR #1313 introduces.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "../..");
const SIDEBAR = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx"),
  "utf8",
);

const EXPECTED_TARGETS = [
  "/finance/settings-hub",
  "/finance/allocation-rules",
  "/finance/product-catalog",
  "/finance/allocation-coverage",
  "/finance/allocation-results",
  "/finance/overrides-report",
  "/finance/allocation-override-log",
];

describe("allocation cluster sidebar group", () => {
  it("declares a top-level parent labelled 'محرك التوجيه المحاسبي'", () => {
    assert.ok(SIDEBAR.includes('label: "محرك التوجيه المحاسبي"'));
  });
  it("the parent is rooted at the settings hub", () => {
    assert.match(SIDEBAR, /label: "محرك التوجيه المحاسبي"[\s\S]{0,200}path: "\/finance\/settings-hub"/);
  });
  it("the parent uses module: 'finance'", () => {
    assert.match(SIDEBAR, /label: "محرك التوجيه المحاسبي"[\s\S]{0,400}module: "finance"/);
  });
});

describe("each cluster page is listed as a child", () => {
  // Locate the parent block once, then check each target inside it so
  // we don't accidentally count `path: "/finance/allocation-rules"`
  // appearing elsewhere in the sidebar config.
  const start = SIDEBAR.indexOf('label: "محرك التوجيه المحاسبي"');
  const endMarker = SIDEBAR.indexOf("]},", start);
  const block = SIDEBAR.slice(start, endMarker + 3);

  for (const path of EXPECTED_TARGETS) {
    it(`child path: ${path}`, () => {
      assert.ok(block.includes(`path: "${path}"`), `${path} not found in the cluster group`);
    });
  }
});
