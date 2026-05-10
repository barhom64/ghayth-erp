import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

export const MAX_AGE_DAYS_DEFAULT = 14;

export const SHOT_SOURCES = {
  dashboard: ["dashboard.tsx", "module-dashboards.tsx"],
  hr: ["hr.tsx", "hr"],
  finance: ["finance.tsx", "finance"],
  operations: ["operations-center.tsx"],
  fleet: ["fleet.tsx", "fleet"],
  properties: ["properties-dashboard.tsx", "properties.tsx", "properties"],
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

async function latestSourceMtime(pagesRoot, name) {
  const sources = SHOT_SOURCES[name];
  if (!sources || sources.length === 0) return 0;
  let max = 0;
  for (const rel of sources) {
    const m = await latestMtime(join(pagesRoot, rel));
    if (m > max) max = m;
  }
  return max;
}

export async function collectShotStats({
  shotsDir,
  pagesRoot,
  maxAgeDays = MAX_AGE_DAYS_DEFAULT,
}) {
  let entries = [];
  try {
    entries = await readdir(shotsDir);
  } catch {
    entries = [];
  }
  const pngs = entries.filter((f) => f.endsWith(".png"));
  const now = Date.now();
  const rows = [];
  for (const f of pngs) {
    const name = f.replace(/\.png$/i, "");
    const s = await stat(resolve(shotsDir, f));
    const ageDays = (now - s.mtimeMs) / (1000 * 60 * 60 * 24);
    const srcMtime = Object.prototype.hasOwnProperty.call(SHOT_SOURCES, name)
      ? await latestSourceMtime(pagesRoot, name)
      : 0;
    const lagHours =
      srcMtime > 0 && srcMtime > s.mtimeMs
        ? (srcMtime - s.mtimeMs) / (1000 * 60 * 60)
        : 0;
    const tooOld = ageDays > maxAgeDays;
    const sourceNewer = lagHours > 0;
    const status = tooOld || sourceNewer ? "⚠" : "✓";
    rows.push({
      name,
      file: f,
      shotMtime: s.mtimeMs,
      sourceMtime: srcMtime,
      ageDays,
      lagHours,
      tooOld,
      sourceNewer,
      status,
    });
  }
  // Also list known modules with no screenshot yet.
  for (const name of Object.keys(SHOT_SOURCES)) {
    if (rows.some((r) => r.name === name)) continue;
    const srcMtime = await latestSourceMtime(pagesRoot, name);
    rows.push({
      name,
      file: "—",
      shotMtime: 0,
      sourceMtime: srcMtime,
      ageDays: Infinity,
      lagHours: 0,
      tooOld: true,
      sourceNewer: false,
      missing: true,
      status: "⚠",
    });
  }
  rows.sort((a, b) => {
    const sa = a.status === "⚠" ? 0 : 1;
    const sb = b.status === "⚠" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
  return { rows, maxAgeDays, generatedAt: now };
}

function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtAge(d) {
  if (!isFinite(d)) return "—";
  if (d < 1) return `${(d * 24).toFixed(1)} ساعة`;
  return `${d.toFixed(1)} يوم`;
}

function fmtLag(h) {
  if (!h) return "—";
  return `${h.toFixed(1)} ساعة`;
}

export function renderMarkdown({ rows, maxAgeDays, generatedAt }) {
  const lines = [];
  lines.push(`# تقرير لقطات الوحدات`);
  lines.push("");
  lines.push(`_تم التوليد: ${fmtDate(generatedAt)}_`);
  lines.push("");
  lines.push(`عتبة العمر: **${maxAgeDays} يوم**`);
  lines.push("");
  const stale = rows.filter((r) => r.status === "⚠");
  const fresh = rows.filter((r) => r.status === "✓");
  lines.push(
    `- إجمالي الوحدات: **${rows.length}** — جاهزة: **${fresh.length}** — تحتاج إعادة التقاط: **${stale.length}**`,
  );
  lines.push("");
  lines.push(
    `| الحالة | الوحدة | اللقطة | عمر اللقطة | آخر تعديل للصفحة | فرق (مصدر أحدث) | ملاحظة |`,
  );
  lines.push(`| :---: | --- | --- | --- | --- | --- | --- |`);
  for (const r of rows) {
    let note = "";
    if (r.missing) note = "لا توجد لقطة";
    else if (r.tooOld && r.sourceNewer)
      note = "قديمة + المصدر تغيّر";
    else if (r.tooOld) note = "أقدم من العتبة";
    else if (r.sourceNewer) note = "المصدر أحدث من اللقطة";
    else note = "محدّثة";
    lines.push(
      `| ${r.status} | ${r.name} | ${r.file} | ${fmtAge(r.ageDays)} | ${fmtDate(r.sourceMtime)} | ${fmtLag(r.lagHours)} | ${note} |`,
    );
  }
  lines.push("");
  if (stale.length > 0) {
    lines.push(
      `> لإعادة التقاط: \`pnpm --filter @workspace/ghayth-erp-deck run refresh-shots\``,
    );
    lines.push("");
  }
  return lines.join("\n");
}

export async function writeReport({
  shotsDir,
  pagesRoot,
  maxAgeDays = MAX_AGE_DAYS_DEFAULT,
  outPath,
}) {
  const stats = await collectShotStats({ shotsDir, pagesRoot, maxAgeDays });
  const md = renderMarkdown(stats);
  const target = outPath || resolve(shotsDir, "REPORT.md");
  await mkdir(shotsDir, { recursive: true });
  await writeFile(target, md, "utf8");
  return { path: target, stats };
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("shots-report.mjs");

if (isMain) {
  const shotsDir = resolve(process.cwd(), "public/screenshots");
  const pagesRoot = resolve(
    process.cwd(),
    "..",
    "ghayth-erp",
    "src",
    "pages",
  );
  const maxAgeDays = Number(process.env.SHOTS_MAX_AGE_DAYS || MAX_AGE_DAYS_DEFAULT);
  writeReport({ shotsDir, pagesRoot, maxAgeDays })
    .then(({ path, stats }) => {
      const stale = stats.rows.filter((r) => r.status === "⚠").length;
      console.log(
        `[shots-report] wrote ${path} — ${stats.rows.length} module(s), ${stale} need recapture`,
      );
    })
    .catch((err) => {
      console.error("[shots-report]", err);
      process.exit(1);
    });
}
