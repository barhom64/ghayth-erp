#!/usr/bin/env node
/**
 * Runtime Certification Harness v2 — Phase 7: top-level orchestrator.
 *
 * The single entry point ops should invoke (manually or via the
 * `Runtime Verify` workflow). Wraps the full audit lifecycle behind a
 * deterministic exit-code policy so CI / dashboards / the operator can
 * react without grepping logs.
 *
 * Steps:
 *   1. Acquire the audit pidfile lock (Phase 2). Exit 3 on contention.
 *   2. Wait for /api/healthz. Exit 4 on health timeout.
 *   3. Spawn scripts/src/runtime-audit.cjs (same node) with the
 *      operator's env, streaming stdout/stderr through.
 *   4. After audit exits, read the run-id from OUT_DIR/latest pointer
 *      written by Phase 1, then:
 *        a. Build a tarball  OUT_DIR/<run-id>.tar.gz  (audit pack only)
 *        b. Maintain OUT_DIR/latest.tar.gz pointer (symlink, or copy
 *           on platforms that don't support symlinks)
 *        c. Read summary.json metrics and print a compact verdict line.
 *   5. Apply exit-code policy:
 *        0  — clean run; no a4 failures of category `authz` or `auth`.
 *        2  — audit script crashed or summary.json missing.
 *        3  — lock contention (forwarded from audit-lock).
 *        4  — health timeout (forwarded from audit-lock).
 *        5  — a4 failures detected with category in {authz, auth}.
 *             (harness-only failures do NOT fail the verify run.)
 *
 * Tunables (env):
 *   OUT_DIR              default /tmp/runtime-audit
 *   BASE_URL             default http://localhost
 *   AUDIT_HEALTH_TIMEOUT default 90 (sec)
 *   FORCE_LOCK=1         skip Phase 2 stale-lock check
 *   NO_TARBALL=1         skip tarball step (still prints verdict)
 *   FAIL_ON               override fail policy; comma-separated subset
 *                        of {authz,auth,harness,unknown}. Default
 *                        "authz,auth".
 *
 * Pure CJS, dep-free except for node:child_process / fs / path, plus
 * the two harness libs (audit-lock + nav-cause-taxonomy).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { acquireAuditLock, releaseAuditLock, waitForApiHealth } = require("./lib/audit-lock.cjs");
const navTaxonomy = require("./lib/nav-cause-taxonomy.cjs");

const OUT_DIR = process.env.OUT_DIR || "/tmp/runtime-audit";
const BASE_URL = process.env.BASE_URL || "http://localhost";
const HEALTH_TIMEOUT = parseInt(process.env.AUDIT_HEALTH_TIMEOUT || "90", 10);
const NO_TARBALL = process.env.NO_TARBALL === "1";
const FAIL_ON = String(process.env.FAIL_ON || "authz,auth")
  .split(",").map((s) => s.trim()).filter(Boolean);

const log = (...a) => console.log(`[verify]`, ...a);
const warn = (...a) => console.warn(`[verify]`, ...a);
const errlog = (...a) => console.error(`[verify]`, ...a);

const EXIT = {
  OK: 0,
  AUDIT_CRASH: 2,
  LOCK_CONTENDED: 3,
  HEALTH_TIMEOUT: 4,
  REAL_FAILURES: 5,
};

let lockHandle = null;
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (lockHandle) {
    try { releaseAuditLock(lockHandle); } catch { /* best-effort */ }
  }
}
process.on("exit", cleanup);
process.on("SIGINT",  () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

async function main() {
  log(`OUT_DIR=${OUT_DIR}  BASE_URL=${BASE_URL}  failOn=${FAIL_ON.join(",")}`);

  // ── 1. Acquire lock ────────────────────────────────────────────────
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lockPath = path.join(OUT_DIR, "runtime-audit.pid");
  try {
    lockHandle = acquireAuditLock(lockPath);
    log(`lock acquired at ${lockPath} (pid=${process.pid})`);
  } catch (e) {
    errlog(`lock contention: ${e && e.message || e}`);
    process.exit(EXIT.LOCK_CONTENDED);
  }

  // ── 2. Wait for /api/healthz ───────────────────────────────────────
  log(`waiting for ${BASE_URL}/api/healthz (timeout=${HEALTH_TIMEOUT}s) …`);
  try {
    await waitForApiHealth(`${BASE_URL}/api/healthz`, { timeoutSec: HEALTH_TIMEOUT });
    log(`api-server healthy`);
  } catch (e) {
    errlog(`health timeout: ${e && e.message || e}`);
    process.exit(EXIT.HEALTH_TIMEOUT);
  }

  // ── 3. Spawn the audit script ──────────────────────────────────────
  const auditPath = path.join(__dirname, "runtime-audit.cjs");
  log(`spawning audit: ${auditPath}`);
  // FORCE_LOCK=1 in the child so it doesn't fight us for the pidfile.
  // (We already hold the lock; the child re-grabbing would be a race.)
  const childEnv = { ...process.env, FORCE_LOCK: "1", OUT_DIR };
  const auditExit = await new Promise((resolve) => {
    const child = spawn(process.execPath, [auditPath], {
      stdio: "inherit",
      env: childEnv,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        warn(`audit terminated by signal=${signal}`);
        resolve(128);
      } else {
        resolve(code == null ? 1 : code);
      }
    });
    child.on("error", (err) => {
      errlog(`failed to spawn audit:`, err);
      resolve(127);
    });
  });
  log(`audit exited code=${auditExit}`);

  // ── 4. Read summary + tarball ──────────────────────────────────────
  const latestPath = path.join(OUT_DIR, "latest");
  let runId = null;
  try {
    if (fs.existsSync(latestPath)) {
      runId = fs.readFileSync(latestPath, "utf8").trim();
    }
  } catch (e) {
    warn(`failed to read latest pointer: ${e && e.message || e}`);
  }
  if (!runId) {
    errlog(`no latest run-id; audit likely crashed before writing pack`);
    process.exit(EXIT.AUDIT_CRASH);
  }
  const runDir = path.join(OUT_DIR, runId);
  const summaryPath = path.join(runDir, "summary.json");
  if (!fs.existsSync(summaryPath)) {
    errlog(`summary.json missing at ${summaryPath}`);
    process.exit(EXIT.AUDIT_CRASH);
  }
  let summary = null;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch (e) {
    errlog(`summary.json parse failed: ${e && e.message || e}`);
    process.exit(EXIT.AUDIT_CRASH);
  }

  if (!NO_TARBALL) {
    const tarPath = path.join(OUT_DIR, `${runId}.tar.gz`);
    log(`tarball → ${tarPath}`);
    const tarRes = spawnSync("tar", [
      "-czf", tarPath,
      "-C", OUT_DIR,
      runId,
    ], { stdio: "inherit" });
    if (tarRes.status === 0) {
      const latestTar = path.join(OUT_DIR, "latest.tar.gz");
      try {
        if (fs.existsSync(latestTar) || fs.lstatSync(latestTar, { throwIfNoEntry: false })) {
          fs.unlinkSync(latestTar);
        }
      } catch { /* best-effort */ }
      try {
        fs.symlinkSync(`${runId}.tar.gz`, latestTar);
      } catch (e) {
        warn(`symlink failed (${e && e.message || e}); copying instead`);
        try { fs.copyFileSync(tarPath, latestTar); } catch (e2) {
          warn(`copy fallback failed: ${e2 && e2.message || e2}`);
        }
      }
    } else {
      warn(`tar failed status=${tarRes.status} — pack still on disk at ${runDir}`);
    }
  }

  // ── 5. Apply exit-code policy ──────────────────────────────────────
  const counts = summary.counts || { pass: 0, fail: 0, skip: 0 };
  const catHist = summary.categoryHistogram || { harness: 0, authz: 0, auth: 0, unknown: 0 };
  const metrics = summary.metrics || {};
  const realFailures = FAIL_ON.reduce((s, cat) => s + (catHist[cat] || 0), 0);
  const verdict = realFailures > 0 ? "FAIL" : (auditExit !== 0 ? "DEGRADED" : "PASS");

  console.log("");
  log(`════════════════ VERDICT: ${verdict} ════════════════`);
  log(`run-id           : ${runId}`);
  log(`audit exit       : ${auditExit}`);
  log(`routes probed    : ${summary.routeCountInRun}/${summary.routeCountTotal}  (pass=${counts.pass} fail=${counts.fail} skip=${counts.skip})`);
  log(`a4 failures      : ${summary.a4Failures || 0}`);
  log(`  ↳ by category  : ${Object.entries(catHist).filter(([,n]) => n > 0).map(([k,n]) => `${k}=${n}`).join("  ") || "none"}`);
  log(`fail-on policy   : ${FAIL_ON.join(",")}  →  realFailures=${realFailures}`);
  if (metrics && Number.isFinite(metrics.avgLoadMs)) {
    log(`timings (ms)     : avg=${metrics.avgLoadMs} p50=${metrics.p50Ms} p95=${metrics.p95Ms} p99=${metrics.p99Ms} max=${metrics.maxMs}`);
    log(`operational      : retries=${metrics.totalRetries} chromiumCrashes=${metrics.chromiumCrashes} relogins=${metrics.relogins} apiRestarts=${metrics.apiServerRestartsDetected}`);
  }
  const instr = summary.instrumentation;
  if (instr && Number.isFinite(instr.sampleCount)) {
    log(`instrumentation  : samples=${instr.sampleCount} rssPeak=${(instr.memoryPeakRss/1024/1024).toFixed(0)}MB rssΔ=${(instr.memoryDeltaRss/1024/1024).toFixed(0)}MB fdPeak=${instr.fdPeak ?? "n/a"} fdΔ=${instr.fdDelta ?? "n/a"} pagesPeak=${instr.browserPagesPeak} pagesFinal=${instr.browserPagesFinal}`);
    log(`health           : ${instr.healthOkSamples}ok/${instr.healthFailSamples}fail avg=${instr.healthLatencyAvgMs}ms p95=${instr.healthLatencyP95Ms}ms`);
    if (instr.firstFailureIdx >= 0) {
      log(`first failure    : idx=${instr.firstFailureIdx}  route=${instr.firstFailureRoute}`);
    }
  }
  log(`evidence pack    : ${runDir}`);
  if (!NO_TARBALL) log(`tarball          : ${path.join(OUT_DIR, `${runId}.tar.gz`)} (→ latest.tar.gz)`);
  log(`taxonomy codes   : ${navTaxonomy.TAXONOMY.length} (see ${path.relative(process.cwd(), require.resolve("./lib/nav-cause-taxonomy.cjs"))})`);

  if (realFailures > 0) process.exit(EXIT.REAL_FAILURES);
  if (auditExit !== 0)  process.exit(EXIT.AUDIT_CRASH);
  process.exit(EXIT.OK);
}

main().catch((e) => {
  errlog(`fatal:`, e);
  cleanup();
  process.exit(EXIT.AUDIT_CRASH);
});
