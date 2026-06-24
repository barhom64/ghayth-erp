/**
 * Nav-vs-route gate consistency.
 *
 * A nav entry gated by module X that points at a route gated by module Y≠X is a
 * "seen then 403'd" bug: the user's module shows the link, the route's module
 * blocks it. This bit the /module-dashboards shell — its tabs are gated per
 * module in the nav, but the route was gated by "bi", so an hr/fleet/… manager
 * saw their dashboard link then hit 403. This test pins the whole class to 0 so
 * no future route gate can silently re-break a menu link.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/routes");
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

function routeModules(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(ROUTES_DIR).filter((x) => x.endsWith(".tsx"))) {
    const s = readFileSync(join(ROUTES_DIR, f), "utf8");
    const re = /\{\s*path:\s*"([^"]+)"[^}]*?\bmodule:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) out[m[1]] = m[2];
  }
  return out;
}

function navModuleEntries(): Array<{ path: string; module: string; raw: string }> {
  const re = /path:\s*"([^"]+)"\s*,\s*icon:\s*\w+\s*,\s*module:\s*"([^"]+)"/g;
  const out: Array<{ path: string; module: string; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(NAV_SRC))) out.push({ path: m[1].split("?")[0], module: m[2], raw: m[1] });
  return out;
}

describe("nav gate consistency", () => {
  it("no module-gated nav entry points at a route gated by a different module", () => {
    const routes = routeModules();
    const mismatches = navModuleEntries()
      .filter((e) => routes[e.path] && routes[e.path] !== e.module)
      .map((e) => `${e.raw}: nav module:${e.module} ≠ route module:${routes[e.path]}`);
    expect(mismatches).toEqual([]);
  });

  it("the multi-module /module-dashboards shell is not gated by a single module", () => {
    const misc = readFileSync(join(ROUTES_DIR, "miscRoutes.tsx"), "utf8");
    expect(misc).toMatch(/\{ path: "\/module-dashboards", component: ModuleDashboards \}/);
    expect(misc).not.toMatch(/path: "\/module-dashboards", component: ModuleDashboards, module:/);
  });
});
