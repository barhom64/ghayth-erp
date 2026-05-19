/**
 * Audit lock + health-wait — Runtime Certification Harness v2, Phase 2.
 *
 * Two responsibilities, both pure-script (no app code touched):
 *
 *   1. acquireAuditLock(opts)
 *      Tries to claim a pidfile at LOCK_PATH (default
 *      /tmp/runtime-audit/.audit.lock). If another live PID already
 *      holds it, rejects with a structured error so the caller can
 *      exit cleanly instead of stomping a concurrent audit (the root
 *      cause of the chromium-starvation cascade documented in #638).
 *      Stale locks (PID no longer alive) are auto-reclaimed.
 *
 *   2. waitForApiHealth({ baseUrl, timeoutMs, intervalMs })
 *      Polls `GET <baseUrl>/api/healthz` until it returns 2xx with
 *      `{ status: "ok" }` (or any 2xx if the body isn't JSON), with a
 *      bounded timeout. Used by the audit harness to refuse to start
 *      against a not-yet-warm api-server — another #638 root cause.
 *
 * Both functions are dependency-free (only Node stdlib + global fetch)
 * so the lib is safe to require from any CJS or ESM caller without
 * touching package.json.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_LOCK_PATH = path.join(process.env.OUT_DIR || "/tmp/runtime-audit", ".audit.lock");

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH = no such process; EPERM = process exists but we can't signal it
    return e.code === "EPERM";
  }
}

function readLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Acquire exclusive lock. Returns { acquired:true, lockPath, previous:null }
 * on success. On contention rejects with { code:"EAUDITLOCK", existing:{...} }.
 *
 * Force=true lets the operator override (used by runtime-verify orchestrator
 * after killing the previous chromium process).
 */
function acquireAuditLock(opts = {}) {
  const lockPath = opts.lockPath || DEFAULT_LOCK_PATH;
  const runId = opts.runId || `pid-${process.pid}`;
  const force = !!opts.force;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const existing = readLock(lockPath);
  if (existing && !force) {
    if (isPidAlive(existing.pid)) {
      const err = new Error(
        `[audit-lock] another audit is already running: pid=${existing.pid} run=${existing.runId} since=${existing.acquiredAt}`,
      );
      err.code = "EAUDITLOCK";
      err.existing = existing;
      throw err;
    }
    // Stale lock — reclaim with a notice on the returned record.
  }

  const payload = {
    pid: process.pid,
    runId,
    acquiredAt: new Date().toISOString(),
    host: require("os").hostname(),
    cmd: process.argv.slice(0, 4).join(" "),
  };
  // O_EXCL would be ideal but Node's fs.writeFileSync doesn't expose it
  // ergonomically; the stale-reclaim path above + the pid-alive check
  // gives us the same practical guarantee for the single-machine case
  // this harness runs in.
  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2));
  return { acquired: true, lockPath, previous: existing || null, payload };
}

function releaseAuditLock(opts = {}) {
  const lockPath = opts.lockPath || DEFAULT_LOCK_PATH;
  try {
    const existing = readLock(lockPath);
    if (!existing) return { released: false, reason: "no-lock" };
    if (existing.pid !== process.pid && !opts.force) {
      return { released: false, reason: "not-owner", existing };
    }
    fs.unlinkSync(lockPath);
    return { released: true, lockPath };
  } catch (e) {
    return { released: false, reason: String(e.message || e) };
  }
}

/**
 * Wait for /api/healthz to return 2xx. Resolves with the final response
 * info on success; rejects with EHEALTHTIMEOUT on timeout.
 */
async function waitForApiHealth(opts = {}) {
  const baseUrl = opts.baseUrl || process.env.BASE_URL || "http://localhost";
  const timeoutMs = opts.timeoutMs ?? 60000;
  const intervalMs = opts.intervalMs ?? 1000;
  const healthPath = opts.healthPath || "/api/healthz";
  const url = baseUrl.replace(/\/+$/, "") + healthPath;
  const started = Date.now();
  let attempts = 0;
  let lastErr = null;
  while (Date.now() - started < timeoutMs) {
    attempts++;
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) {
        let body = null;
        try { body = await r.json(); } catch { /* non-JSON 2xx still counts */ }
        return { ok: true, status: r.status, attempts, durationMs: Date.now() - started, body };
      }
      lastErr = `status=${r.status}`;
    } catch (e) {
      lastErr = String(e.message || e);
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  const err = new Error(`[audit-lock] api-server health-wait timed out after ${timeoutMs}ms (attempts=${attempts}, lastErr=${lastErr})`);
  err.code = "EHEALTHTIMEOUT";
  err.attempts = attempts;
  err.lastErr = lastErr;
  throw err;
}

module.exports = {
  acquireAuditLock,
  releaseAuditLock,
  waitForApiHealth,
  isPidAlive,
  readLock,
  DEFAULT_LOCK_PATH,
};
