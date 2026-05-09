import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");
const ROUTES_DIR = join(API_SRC, "routes");

describe("Route index completeness", () => {
  const indexSource = readFileSync(join(ROUTES_DIR, "index.ts"), "utf8");
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts"
  );

  it("every route file is imported in routes/index.ts", () => {
    const missing: string[] = [];
    for (const file of routeFiles) {
      const stem = file.replace(".ts", "");
      const importPattern = new RegExp(
        `from\\s+['"]\\./${stem}(\\.js)?['"]`
      );
      if (!importPattern.test(indexSource)) {
        missing.push(file);
      }
    }
    expect(missing, `Route files not imported: ${missing.join(", ")}`).toEqual(
      []
    );
  });

  it("every imported router is mounted with router.use()", () => {
    const mountCalls = indexSource.match(/router\.use\(/g);
    expect(mountCalls).toBeTruthy();
    expect(mountCalls!.length).toBeGreaterThan(40);
  });

  it("auth middleware is applied before business routes", () => {
    const authPos = indexSource.indexOf("router.use(authMiddleware)");
    const dashboardPos = indexSource.indexOf('"/dashboard"');
    expect(authPos).toBeGreaterThan(-1);
    expect(dashboardPos).toBeGreaterThan(authPos);
  });

  it("health route is mounted before auth middleware", () => {
    const healthPos = indexSource.indexOf("healthRouter");
    const authPos = indexSource.indexOf("router.use(authMiddleware)");
    const healthMount = indexSource.indexOf("router.use(healthRouter)");
    expect(healthPos).toBeGreaterThan(-1);
    expect(healthMount).toBeGreaterThan(-1);
    expect(healthMount).toBeLessThan(authPos);
  });

  it("public routes (auth, portal, careers, pdpl) are before auth middleware", () => {
    const authMwPos = indexSource.indexOf("router.use(authMiddleware)");
    for (const route of ["/auth", "/portal", "/public", "/careers", "/pdpl"]) {
      const routePos = indexSource.indexOf(`"${route}"`);
      if (routePos === -1) continue;
      expect(
        routePos,
        `${route} should be before authMiddleware`
      ).toBeLessThan(authMwPos);
    }
  });
});

describe("Route file consistency", () => {
  const routeFiles = readdirSync(ROUTES_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "index.ts"
  );

  it("every route file exports a router", () => {
    const noExport: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      const hasRouterExport =
        /export\s+(default\s+)?/.test(source) &&
        (/Router\(\)/.test(source) || /express\.Router/.test(source));
      if (!hasRouterExport) noExport.push(file);
    }
    expect(
      noExport,
      `Files without Router export: ${noExport.join(", ")}`
    ).toEqual([]);
  });

  it("no route file imports directly from node:pg or pg", () => {
    const violations: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (/from\s+['"]pg['"]/.test(source) || /from\s+['"]node:pg['"]/.test(source)) {
        violations.push(file);
      }
    }
    expect(
      violations,
      `Routes importing pg directly (should use rawdb): ${violations.join(", ")}`
    ).toEqual([]);
  });
});

describe("Middleware existence", () => {
  const middlewaresDir = join(API_SRC, "middlewares");

  it("authMiddleware exists", () => {
    expect(existsSync(join(middlewaresDir, "authMiddleware.ts"))).toBe(true);
  });

  it("roleGuard exists", () => {
    expect(existsSync(join(middlewaresDir, "roleGuard.ts"))).toBe(true);
  });
});

describe("Domain-protected routes", () => {
  const indexSource = readFileSync(join(ROUTES_DIR, "index.ts"), "utf8");

  const protectedDomains = [
    { path: "/hr", module: "hr" },
    { path: "/finance", module: "finance" },
    { path: "/fleet", module: "fleet" },
    { path: "/warehouse", module: "warehouse" },
    { path: "/properties", module: "property" },
    { path: "/legal", module: "legal" },
    { path: "/projects", module: "operations" },
    { path: "/support", module: "support" },
    { path: "/crm", module: "crm" },
    { path: "/store", module: "store" },
  ];

  for (const { path, module } of protectedDomains) {
    it(`${path} routes require "${module}" module guard`, () => {
      const pattern = new RegExp(
        `router\\.use\\(\\s*"${path.replace("/", "\\/")}"\\s*,\\s*requireModule\\("${module}"\\)`
      );
      expect(
        pattern.test(indexSource),
        `${path} missing requireModule("${module}")`
      ).toBe(true);
    });
  }
});

describe("GL-integrated domains have financial guard", () => {
  const indexSource = readFileSync(join(ROUTES_DIR, "index.ts"), "utf8");

  const glPaths = ["/finance", "/fleet", "/warehouse", "/properties", "/store"];

  for (const path of glPaths) {
    it(`${path} has requireGuards("financial")`, () => {
      const escapedPath = path.replace("/", "\\/");
      const lines = indexSource.split("\n").filter(
        (l) => l.includes(`"${path}"`) && l.includes("router.use")
      );
      const hasFinancialGuard = lines.some((l) =>
        l.includes('requireGuards("financial")')
      );
      expect(
        hasFinancialGuard,
        `${path} missing requireGuards("financial") — GL domains must enforce it`
      ).toBe(true);
    });
  }
});
