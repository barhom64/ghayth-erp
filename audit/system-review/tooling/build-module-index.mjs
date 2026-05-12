#!/usr/bin/env node
// build-module-index.mjs — Emits modules/<mod>/_module.md and the root INDEX.md.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const inv = JSON.parse(readFileSync(join(__dirname, "_page-inventory.json"), "utf8"));
const buttons = JSON.parse(readFileSync(join(__dirname, "_buttons-by-page.json"), "utf8"));
const findings = readFileSync(join(ROOT, "findings/FINDINGS.csv"), "utf8")
  .split(/\r?\n/).slice(1).filter(Boolean)
  .map((l) => {
    const [module, page, severity, category] = l.split(",");
    return { module, page, severity, category };
  });

// Wave map
const WAVES = {
  finance: 1, hr: 1, governance: 1,
  properties: 2, fleet: 2, store: 2, warehouse: 2, legal: 2, umrah: 2,
  crm: 3, projects: 3, support: 3, communications: 3,
  bi: 4, documents: 4, requests: 4, "my-space": 4, misc: 4,
  admin: 5, settings: 5, "careers-portal": 5, "client-portal": 5,
};

const modules = {};
for (const r of inv) {
  modules[r.module] = modules[r.module] || { pages: [], routes: 0 };
  modules[r.module].pages.push(r);
  modules[r.module].routes++;
}

function modStats(mod) {
  const pages = modules[mod]?.pages || [];
  const pagePaths = new Set(pages.map((p) => p.path));
  const f = findings.filter((x) => pagePaths.has(x.page));
  return {
    routes: pages.length,
    issues: f.length,
    high: f.filter((x) => x.severity === "high").length,
    medium: f.filter((x) => x.severity === "medium").length,
    low: f.filter((x) => x.severity === "low").length,
    folderExists: existsSync(join(ROOT, "modules", mod)),
    pagesGenerated: existsSync(join(ROOT, "modules", mod))
      ? readdirSync(join(ROOT, "modules", mod)).filter((f) => f.endsWith(".md") && f !== "_module.md").length
      : 0,
  };
}

