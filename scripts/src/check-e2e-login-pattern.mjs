#!/usr/bin/env node
//
// scripts/src/check-e2e-login-pattern.mjs
//
// E2E login-entry guard. Catches the flaky-test bug class where a
// Playwright spec opens the app at the bare root with `page.goto("/")`
// before driving the login form, e.g.
//
//     await page.goto("/");
//     await page.locator("input#email").fill(EMAIL);
//     ...
//
// Why this exists: an UNAUTHENTICATED visit to "/" triggers the SPA's
// client-side "/" → "/login" redirect (auth.tsx useEffect:
// `setLocation("/login")` when there's no erp_assignments). That redirect
// RACES the programmatic field fills — the email value can land on the
// about-to-unmount form and get dropped on remount, producing an
// empty-email login that bounces straight back to /login. The test then
// fails non-deterministically with `Received string: ".../login"` even
// though the product is healthy (verified: a race-free login + hard reload
// of a deep route returns /auth/me 200 and renders the page).
//
// The canonical race-free flow lives in e2e/tests/_helpers/login.ts — it
// hits "/login" DIRECTLY (no redirect to race) and waits for the URL to
// leave /login. Persona specs already import it; this guard stops new (or
// reverted) specs from reintroducing the bare-root pattern.
//
// The fix is mechanical: use the shared helper
//   import { login } from "./_helpers/login";
// or, for specs that must exercise the login UI themselves (auth.spec.ts),
// navigate to "/login" directly instead of "/".
//
// SCOPE — deliberately narrow to avoid false positives: only a goto whose
// argument is EXACTLY the root path ("/" / '/' / `/`) is flagged. Any
// deeper path (goto("/login"), goto("/employees"), goto(`/x/${id}`)) is
// fine, including after a successful login when the session already exists.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const E2E_TESTS_DIR = join(REPO_ROOT, "e2e", "tests");

// `.goto("/")` / `.goto('/')` / `.goto(`/`)` — the bare root only.
const BARE_ROOT_GOTO = /\.goto\(\s*(["'`])\/\1\s*[),]/g;

/**
 * Pure detector: return the 1-based line numbers in `source` that call
 * goto on the bare root path. Exported so the .test.mjs can assert on
 * fixtures without touching the filesystem.
 */
export function findViolations(source) {
  const hits = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    BARE_ROOT_GOTO.lastIndex = 0;
    if (BARE_ROOT_GOTO.test(lines[i])) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(spec|test)\.ts$/.test(name) || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const PASS = "\x1b[32m✓\x1b[0m";
  const FAIL = "\x1b[31m✗\x1b[0m";

  let files;
  try {
    files = walk(E2E_TESTS_DIR);
  } catch {
    // No e2e suite present — nothing to guard.
    console.log(`${PASS} check-e2e-login-pattern: no e2e/tests dir, skipping`);
    return 0;
  }

  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const hit of findViolations(src)) {
      violations.push({ file: relative(REPO_ROOT, file), ...hit });
    }
  }

  if (violations.length === 0) {
    console.log(`${PASS} check-e2e-login-pattern: no bare-root goto("/") in e2e specs`);
    return 0;
  }

  console.error(`${FAIL} check-e2e-login-pattern: ${violations.length} bare-root goto("/") found`);
  console.error(
    `  An unauthenticated goto("/") races the SPA's "/" → "/login" redirect against\n` +
      `  the field fills, producing a flaky empty-email login that bounces to /login.\n` +
      `  Use the shared race-free helper (import { login } from "./_helpers/login")\n` +
      `  or navigate to "/login" directly for specs that exercise the login UI.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  return 1;
}

// Import-safe: only run when invoked directly, so the sibling .test.mjs
// can import findViolations without triggering a process.exit.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  process.exit(main());
}
