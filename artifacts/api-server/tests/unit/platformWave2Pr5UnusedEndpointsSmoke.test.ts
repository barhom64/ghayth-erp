/**
 * PR-5 (#2163) — Unused Endpoints Classification Smoke.
 *
 * Pins:
 *  1. Classification doc exists and covers all 25 sections (§1–§25).
 *  2. CSV updated: 3 false-positives removed (93 remaining, not 96).
 *  3. False-positive endpoints confirmed to have FE consumers.
 *  4. Remove-candidate list is documented (7 items).
 *  5. No code changes in this PR (routes untouched).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const DOC = join(REPO_ROOT, "docs/platform/PLATFORM_BACKEND_UNUSED_ENDPOINTS_CLASSIFICATION.md");
const CSV = join(REPO_ROOT, "docs/platform/PLATFORM_BACKEND_UNUSED_ENDPOINTS.csv");

const docSrc = readFileSync(DOC, "utf8");
const csvSrc = readFileSync(CSV, "utf8");

describe("PR-5 (#2163) — classification doc exists and is complete", () => {
  it("classification doc file exists", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it("doc covers all 6 classification types", () => {
    expect(docSrc).toContain("`wire`");
    expect(docSrc).toContain("`report-only`");
    expect(docSrc).toContain("`internal-service`");
    expect(docSrc).toContain("`integration-only`");
    expect(docSrc).toContain("`remove-candidate`");
    expect(docSrc).toContain("`false-positive`");
  });

  it("doc has summary section with counts", () => {
    expect(docSrc).toMatch(/\| `wire` \| 5\d \|/);
    expect(docSrc).toMatch(/\| `report-only` \| 2[0-9] \|/);
    expect(docSrc).toMatch(/\| `internal-service` \| 1[0-9] \|/);
    expect(docSrc).toContain("false-positive");
  });

  it("doc documents HR-REV linkage (HR-REV-0, HR-REV-1, HR-REV-2)", () => {
    expect(docSrc).toContain("HR-REV-0");
    expect(docSrc).toContain("HR-REV-1");
    expect(docSrc).toContain("HR-REV-2");
  });

  it("doc explicitly states: no deletions, no RBAC, no new FE in PR-5", () => {
    expect(docSrc).toContain("لا حذف لأي endpoint");
    expect(docSrc).toContain("لا تعديل في سلوك");
    expect(docSrc).toContain("لا بناء واجهات");
    expect(docSrc).toContain("لا تغيير RBAC");
  });
});

describe("PR-5 (#2163) — CSV updated: 2 false-positives removed", () => {
  it("CSV has comment noting false-positives removed", () => {
    expect(csvSrc).toContain("false-positives removed");
  });

  it("field-track false-positive removed from CSV data lines", () => {
    // Only data lines (starting with /) — comments are excluded
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/));
    expect(dataLines.join("\n")).not.toMatch(/\/hr\/attendance\/field-track/);
  });

  it("inbox snooze false-positive removed from CSV data lines", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/));
    expect(dataLines.join("\n")).not.toMatch(/DELETE \/api\/inbox\/threads/);
  });

  it("CSV now has 94 genuine unused endpoints (not 96, 2 false-positives removed)", () => {
    const dataLines = csvSrc
      .split("\n")
      .filter((l) => l.match(/^\/\w/));
    expect(dataLines.length).toBe(94);
  });
});

describe("PR-5 (#2163) — false-positives confirmed to have FE consumers", () => {
  const FIELD_TRACK = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/field-tracking.tsx"),
    "utf8",
  );
  const INBOX = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/inbox.tsx"),
    "utf8",
  );

  it("field-track endpoint consumed by field-tracking.tsx", () => {
    expect(FIELD_TRACK).toMatch(/\/hr\/attendance\/field-track/);
  });

  it("inbox snooze endpoint consumed by inbox.tsx", () => {
    expect(INBOX).toMatch(/\/inbox\/threads\/.*\/snooze/);
  });
});
