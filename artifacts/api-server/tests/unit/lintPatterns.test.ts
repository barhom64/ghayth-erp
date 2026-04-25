import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");
const ROUTES_DIR = join(API_SRC, "routes");

describe("lint-patterns script integrity", () => {
  const script = readFileSync(
    join(REPO_ROOT, "scripts/src/lint-patterns.mjs"),
    "utf8"
  );

  it("enforces local-requireRole ban", () => {
    expect(script).toContain("local-requireRole");
  });

  it("enforces legacy-validationError-call ban", () => {
    expect(script).toContain("legacy-validationError-call");
  });

  it("enforces legacy-validationError-import ban", () => {
    expect(script).toContain("legacy-validationError-import");
  });

  it("enforces direct-gl-import-in-domain-route ban", () => {
    expect(script).toContain("direct-gl-import-in-domain-route");
  });

  it("enforces direct-account-mapping-in-domain-route ban", () => {
    expect(script).toContain("direct-account-mapping-in-domain-route");
  });

  it("exits 0 on clean scan", () => {
    expect(script).toContain("process.exit(0)");
  });

  it("exits 1 on violations", () => {
    expect(script).toContain("process.exit(1)");
  });
});

describe("No banned patterns in current codebase", () => {
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts"
  );

  it("no local requireRole(scope,...) function definitions in routes", () => {
    const violations: string[] = [];
    const pattern = /^\s*function\s+requireRole\s*\(\s*scope\s*[:,]/m;
    for (const file of routeFiles) {
      const content = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (pattern.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("no legacy validationError(res,...) calls in routes", () => {
    const violations: string[] = [];
    const pattern = /\bvalidationError\s*\(\s*res\b/;
    for (const file of routeFiles) {
      const content = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (pattern.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("no direct GL imports in non-finance routes", () => {
    const violations: string[] = [];
    const pattern = /\b(?:createJournalEntry|createGuardedJournalEntry)\b/;
    for (const file of routeFiles) {
      if (file.startsWith("finance") || file === "index.ts") continue;
      const content = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (pattern.test(content)) violations.push(file);
    }
    expect(
      violations,
      `Non-finance routes with direct GL imports: ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("no direct getAccountCodeFromMapping in non-finance routes", () => {
    const violations: string[] = [];
    const pattern = /\bgetAccountCodeFromMapping\b/;
    for (const file of routeFiles) {
      if (file.startsWith("finance") || file === "index.ts") continue;
      const content = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (pattern.test(content)) violations.push(file);
    }
    expect(
      violations,
      `Non-finance routes with direct account mapping: ${violations.join(", ")}`
    ).toEqual([]);
  });
});
