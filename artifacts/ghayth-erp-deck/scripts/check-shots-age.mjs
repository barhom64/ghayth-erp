import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const MAX_AGE_DAYS = Number(process.env.SHOTS_MAX_AGE_DAYS || 14);
const DIR = resolve(process.cwd(), "public/screenshots");
const FAIL_ON_STALE = process.env.FAIL_ON_STALE === "1";
const PAGES_ROOT = resolve(
  process.cwd(),
  "..",
  "ghayth-erp",
  "src",
  "pages",
);

// Map each screenshot name to the source files/folders that drive its UI.
// Paths are relative to PAGES_ROOT. Folders are walked recursively.
const SHOT_SOURCES = {
  dashboard: ["dashboard.tsx", "module-dashboards.tsx"],
  hr: ["hr.tsx", "hr"],
  finance: ["finance.tsx", "finance"],
  operations: ["operations-center.tsx"],
  fleet: ["fleet.tsx", "fleet"],
  properties: [
    "properties-dashboard.tsx",
    "properties.tsx",
    "properties",
  ],
  legal: ["legal.tsx", "legal"],
  projects: ["projects.tsx", "projects"],
  support: ["support.tsx", "support"],
  crm: ["crm.tsx", "crm"],
};

async function latestMtime(absPath) {
  let s;
  try {
    s = await stat(absPath);
  } catch {
    return 0;
  }
  if (s.isFile()) return s.mtimeMs;
  if (!s.isDirectory()) return 0;
  let max = s.mtimeMs;
  let entries;
  try {
    entries = await readdir(absPath);
  } catch {
    return max;
  }
  for (const e of entries) {
    const m = await latestMtime(join(absPath, e));
    if (m > max) max = m;
  }
  return max;
}

async function latestSourceMtime(name) {
  const sources = SHOT_SOURCES[name];
  if (!sources || sources.length === 0) return 0;
  let max = 0;
  for (const rel of sources) {
    const m = await latestMtime(join(PAGES_ROOT, rel));
    if (m > max) max = m;
  }
  return max;
}

async function main() {
  let entries;
  try {
    entries = await readdir(DIR);
  } catch (err) {
    console.error(`[check-shots-age] cannot read ${DIR}: ${err.message}`);
    process.exit(FAIL_ON_STALE ? 1 : 0);
  }
  const pngs = entries.filter((f) => f.endsWith(".png"));
  if (pngs.length === 0) {
    console.warn(`[check-shots-age] no screenshots found in ${DIR}`);
    process.exit(FAIL_ON_STALE ? 1 : 0);
  }

  const now = Date.now();
  const stale = [];
  const outdated = []; // source newer than shot
  let oldestDays = 0;
  for (const f of pngs) {
    const s = await stat(resolve(DIR, f));
    const ageDays = (now - s.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > oldestDays) oldestDays = ageDays;
    if (ageDays > MAX_AGE_DAYS) stale.push({ f, ageDays: ageDays.toFixed(1) });

    const name = f.replace(/\.png$/i, "");
    if (Object.prototype.hasOwnProperty.call(SHOT_SOURCES, name)) {
      const srcMtime = await latestSourceMtime(name);
      if (srcMtime > 0 && srcMtime > s.mtimeMs) {
        const lagHours = (srcMtime - s.mtimeMs) / (1000 * 60 * 60);
        outdated.push({ f, lagHours: lagHours.toFixed(1) });
      }
    }
  }

  console.log(
    `[check-shots-age] ${pngs.length} screenshot(s); oldest=${oldestDays.toFixed(1)}d; threshold=${MAX_AGE_DAYS}d`,
  );

  let bad = false;
  if (stale.length > 0) {
    bad = true;
    console.warn(
      `[check-shots-age] ⚠ ${stale.length} screenshot(s) older than ${MAX_AGE_DAYS} days:`,
    );
    for (const s of stale) console.warn(`  - ${s.f} (${s.ageDays}d)`);
  }
  if (outdated.length > 0) {
    bad = true;
    console.warn(
      `[check-shots-age] ⚠ ${outdated.length} screenshot(s) older than their source pages:`,
    );
    for (const o of outdated)
      console.warn(`  - ${o.f} (source أحدث بـ ${o.lagHours} ساعة)`);
  }

  if (bad) {
    console.warn(
      `[check-shots-age] run: pnpm --filter @workspace/ghayth-erp-deck run refresh-shots`,
    );
    if (FAIL_ON_STALE) process.exit(1);
  } else {
    console.log(
      `[check-shots-age] ✓ all screenshots are fresh and newer than their sources`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(FAIL_ON_STALE ? 1 : 0);
});
