#!/usr/bin/env node
// artifacts/ghayth-erp-deck/scripts/capture-shots.mjs
//
// Capture the GM-deck screenshots from the live ERP via headless
// Chromium (playwright). Logs in once with the deck demo account
// (ADMIN_EMAIL / ADMIN_PASSWORD), then walks the configured pages and
// writes each PNG to artifacts/ghayth-erp-deck/public/screenshots/.
//
// Filenames are preserved exactly so the freshness gate
// (`check-shots-age.mjs`) keeps passing without churn.
//
// Two integrity guards (Task #421) refuse to ship a bad capture:
//   1. URL guard — after each `page.screenshot()` we re-read
//      `page.url()`; if its pathname matches one of SHOT_REJECTED_PATHS
//      (default: `/login`) the capture is rejected. This catches the
//      "auth gate redirected every protected route to /login and we
//      shipped 6 identical login PNGs" failure mode (the bug that
//      motivated this task — same family as Task #260 / Task #224
//      silent successes).
//   2. Hash guard — after all captures we md5 every PNG and fail if
//      any two files share a hash. Catches the subtler shape where
//      the auth gate doesn't redirect but every page renders the
//      same shared error / "select a company" / blank state.
//
// Captures stage to a tmpdir first and only commit to SHOTS_DIR on
// full success — a partial run never overwrites the previously-good
// committed screenshots.
//
// Env:
//   DECK_BASE_URL              base URL to capture from (default http://localhost:80)
//   ADMIN_EMAIL                deck demo account email (default admin@ghayth.com)
//   ADMIN_PASSWORD             deck demo account password (required)
//   SHOT_WAIT_MS               extra settle time per page (default 1500)
//   SHOT_VIEWPORT              "WxH" viewport size (default 1280x800)
//   SHOTS_DIR                  override the output directory (default
//                              artifacts/ghayth-erp-deck/public/screenshots)
//   SHOT_REJECTED_PATHS        csv of pathnames the capture must NOT
//                              end on (default "/login")
//   SHOT_ALLOW_DUPLICATE_HASHES  set to "1" to skip the hash guard
//                              (escape hatch for legitimately-identical
//                              pages — none today)
//
// Usage:
//   ADMIN_PASSWORD=... pnpm --filter @workspace/ghayth-erp-deck \
//     run capture-shots
//
// The routes below mirror the deck's primary modules. Edit this
// list if the deck adds / removes a slide.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import crypto from "node:crypto";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DECK_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SHOTS_DIR = path.join(DECK_ROOT, "public", "screenshots");

const BASE_URL = (process.env.DECK_BASE_URL || "http://localhost:80").replace(
  /\/+$/,
  "",
);
const EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const PASSWORD = process.env.ADMIN_PASSWORD;
const SETTLE_MS = Number(process.env.SHOT_WAIT_MS || "1500");
const [VW, VH] = (process.env.SHOT_VIEWPORT || "1280x800")
  .split("x")
  .map((n) => Number(n));
const SHOTS_DIR = process.env.SHOTS_DIR || DEFAULT_SHOTS_DIR;
const REJECTED_PATHS = (process.env.SHOT_REJECTED_PATHS || "/login")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOW_DUPLICATE_HASHES = process.env.SHOT_ALLOW_DUPLICATE_HASHES === "1";

const SHOTS = [
  { file: "dashboard.png", path: "/dashboard" },
  { file: "hr-employees.png", path: "/employees" },
  { file: "finance-invoices.png", path: "/finance/invoices" },
  { file: "fleet-vehicles.png", path: "/fleet" },
  { file: "warehouse-stock.png", path: "/warehouse" },
  { file: "support-tickets.png", path: "/support" },
  // Task #420 — broaden coverage beyond the 6 module landing screens so
  // GM-facing slides about approvals, BI, document management and the
  // Umrah operational pipeline have a real screenshot to lean on.
  { file: "approvals-workflows.png", path: "/requests/workflows" },
  { file: "bi-dashboards.png", path: "/bi/dashboards" },
  { file: "documents-list.png", path: "/documents" },
  { file: "umrah-pilgrims.png", path: "/umrah/pilgrims" },
];

// --- exported helpers (covered by capture-shots.test.mjs) -------------------

function normalisePath(p) {
  if (!p) return "/";
  const trimmed = p.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * True if `currentUrl`'s pathname matches any entry in `rejected` (exact
 * match OR pathname ends with the rejected path as a `/`-bounded segment,
 * so `/login` matches `/login` and `/auth/login` but not `/loginsuffix`).
 */
export function isRejectedUrl(currentUrl, rejected) {
  let pathname;
  try {
    pathname = new URL(currentUrl).pathname;
  } catch {
    return false;
  }
  const cur = normalisePath(pathname);
  for (const raw of rejected) {
    const r = normalisePath(raw);
    if (cur === r) return true;
    // r already starts with "/", so endsWith is segment-safe:
    // "/auth/login".endsWith("/login") = true,
    // "/loginsuffix".endsWith("/login") = false.
    if (r !== "/" && r.startsWith("/") && cur.endsWith(r)) return true;
  }
  return false;
}

/**
 * Returns groups of files that share an md5 hash (length >= 2 each).
 * `captured` is `[{ file, hash }]`. Empty array = all unique.
 */