// Per-module index file
for (const mod of Object.keys(modules)) {
  const s = modStats(mod);
  if (!s.folderExists) continue;
  const files = readdirSync(join(ROOT, "modules", mod))
    .filter((f) => f.endsWith(".md") && f !== "_module.md")
    .sort();
  const wave = WAVES[mod] || "—";

  const lines = [
    `# وحدة \`${mod}\` — نظرة عامة`,
    "",
    `> الموجة: **${wave}** | عدد الصفحات: **${s.routes}** | أوراق منشأة: **${s.pagesGenerated}**`,
    "",
    `## KPIs`,
    `- مشاكل إجمالية: **${s.issues}** (🔴 ${s.high} / ⚠ ${s.medium} / ℹ ${s.low})`,
    "",
    `## الصفحات`,
    "",
    "| الصفحة | المسار | الكيان | سطور | API calls | أزرار | مشاكل |",
    "|--------|--------|--------|------|-----------|--------|--------|",
    ...modules[mod].pages.map((p) => {
      const b = buttons[p.path] || { lineCount: 0, buttonCount: 0, apiCalls: [] };
      const f = findings.filter((x) => x.page === p.path).length;
      const slug = (p.path.replace(/^\//, "").replace(/\/:?[\w-]+/g, (m) =>
        m.startsWith("/:") ? "-byid" : m
      ).replace(/\//g, "-").replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "index");
      return `| [${p.path}](./${slug}.md) | \`${p.path}\` | \`${(p.path.split("/").filter(Boolean).slice(-1)[0] || "?").replace(/-create|-edit|-detail/, "")}\` | ${b.lineCount} | ${(b.apiCalls || []).length} | ${b.buttonCount} | ${f} |`;
    }),
  ];

  writeFileSync(join(ROOT, "modules", mod, "_module.md"), lines.join("\n"));
}

// Root INDEX
const allMods = Object.keys(modules).sort((a, b) => (WAVES[a] || 99) - (WAVES[b] || 99) || a.localeCompare(b));
const idx = [
  "# فهرس المراجعة الشاملة للنظام",
  "# System-Wide Audit Index",
  "",
  `> آخر تحديث: ${new Date().toISOString().slice(0, 10)} | الفرع: \`claude/system-review-integration-ADPD8\``,
  `> منهجية: [methodology.md](./methodology.md) | خطة كاملة: \`/root/.claude/plans/resilient-twirling-crab.md\``,
  "",
  "## الإحصاءات",
  "",
  `- **إجمالي المسارات المسجّلة:** ${inv.length}`,
  `- **مسارات بأوراق منشأة:** ${Object.values(modStats).length ? "" : ""}${Object.keys(modules).reduce((acc, m) => acc + modStats(m).pagesGenerated, 0)}`,
  `- **إجمالي المشاكل الآلية:** ${findings.length}`,
  `  - 🔴 high: ${findings.filter((x) => x.severity === "high").length}`,
  `  - ⚠ medium: ${findings.filter((x) => x.severity === "medium").length}`,
  `  - ℹ low: ${findings.filter((x) => x.severity === "low").length}`,
  "",
  "## الفئات الكبرى",
  "",
  ...Object.entries(
    findings.reduce((m, x) => ((m[x.category] = (m[x.category] || 0) + 1), m), {})
  ).sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c}: **${n}**`),
  "",
  "## الوحدات",
  "",
  "| الموجة | الوحدة | عدد الصفحات | منشأة | مشاكل | high | medium |",
  "|--------|--------|------------|--------|--------|------|--------|",
  ...allMods.map((m) => {
    const s = modStats(m);
    const link = s.pagesGenerated > 0 ? `[\`${m}\`](./modules/${m}/_module.md)` : `\`${m}\``;
    return `| ${WAVES[m] || "—"} | ${link} | ${s.routes} | ${s.pagesGenerated} | ${s.issues} | ${s.high} | ${s.medium} |`;
  }),
  "",
  "## النتائج الموحّدة",
  "",
  "- [FINDINGS.csv](./findings/FINDINGS.csv) — كل المشاكل في صف واحد",
  "- [hardcoded-data.md](./findings/hardcoded-data.md) — البيانات الوهمية الثابتة",
  "- [orphan-buttons.md](./findings/orphan-buttons.md) — الأزرار بلا تأثير خلفي",
  "- [broken-integrations.md](./findings/broken-integrations.md) — كتابات بلا endpoint مطابق",
  "- [modeling-gaps.md](./findings/modeling-gaps.md) — ثغرات النمذجة + غياب audit/permission/tenant",
  "",
  "## التشغيل",
  "",
  "```bash",
  "# توليد الموجة الأولى (افتراضي)",
  "node audit/system-review/tooling/run-all.mjs",
  "",
  "# توليد وحدة محددة",
  "node audit/system-review/tooling/run-all.mjs --module=fleet",
  "",
  "# توليد كل الوحدات",
  "node audit/system-review/tooling/run-all.mjs --include-all",
  "",
  "# تشغيل runtime audit الزمني",
  "pnpm run audit:runtime",
  "```",
  "",
  "## حالة الموجات",
  "",
  "| الموجة | الوحدات | الحالة |",
  "|--------|---------|--------|",
  "| Wave 1 — حرجة | finance, hr, governance | ✅ 162 ورقة مولّدة |",
  "| Wave 2 — تشغيلية | properties, fleet, store, warehouse, legal, umrah | ✅ 88 ورقة + umrah ضمن operations |",
  "| Wave 3 — العملاء | crm, support, communications, marketing | ✅ 22 ورقة |",
  "| Wave 4 — تقارير | bi, documents, requests, misc | ✅ 42 ورقة |",
  "| Wave 5 — إدارية | admin, settings | ✅ 23 ورقة |",
  "| Portals | careers-portal, client-portal | ✅ مرجع لـ `PORTALS_TEST_MATRIX.md` |",
  "| Cross-module | operations (يشمل projects + umrah), root | ✅ 42 ورقة |",
  "",
  "## §3 المعزّز يدوياً (Cross-Module Transactions)",
  "",
  "صفحات تم توثيق سلسلة حركاتها يدوياً (محفوظة عبر إعادات التوليد):",
  "- [`finance/finance-invoices.md`](./modules/finance/finance-invoices.md) — GL + ZATCA + إشعار",
  "- [`finance/finance-journal-create.md`](./modules/finance/finance-journal-create.md) — ذرّية + فترة محاسبية",
  "- [`finance/finance-expenses.md`](./modules/finance/finance-expenses.md) — VAT + budget",
  "- [`finance/finance-vouchers-create.md`](./modules/finance/finance-vouchers-create.md) — allocation + توافق بنكي",
  "- [`finance/finance-payments.md`](./modules/finance/finance-payments.md) — AR Aging + بوابات الدفع",
  "- [`finance/finance-fixed-assets.md`](./modules/finance/finance-fixed-assets.md) — إهلاك + التخلّص",
  "- [`hr/hr-leaves.md`](./modules/hr/hr-leaves.md) — رصيد + راتب",
  "- [`hr/hr-attendance.md`](./modules/hr/hr-attendance.md) — تأخير + تأديب",
  "- [`hr/hr-payroll.md`](./modules/hr/hr-payroll.md) — WPS + GOSI + GL",
  "- [`properties/properties-contracts.md`](./modules/properties/properties-contracts.md) — Ejar + إشغال",
  "- [`warehouse/warehouse-movements.md`](./modules/warehouse/warehouse-movements.md) — FIFO/COGS + ربط شراء/بيع",
  "- [`fleet/fleet.md`](./modules/fleet/fleet.md) — مركبة كأصل ثابت + وقود/صيانة",
  "- [`legal/legal-cases.md`](./modules/legal/legal-cases.md) — جلسات + أتعاب + ناجز",
  "- [`store/store-orders.md`](./modules/store/store-orders.md) — حجز/شحن + فاتورة ZATCA",
  "",
];

writeFileSync(join(ROOT, "INDEX.md"), idx.join("\n"));
console.log(`build-module-index: wrote INDEX.md + ${allMods.filter((m) => modStats(m).folderExists).length} module overviews`);
