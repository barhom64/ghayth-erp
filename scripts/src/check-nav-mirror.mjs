// حارس/جرد المرآة: يشتقّ التبويبات المتوقَّعة لكل شريط أفقي من مجموعات الجانبية
// في navigation.registry.ts ويقارنها بالموجود فعلًا. قراءة فقط.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const src = fs.readFileSync(path.join(REPO, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");
const SHARED = path.join(REPO, "artifacts/ghayth-erp/src/components/shared");

function parseItemsBlock(s, startAfterBracket) {
  let i = startAfterBracket, depth = 1;
  const groups = [];
  let cur = null;
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (ch === "{") { depth++; if (depth === 2) { cur = { label: null, children: [] }; groups.push(cur); } }
    else if (ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (s.startsWith("label:", i)) {
      const lm = /label:\s*"([^"]+)"/.exec(s.slice(i, i + 90));
      if (lm) { if (depth === 2 && cur && cur.label === null) cur.label = lm[1]; else if (depth === 4 && cur) cur.children.push(lm[1]); }
    }
    i++;
  }
  return groups.filter((g) => g.label);
}
function sectionGroups(title) {
  const tIdx = src.indexOf(`title: "${title}"`);
  if (tIdx < 0) return [];
  const bracket = src.indexOf("[", src.indexOf("items:", tIdx));
  return parseItemsBlock(src, bracket + 1);
}
function tabLabels(file) {
  return fs.readFileSync(path.join(SHARED, file), "utf8").split("\n")
    .map((l) => (l.match(/\blabel:\s*"([^"]+)"/) || [])[1]).filter(Boolean);
}

// config: لكل شريط — القسم، والمستوى (top = المجموعات العليا، أو اسم مجموعة-غلاف
// لاشتقاق أبنائها)، والسماح بتبويب لوحة واحد في الصدر.
const BARS = {
  "hr-tabs-nav.tsx":        { section: "الموارد البشرية",     wrap: null },
  "finance-tabs-nav.tsx":   { section: "المالية والمحاسبة",   wrap: null },
  "fleet-tabs-nav.tsx":     { section: "الأسطول والنقل",      wrap: "إدارة الأسطول" },
  "projects-tabs-nav.tsx":  { section: "المشاريع",            wrap: "المشاريع والمهام" },
  "property-tabs-nav.tsx":  { section: "إدارة الأملاك",        wrap: "إدارة الأملاك" },
  "umrah-tabs-nav.tsx":     { section: "العمرة",              wrap: "إدارة العمرة" },
  "warehouse-tabs-nav.tsx": { section: "المستودعات والمتجر",   wrap: "المستودعات" },
  "store-tabs-nav.tsx":     { section: "المستودعات والمتجر",   wrap: "المتجر" },
};

let totalMismatch = 0;
let derived = 0;
for (const [file, cfg] of Object.entries(BARS)) {
  // bars that delegate to <ModuleTabsNav .../> derive both levels from the
  // registry → guaranteed mirror, can't drift. Count as ✓ structurally.
  const barSrc = fs.readFileSync(path.join(SHARED, file), "utf8");
  if (/<ModuleTabsNav\b/.test(barSrc)) {
    derived++;
    console.log(`\n══════ ${cfg.section}  ⇄  ${file} ══════`);
    console.log("✓ مشتقّ من السجل (ModuleTabsNav) — مرآة مضمونة بالبناء");
    continue;
  }
  const top = sectionGroups(cfg.section);
  let expected;
  if (cfg.wrap) {
    const w = top.find((g) => g.label === cfg.wrap);
    expected = w ? w.children : [];
  } else {
    expected = top.map((g) => g.label);
  }
  const actual = tabLabels(file);
  // تجاهل تبويبات اللوحة/النظرة العامة في المقارنة الصارمة للترتيب،
  // لكن نعرض الفروق في المجموعات الوظيفية.
  const expSet = new Set(expected), actSet = new Set(actual);
  const missingFromBar = expected.filter((l) => !actSet.has(l));
  const extraInBar = actual.filter((l) => !expSet.has(l));
  const mm = missingFromBar.length + extraInBar.length;
  totalMismatch += mm;
  console.log(`\n══════ ${cfg.section}  ⇄  ${file} ══════`);
  console.log(`متوقَّع من الجانبية (${expected.length}): ${expected.join(" · ")}`);
  console.log(`الموجود في الأفقية (${actual.length}): ${actual.join(" · ")}`);
  console.log(`✗ ناقص من الأفقية: ${missingFromBar.length ? missingFromBar.join(" · ") : "—"}`);
  console.log(`✗ زائد في الأفقية (لا يطابق مجموعة): ${extraInBar.length ? extraInBar.join(" · ") : "—"}`);
  console.log(mm === 0 ? "✓ مطابقة" : `⚠ ${mm} فرق`);
}
const n = Object.keys(BARS).length;
console.log(`\n═══════════ ${derived}/${n} مشتقّ (مرآة مضمونة) · ${totalMismatch} فرق متبقٍّ في الأشرطة اليدوية ═══════════`);