export function findDuplicateHashes(captured) {
  const byHash = new Map();
  for (const c of captured) {
    if (!byHash.has(c.hash)) byHash.set(c.hash, []);
    byHash.get(c.hash).push(c.file);
  }
  const dupes = [];
  for (const [hash, files] of byHash) {
    if (files.length > 1) dupes.push({ hash, files });
  }
  return dupes;
}

// ---------------------------------------------------------------------------

async function login(request) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { "content-type": "application/json" },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `login failed: ${res.status()} ${res.statusText()} ${body.slice(0, 200)}`,
    );
  }
  // The frontend gates routes on `localStorage.erp_assignments` (see
  // artifacts/ghayth-erp/src/lib/auth.tsx) — without it, every protected
  // page redirects to /login even though the HttpOnly auth cookie is
  // present. Return the body so the caller can seed localStorage before
  // navigating.
  return res.json();
}

function md5File(file) {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

async function main() {
  if (!PASSWORD) {
    console.error("[capture-shots] ADMIN_PASSWORD is required.");
    process.exit(2);
  }
  if (!Number.isFinite(VW) || !Number.isFinite(VH) || VW <= 0 || VH <= 0) {
    console.error(
      `[capture-shots] bad SHOT_VIEWPORT: ${process.env.SHOT_VIEWPORT}`,
    );
    process.exit(2);
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-shots-"));
  let browser;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      // Allow operators to point at a system-installed Chromium when the
      // bundled playwright browser pack is missing system libs (libgbm.so
      // on minimal NixOS containers). Set CHROMIUM_PATH=/path/to/chrome.
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: VW, height: VH },
      locale: "ar",
    });

    // Auth uses HttpOnly cookies (see "Auth uses HttpOnly cookies" gotcha).
    // Log in via the API and let playwright pick up Set-Cookie automatically.
    const apiCtx = context.request;
    const loginBody = await login(apiCtx);

    const page = await context.newPage();
    // Seed localStorage on the app origin so the auth gate sees an
    // active session before the first protected navigation.
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate((assignments) => {
      try {
        localStorage.setItem("erp_assignments", JSON.stringify(assignments));
      } catch {
        /* swallowed: storage disabled */
      }
    }, loginBody.assignments || []);

    const failures = [];
    const captured = [];

    for (const { file, path: routePath } of SHOTS) {
      const stagePath = path.join(stagingDir, file);
      const target = `${BASE_URL}${routePath}`;
      console.log(`[capture-shots] -> ${routePath} -> ${file}`);
      try {
        await page.goto(target, {
          waitUntil: "networkidle",
          timeout: 45_000,
        });
        await page.waitForTimeout(SETTLE_MS);
        await page.screenshot({ path: stagePath, fullPage: false });

        const finalUrl = page.url();
        if (isRejectedUrl(finalUrl, REJECTED_PATHS)) {
          failures.push(
            `${file}: page ended on rejected path ${finalUrl} ` +
              `(expected ${routePath}). The auth/redirect gate sent us ` +
              `to ${REJECTED_PATHS.join("|")} — refusing to commit ` +
              `a login screenshot. Check ADMIN_PASSWORD / assignments shape.`,
          );
          // Drop the staged file so it can't be picked up later.
          try {
            fs.unlinkSync(stagePath);
          } catch {
            /* ignore */
          }
          console.error(`     REJECTED: ended on ${finalUrl}`);
          continue;
        }

        const hash = md5File(stagePath);
        const size = fs.statSync(stagePath).size;
        captured.push({ file, stagePath, url: finalUrl, hash });
        console.log(
          `     ok (${(size / 1024).toFixed(1)} KB, md5 ${hash.slice(0, 8)})`,
        );
      } catch (err) {
        failures.push(`${file}: ${err.message}`);
        console.error(`     FAILED: ${err.message}`);
      }
    }

    if (!ALLOW_DUPLICATE_HASHES) {
      const dupes = findDuplicateHashes(captured);
      for (const { hash, files } of dupes) {
        failures.push(
          `duplicate screenshot hash ${hash.slice(0, 12)} across: ` +
            `${files.join(", ")} — every listed page rendered as the ` +
            `same image. Likely the auth gate, a shared error state, ` +
            `or a redirect to a common landing page. ` +
            `Set SHOT_ALLOW_DUPLICATE_HASHES=1 only if this is intentional.`,
        );
      }
    }

    await context.close();

    if (failures.length > 0) {
      console.error(`\n[capture-shots] ${failures.length} failure(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }

    // Commit staged → final (only on full success).
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    for (const c of captured) {
      const finalDest = path.join(SHOTS_DIR, c.file);
      // copy + unlink: rename can EXDEV across tmpfs → workspace fs.
      fs.copyFileSync(c.stagePath, finalDest);
      fs.unlinkSync(c.stagePath);
    }
    console.log(`[capture-shots] captured ${captured.length} screenshot(s) ✓`);
  } finally {
    if (browser) await browser.close();
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

// Allow `import` from tests without running the CLI.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("capture-shots.mjs");
if (isMain) {
  main().catch((err) => {
    console.error(`[capture-shots] fatal: ${err.stack || err.message}`);
    process.exit(1);
  });
}
