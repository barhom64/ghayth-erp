import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { writeReport, SHOT_SOURCES } from "./shots-report.mjs";

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

// SHOT_SOURCES is the single source of truth in shots-report.mjs.
// Paths are relative to PAGES_ROOT. Folders are walked recursively.

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

async function emitReport() {
  try {
    const { path: reportPath, stats } = await writeReport({
      shotsDir: DIR,
      pagesRoot: PAGES_ROOT,
      maxAgeDays: MAX_AGE_DAYS,
    });
    const need = stats.rows.filter((r) => r.status === "⚠").length;
    console.log(
      `[check-shots-age] 📝 report: ${reportPath} (${need}/${stats.rows.length} need recapture)`,
    );
  } catch (err) {
    console.warn(`[check-shots-age] report generation failed: ${err.message}`);
  }
}

async function main() {
  let entries;
  try {
    entries = await readdir(DIR);
  } catch (err) {
    console.error(`[check-shots-age] cannot read ${DIR}: ${err.message}`);
    await emitReport();
    process.exit(FAIL_ON_STALE ? 1 : 0);
  }
  const pngs = entries.filter((f) => f.endsWith(".png"));
  if (pngs.length === 0) {
    console.warn(`[check-shots-age] no screenshots found in ${DIR}`);
    await emitReport();
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

  try {
    const { path: reportPath, stats } = await writeReport({
      shotsDir: DIR,
      pagesRoot: PAGES_ROOT,
      maxAgeDays: MAX_AGE_DAYS,
    });
    const need = stats.rows.filter((r) => r.status === "⚠").length;
    console.log(
      `[check-shots-age] 📝 report: ${reportPath} (${need}/${stats.rows.length} need recapture)`,
    );
  } catch (err) {
    console.warn(`[check-shots-age] report generation failed: ${err.message}`);
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
