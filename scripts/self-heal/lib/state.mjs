import fs from "node:fs";
import path from "node:path";

const STATE_DIR = ".agent-state";
const COOLDOWN_FILE = path.join(STATE_DIR, "cooldowns.json");
const FIX_LOG = path.join(STATE_DIR, "fixes-log.jsonl");
const PROPOSED_DIR = path.join(STATE_DIR, "proposed");

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
  c[errorKey] = c[errorKey] || { attempts: 0, lastAttemptAt: 0, history: [] };
  c[errorKey].attempts += 1;
  c[errorKey].lastAttemptAt = Date.now();
  c[errorKey].history.push({ action, at: new Date().toISOString() });
  if (c[errorKey].history.length > 10) c[errorKey].history = c[errorKey].history.slice(-10);
  saveCooldowns(c);
}

export function isInCooldown(errorKey, minHours, maxRetries) {
  const c = loadCooldowns();
  const e = c[errorKey];
  if (!e) return false;
  if (e.attempts >= maxRetries) return true;
  const ageMs = Date.now() - e.lastAttemptAt;
  return ageMs < minHours * 60 * 60 * 1000;
}

export function appendFixLog(entry) {
  ensureDirs();
  fs.appendFileSync(FIX_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

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
