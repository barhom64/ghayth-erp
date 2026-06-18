/**
 * employees.ts create-response field masking.
 *
 * The POST /employees 201 response echoed the new employee row (incl. raw
 * salary) without maskFields(), unlike the list (390) and 360 GET (2260)
 * which both mask. Salary-blind creators (e.g. a department manager seeding
 * a hire) would see the raw figure back. Fix: wrap the 201 body in maskFields.
 *
 * Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);

describe("employees create-response is field-masked", () => {
  it("the 201 create response wraps its body in maskFields(req, …)", () => {
    expect(SRC).toMatch(/res\.status\(201\)\.json\(maskFields\(req, \{\s*\n\s*\.\.\.employee,/);
  });
});
