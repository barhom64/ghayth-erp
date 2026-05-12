import fs from "node:fs";
import path from "node:path";

const STATE_DIR = ".agent-state";
const COOLDOWN_FILE = path.join(STATE_DIR, "cooldowns.json");
const FIX_LOG = path.join(STATE_DIR, "fixes-log.jsonl");
const PROPOSED_DIR = path.join(STATE_DIR, "proposed");

// Actions that increment the retry counter (and thus eventually trigger the
// permanent suppression branch in isInCooldown). Dry-run proposals must NOT
// burn retries — otherwise flipping the loop to --live is silently a no-op
// for any error the dry-run pass already saw maxRetries times.
const RETRY_BURNING_ACTIONS = new Set([
  "model-failed",
  "validation-failed",
  "gather-failed",
  "live-failed-typecheck-failed",
  "live-failed-pr-push-failed",
  "pr-opened",
]);

export function ensureDirs() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(PROPOSED_DIR, { recursive: true });
}

export function loadCooldowns() {
  try { return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8")); }
  catch { return {}; }
}

export function saveCooldowns(c) {
  ensureDirs();
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(c, null, 2));
}

export function recordCooldown(errorKey, action) {
  const c = loadCooldowns();
  c[errorKey] = c[errorKey] || { attempts: 0, dryRunCount: 0, lastAttemptAt: 0, history: [] };
  if (RETRY_BURNING_ACTIONS.has(action)) c[errorKey].attempts += 1;
  if (action === "dry-run-proposed") c[errorKey].dryRunCount = (c[errorKey].dryRunCount || 0) + 1;
  c[errorKey].lastAttemptAt = Date.now();
  c[errorKey].lastAction = action;
  c[errorKey].history.push({ action, at: new Date().toISOString() });
  if (c[errorKey].history.length > 10) c[errorKey].history = c[errorKey].history.slice(-10);
  saveCooldowns(c);
}

// Returns true if we should skip this finding right now.
//  - For dry-run: only the per-pass dedupe matters; a soft 1h gap prevents
//    spamming the same proposal every loop. Retries are NOT capped.
//  - For live: respect both the retry cap and the per-error min-hours window.
export function isInCooldown(errorKey, minHours, maxRetries, mode = "live") {
  const c = loadCooldowns();
  const e = c[errorKey];
  if (!e) return false;
  const ageMs = Date.now() - e.lastAttemptAt;
  if (mode === "dry-run") {
    // Soft 1h dedupe so we don't re-propose the identical fix every interval.
    return ageMs < 60 * 60 * 1000 && e.lastAction === "dry-run-proposed";
  }
  if (e.attempts >= maxRetries) return true;
  return ageMs < minHours * 60 * 60 * 1000;
}

export function appendFixLog(entry) {
  ensureDirs();
  fs.appendFileSync(FIX_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

// Counts only ACTUAL PR opens (post-handoff) for rate limiting. The `pr-opened`
// log line is written after the _pr_push state file is staged, which is the
// closest signal we have without polling GitHub. Dry-run proposals never count.
export function fixesInWindow(windowMs) {
  ensureDirs();
  if (!fs.existsSync(FIX_LOG)) return 0;
  const cutoff = Date.now() - windowMs;
  const lines = fs.readFileSync(FIX_LOG, "utf8").trim().split("\n").filter(Boolean);
  let n = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.action === "pr-opened" && new Date(e.at).getTime() >= cutoff) n++;
    } catch {}
  }
  return n;
}

export function writeProposed(slug, content) {
  ensureDirs();
  const file = path.join(PROPOSED_DIR, `${Date.now()}_${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}

export const PATHS = { STATE_DIR, COOLDOWN_FILE, FIX_LOG, PROPOSED_DIR };
