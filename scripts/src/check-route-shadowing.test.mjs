#!/usr/bin/env node
//
// scripts/src/check-route-shadowing.test.mjs
//
// Pure-logic fixtures for the "static route shadowed by an earlier :param
// route" detector. Exercises the parser/matcher against the real bug class and
// legitimate orderings without touching any file or DB, so it runs in every
// environment and guards the guard itself.
//
// Exits 0 on pass, 1 on any assertion failure.
//
import { extractRoutes, findShadowedRoutes } from "./check-route-shadowing.mjs";

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

// ── Positive: the real bug class (param BEFORE static) ──────────────────────
{
  const routes = extractRoutes(`
    router.get("/cost-centers/:id", authz, async (req, res) => {});
    router.get("/cost-centers/ranking", authz, async (req, res) => {});
  `);
  const v = findShadowedRoutes(routes);
  assert(v.length === 1, "flags /cost-centers/ranking shadowed by earlier /:id");
  assert(
    v[0] && v[0].path === "/cost-centers/ranking" && v[0].shadowedBy === "/cost-centers/:id",
    "reports the shadowed path and the shadowing pattern",
  );
}

// ── Negative: correct order (static BEFORE param) ───────────────────────────
{
  const routes = extractRoutes(`
    router.get("/cost-centers/ranking", authz, async (req, res) => {});
    router.get("/cost-centers/:id", authz, async (req, res) => {});
  `);
  assert(findShadowedRoutes(routes).length === 0, "does NOT flag static registered before :param");
}

// ── Negative: different HTTP methods never shadow ───────────────────────────
{
  const routes = extractRoutes(`
    router.get("/cost-centers/:id", authz, async (req, res) => {});
    router.post("/cost-centers/ranking", authz, async (req, res) => {});
  `);
  assert(findShadowedRoutes(routes).length === 0, "does NOT flag a different-method static route");
}

// ── Negative: deeper static route is not shadowed by a shallow :param ───────
{
  const routes = extractRoutes(`
    router.get("/cost-centers/:id", authz, async (req, res) => {});
    router.get("/cost-centers/:id/pnl", authz, async (req, res) => {});
  `);
  assert(
    findShadowedRoutes(routes).length === 0,
    "does NOT flag /:id/pnl (different segment count) under /:id",
  );
}

// ── Negative: two param routes don't shadow each other by specificity ───────
{
  const routes = extractRoutes(`
    router.get("/x/:id", authz, async (req, res) => {});
    router.get("/x/:slug", authz, async (req, res) => {});
  `);
  assert(
    findShadowedRoutes(routes).length === 0,
    "does NOT flag a second pure-:param route (no literal to be shadowed)",
  );
}

// ── Positive: literal in a deeper position, same length ─────────────────────
{
  const routes = extractRoutes(`
    router.get("/x/:id/summary", authz, async (req, res) => {});
    router.get("/x/123/summary", authz, async (req, res) => {});
  `);
  assert(
    findShadowedRoutes(routes).length === 1,
    "flags a same-length literal route shadowed by a deeper :param pattern",
  );
}

// ── Parser sanity ───────────────────────────────────────────────────────────
{
  const regs = extractRoutes(`
    router.get("/a", h);
    router.post('/b/:id', h);
    router.delete(\`/c\`, h);
  `);
  assert(regs.length === 3, "parses get/post/delete with all quote styles");
  assert(regs[1].method === "post" && regs[1].path === "/b/:id", "captures method + path");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-route-shadowing fixtures passed.");
