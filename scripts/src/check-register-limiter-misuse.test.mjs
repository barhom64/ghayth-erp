#!/usr/bin/env node
//
// scripts/src/check-register-limiter-misuse.test.mjs
//
// Pure-logic fixtures for the "registration limiter on a GET probe" detector.
// Exercises the parser/matcher against positive (the real bug) and negative
// (POST register, GET with its own limiter, no limiter) source snippets
// without touching any file or DB — so it runs in every environment and guards
// the guard itself.
//
// Exits 0 on pass, 1 on any assertion failure.
//
import {
  extractRouteRegistrations,
  findRegistrationLimiterOnGet,
} from "./check-register-limiter-misuse.mjs";

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

// ── Positive: the real bug class ────────────────────────────────────────────
assert(
  findRegistrationLimiterOnGet(
    `router.get("/setup-state", registerLimiter, async (_req, res) => {`,
  ).length === 1,
  "flags GET /setup-state gated by registerLimiter",
);

assert(
  findRegistrationLimiterOnGet(
    `router.get("/probe", authMiddleware, registerLimiter, async (req, res) => {`,
  ).length === 1,
  "flags a GET where registerLimiter is one of several middlewares",
);

// ── Negatives: legitimate usage ─────────────────────────────────────────────
assert(
  findRegistrationLimiterOnGet(
    `router.post("/register", registerLimiter, async (_req, res) => {`,
  ).length === 0,
  "does NOT flag POST /register gated by registerLimiter",
);

assert(
  findRegistrationLimiterOnGet(
    `router.get("/setup-state", setupStateLimiter, async (_req, res) => {`,
  ).length === 0,
  "does NOT flag a GET that uses its own dedicated limiter",
);

assert(
  findRegistrationLimiterOnGet(
    `router.get("/healthz", async (_req, res) => {`,
  ).length === 0,
  "does NOT flag a GET with no limiter at all",
);

assert(
  findRegistrationLimiterOnGet(
    `router.get("/x", registerLimiterFactory(), async (_req, res) => {`,
  ).length === 0,
  "does NOT flag a similarly-named-but-distinct identifier (word boundary)",
);

// ── Parser sanity ───────────────────────────────────────────────────────────
{
  const regs = extractRouteRegistrations(`
    router.post("/register", registerLimiter, async (_req, res) => {});
    router.get("/setup-state", setupStateLimiter, async (_req, res) => {});
    router.patch("/x/:id", mw1, mw2, async (req, res) => {});
  `);
  assert(regs.length === 3, "parses all three route registrations");
  assert(
    regs[0].method === "post" && regs[0].path === "/register",
    "captures method + path for the first registration",
  );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll check-register-limiter-misuse fixtures passed.");
