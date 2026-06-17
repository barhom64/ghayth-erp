#!/usr/bin/env node
//
// scripts/src/check-register-limiter-misuse.mjs
//
// "registration limiter on a GET probe" guard. Catches the abuse-budget
// misuse anti-pattern in the auth router:
//
//     const registerLimiter = rateLimit({ windowMs: 60*60*1000, max: 5, ... });
//     router.get("/setup-state", registerLimiter, ...);   // <-- BUG
//
// `registerLimiter` is the strict account-CREATION budget (max 5/hour). The
// login page polls the PUBLIC `GET /setup-state` boot probe on every mount, so
// gating that read with the registration limiter — a budget shared across all
// visitors behind one egress IP and (unlike loginLimiter/refreshLimiter)
// lacking the non-prod automated-suite bypass — 429s the probe after a handful
// of page loads. That breaks first-run detection and sprays console errors
// across the whole app. The runtime audit recorded this as ~79 repeated
// `/api/auth/setup-state` 4xx responses.
//
// A read-only GET probe must use its OWN light limiter, never the strict
// account-creation one. This is invisible to typecheck/build/lint and only
// manifests at runtime (429s under modest load), so it needs a static gate.
//
// Detector:
//   1. Read each auth-router source file (default: api-server's auth.ts).
//   2. Parse every `router.<method>(<path>, <middlewares...>)` registration.
//   3. Flag any registration whose METHOD is `get` AND whose middleware list
//      references `registerLimiter` (the account-creation budget).
//   4. Any flagged route is a regression -> fail.
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:usememo-setstate / check:dump-drift).
//
// Usage:
//   node scripts/src/check-register-limiter-misuse.mjs
//
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Files whose `router.<method>(...)` registrations are scanned. The auth
// router is where the registration limiter lives; extend this list if another
// router ever imports/defines a registration-scoped limiter.
const SCAN_FILES = ["artifacts/api-server/src/routes/auth.ts"];

// The strict account-creation limiter identifier(s) that must never gate a GET.
const REGISTRATION_LIMITER_NAMES = ["registerLimiter"];

// Match `router.METHOD( "..."/'...'/`...` , <middlewares up to the async/fn> )`.
// We only need the method, the path literal, and the chunk of arguments BEFORE
// the handler function — that chunk holds the middleware references.
const ROUTE_RE =
  /router\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]*)\2\s*,([\s\S]*?)(?:async\s*)?\([^)]*\)\s*=>/g;

/**
 * Parse `router.<method>(...)` registrations out of a source string.
 * Returns `{ method, path, middlewareChunk }[]`. `middlewareChunk` is the raw
 * text between the path literal and the handler arrow function — it contains
 * any middleware identifiers passed to the route.
 */
export function extractRouteRegistrations(source) {
  const out = [];
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(source)) !== null) {
    out.push({
      method: m[1],
      path: m[3],
      middlewareChunk: (m[4] || "").trim().replace(/,+$/, ""),
    });
  }
  return out;
}

/**
 * Given a source string, return the list of violations: GET routes whose
 * middleware chunk references one of the registration limiter names.
 */
export function findRegistrationLimiterOnGet(
  source,
  limiterNames = REGISTRATION_LIMITER_NAMES,
) {
  const violations = [];
  for (const reg of extractRouteRegistrations(source)) {
    if (reg.method !== "get") continue;
    for (const name of limiterNames) {
      // word-boundary match so `registerLimiter` doesn't match a substring of
      // some other identifier.
      const re = new RegExp(`(^|[^.\\w$])${name}\\b`);
      if (re.test(reg.middlewareChunk)) {
        violations.push({ path: reg.path, limiter: name });
        break;
      }
    }
  }
  return violations;
}

function main() {
  let total = 0;
  const findings = [];
  for (const rel of SCAN_FILES) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    const violations = findRegistrationLimiterOnGet(source);
    total += extractRouteRegistrations(source).length;
    for (const v of violations) {
      findings.push(`${relative(REPO_ROOT, abs)}: GET ${v.path} is gated by ${v.limiter}`);
    }
  }

  if (findings.length > 0) {
    console.error(
      "\u2717 check:register-limiter-misuse — a GET route is gated by the strict account-creation limiter:\n",
    );
    for (const f of findings) console.error(`  - ${f}`);
    console.error(
      "\nThe account-creation limiter (registerLimiter, max 5/hour) must NOT gate a GET\n" +
        "probe. A public boot probe like /setup-state is polled on every login-page mount;\n" +
        "the strict registration budget 429s it under modest/shared-IP load and lacks the\n" +
        "non-prod e2e bypass. Give the GET its own light limiter instead.\n",
    );
    process.exit(1);
  }

  console.log(
    `\u2713 check:register-limiter-misuse — no GET route uses the account-creation limiter (${total} routes scanned).`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
