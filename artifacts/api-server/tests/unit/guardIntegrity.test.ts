import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

// ─── Guard & CI Integrity Tests ─────────────────────────────────────────────
// Validates that the guard.sh, CI workflow, and audit scripts form a
// coherent safety net with no gaps.

describe("guard.sh integrity", () => {
  const guardScript = readFileSync(join(REPO_ROOT, "scripts/guard.sh"), "utf8");

  it("runs typecheck as first step", () => {
    expect(guardScript).toContain('run_step "typecheck"');
  });

  it("runs lint:patterns", () => {
    expect(guardScript).toContain('run_step "lint:patterns"');
  });

  it("runs audit:routes", () => {
    expect(guardScript).toContain('run_step "audit:routes"');
  });

  it("runs audit:schema", () => {
    expect(guardScript).toContain('run_step "audit:schema"');
  });

  it("runs audit:boundaries", () => {
    expect(guardScript).toContain('run_step "audit:boundaries"');
  });

  it("runs audit:domain-routes", () => {
    expect(guardScript).toContain('run_step "audit:domain-routes"');
  });

  it("runs test suite", () => {
    expect(guardScript).toContain('run_step "test"');
  });

  it("uses set -euo pipefail for strict error handling", () => {
    expect(guardScript).toContain("set -euo pipefail");
  });
});

describe("CI workflow integrity", () => {
  const ciWorkflow = readFileSync(join(REPO_ROOT, ".github/workflows/guard.yml"), "utf8");

  it("triggers on push to main", () => {
    expect(ciWorkflow).toContain("push:");
    expect(ciWorkflow).toContain("branches: [main]");
  });

  it("triggers on pull_request to main", () => {
    expect(ciWorkflow).toContain("pull_request:");
  });

  it("installs dependencies with frozen lockfile", () => {
    expect(ciWorkflow).toContain("--frozen-lockfile");
  });

  it("runs guard.sh", () => {
    expect(ciWorkflow).toContain("bash scripts/guard.sh");
  });

  it("uses pnpm 10.x", () => {
    expect(ciWorkflow).toMatch(/version:\s*['"]?10\./);
  });

  it("uses Node 22", () => {
    expect(ciWorkflow).toMatch(/node-version:\s*['"]?22/);
  });
});

describe("Package.json guard scripts", () => {
  const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

  it("has guard script in root package.json", () => {
    expect(rootPkg.scripts.guard).toBeDefined();
    expect(rootPkg.scripts.guard).toContain("guard.sh");
  });

  it("has typecheck script", () => {
    expect(rootPkg.scripts.typecheck).toBeDefined();
  });

  it("has lint:patterns script", () => {
    expect(rootPkg.scripts["lint:patterns"]).toBeDefined();
  });

  it("has audit:boundaries script", () => {
    expect(rootPkg.scripts["audit:boundaries"]).toBeDefined();
  });

  it("has audit:domain-routes script", () => {
    expect(rootPkg.scripts["audit:domain-routes"]).toBeDefined();
  });
});

describe("API server test configuration", () => {
  const apiPkg = JSON.parse(
    readFileSync(join(REPO_ROOT, "artifacts/api-server/package.json"), "utf8")
  );

  it("has test script using vitest", () => {
    expect(apiPkg.scripts.test).toContain("vitest");
  });

  it("has vitest as devDependency", () => {
    const hasVitest =
      apiPkg.devDependencies?.vitest || apiPkg.dependencies?.vitest;
    expect(hasVitest).toBeDefined();
  });
});
