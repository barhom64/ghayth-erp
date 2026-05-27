// Smoke test for AllocationHealthCard placement.
//   node --test scripts/src/check-allocation-health-card.test.mjs
//
// Ensures the allocation health widget is rendered on both top-level
// finance entry pages (dashboard + CFO cockpit) so the enforce flag,
// coverage %, and bypass volume are visible from the home screen,
// not buried in /finance/settings-hub.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = join(import.meta.dirname, "../..");
const COMPONENT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/allocation-health-card.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/dashboard.tsx"),
  "utf8",
);
const COCKPIT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/cfo-cockpit.tsx"),
  "utf8",
);

describe("AllocationHealthCard component", () => {
  it("exports AllocationHealthCard", () => {
    assert.match(COMPONENT, /export function AllocationHealthCard\(\)/);
  });
  it("queries the three health endpoints", () => {
    assert.ok(COMPONENT.includes('"/finance/settings/enforce-line-allocation"'));
    assert.ok(COMPONENT.includes('"/finance/allocation-results"'));
    assert.ok(COMPONENT.includes('"/finance/allocation-override-log"'));
  });
  it("derives coverage % from resolved / total", () => {
    assert.ok(COMPONENT.includes("Math.round((resolved / total) * 100)"));
  });
  it("computes health from enforce + coverage + bypasses", () => {
    assert.match(COMPONENT, /const health: "good" \| "fair" \| "poor"/);
  });
  it("links to allocation-coverage, allocation-rules, override-log, settings-hub", () => {
    assert.ok(COMPONENT.includes('href="/finance/allocation-coverage"'));
    assert.ok(COMPONENT.includes('href="/finance/allocation-rules"'));
    assert.ok(COMPONENT.includes('href="/finance/allocation-override-log"'));
    assert.ok(COMPONENT.includes('href="/finance/settings-hub"'));
  });
  it("provides deep-link to unmapped results", () => {
    assert.ok(COMPONENT.includes('href="/finance/allocation-results?status=unmapped"'));
  });
});

describe("finance dashboard renders the widget", () => {
  it("imports AllocationHealthCard", () => {
    assert.ok(DASHBOARD.includes('from "@/components/shared/allocation-health-card"'));
  });
  it("renders <AllocationHealthCard />", () => {
    assert.match(DASHBOARD, /<AllocationHealthCard\s*\/>/);
  });
});

describe("CFO cockpit renders the widget", () => {
  it("imports AllocationHealthCard", () => {
    assert.ok(COCKPIT.includes('from "@/components/shared/allocation-health-card"'));
  });
  it("renders <AllocationHealthCard />", () => {
    assert.match(COCKPIT, /<AllocationHealthCard\s*\/>/);
  });
});
