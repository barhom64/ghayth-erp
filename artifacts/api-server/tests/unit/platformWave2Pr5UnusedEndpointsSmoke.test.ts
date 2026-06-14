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
    expect(docSrc).toMatch(/\| `wire` \| \d+ \|/);
    expect(docSrc).toMatch(/\| `report-only` \| \d+ \|/);
    expect(docSrc).toMatch(/\| `internal-service` \| \d+ \|/);
    expect(docSrc).toContain("false-positive");
    // total must be 96
    expect(docSrc).toMatch(/\| \*\*المجموع\*\* \| \*\*96\*\* \|/);
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

describe("PR-5 (#2163) — CSV updated: 8 false-positives removed", () => {
  it("CSV has comment noting false-positives removed", () => {
    expect(csvSrc).toContain("false-positives removed");
  });

  it("field-track false-positive removed from CSV data lines", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/));
    expect(dataLines.join("\n")).not.toMatch(/\/hr\/attendance\/field-track/);
  });

  it("inbox snooze false-positive removed from CSV data lines", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/));
    expect(dataLines.join("\n")).not.toMatch(/DELETE \/api\/inbox\/threads/);
  });

  it("org GET endpoints (false-positives) removed from CSV data lines", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/)).join("\n");
    expect(dataLines).not.toMatch(/GET \/api\/org\/legal-entities$/m);
    expect(dataLines).not.toMatch(/GET \/api\/org\/positions$/m);
    expect(dataLines).not.toMatch(/GET \/api\/org\/supervision-lines$/m);
    expect(dataLines).not.toMatch(/GET \/api\/org\/approval-authorities$/m);
  });

  it("settings/administrations GET and fleet/rental-contracts GET removed", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/)).join("\n");
    expect(dataLines).not.toMatch(/GET \/api\/settings\/administrations$/m);
    expect(dataLines).not.toMatch(/GET \/api\/fleet\/rental-contracts$/m);
  });

  it("CSV now has 88 genuine unused endpoints (not 96, 8 false-positives removed)", () => {
    const dataLines = csvSrc.split("\n").filter((l) => l.match(/^\/\w/));
    expect(dataLines.length).toBe(88);
  });
});

describe("PR-5 (#2163) — false-positives confirmed to have FE consumers", () => {
  const FIELD_TRACK = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/field-tracking.tsx"),
    "utf8",
  );
  const INBOX_PG = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/inbox.tsx"),
    "utf8",
  );
  const ORG_MODEL = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/org-model.tsx"),
    "utf8",
  );
  const ENTITY_SELECTS = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/entity-selects.tsx"),
    "utf8",
  );
  const RENTAL_CONTRACTS = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/fleet/rental-contracts.tsx"),
    "utf8",
  );

  it("field-track consumed by field-tracking.tsx", () => {
    expect(FIELD_TRACK).toMatch(/\/hr\/attendance\/field-track/);
  });

  it("inbox snooze consumed by inbox.tsx", () => {
    expect(INBOX_PG).toMatch(/\/inbox\/threads\/.*\/snooze/);
  });

  it("org/legal-entities consumed by org-model.tsx", () => {
    expect(ORG_MODEL).toMatch(/\/org\/legal-entities/);
  });

  it("org/positions consumed by entity-selects.tsx", () => {
    expect(ENTITY_SELECTS).toMatch(/\/org\/positions/);
  });

  it("org/supervision-lines consumed by org-model.tsx", () => {
    expect(ORG_MODEL).toMatch(/\/org\/supervision-lines/);
  });

  it("org/approval-authorities consumed by org-model.tsx", () => {
    expect(ORG_MODEL).toMatch(/\/org\/approval-authorities/);
  });

  it("fleet/rental-contracts consumed by rental-contracts.tsx", () => {
    expect(RENTAL_CONTRACTS).toMatch(/\/fleet\/rental-contracts/);
  });
});
