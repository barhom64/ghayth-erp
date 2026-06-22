#!/usr/bin/env node
//
// scripts/src/check-page-actions.test.mjs
//
// Pure-logic fixtures for the page action-bar detector (refresh/print/export).
// Exercises `fileHasManualRefresh` / `fileManualActions` against positive
// (hand-rolled) and negative (unified component, decorative icon, longer-phrase,
// or non-<Button> element) snippets without touching any file or DB — so it runs
// in every environment and guards the guard itself.
//
// Run:  node scripts/src/check-page-actions.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { fileHasManualRefresh, fileManualActions, fileManualActionCounts } from "./check-page-actions.mjs";
const hasPrint = (t) => fileManualActions(t).has("print");
const hasExport = (t) => fileManualActions(t).has("export");

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── positives: a hand-rolled refresh button (RefreshCw + bare «تحديث») ────
console.log("positives — must FLAG");
assert(
  fileHasManualRefresh(`<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 me-1" /> تحديث</Button>`),
  "classic outline refresh button",
);
assert(
  fileHasManualRefresh(`<Button\n  variant="ghost"\n  onClick={reload}\n>\n  <RefreshCw className="h-3 w-3" />\n  تحديث\n</Button>`),
  "multi-line button, icon + label on separate lines",
);
assert(
  fileHasManualRefresh(`<button type="button" onClick={refetch}><RefreshCw /> تحديث</button>`),
  "lowercase <button> variant",
);
assert(
  fileHasManualRefresh(`<Button onClick={refetch}><RefreshCw className={spinning ? "animate-spin" : ""} /> <span>تحديث</span></Button>`),
  "label wrapped in <span>",
);

// ── negatives: unified component / decorative icon / longer-phrase toggle ─
console.log("negatives — must NOT flag");
assert(
  !fileHasManualRefresh(`<RefreshAction onRefresh={refetch} />`),
  "unified RefreshAction component (the desired form)",
);
assert(
  !fileHasManualRefresh(`<div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /><span>جاري التحميل…</span></div>`),
  "decorative spinning RefreshCw, no button, no «تحديث»",
);
assert(
  !fileHasManualRefresh(`<Button variant="outline" onClick={toggleAuto}><RefreshCw className="h-4 w-4" /> تحديث تلقائي</Button>`),
  "auto-refresh toggle («تحديث تلقائي») — a longer phrase, not the bare label",
);
assert(
  !fileHasManualRefresh(`<Button onClick={snap}><RefreshCw /> تحديث اللقطة الآن</Button>`),
  "snapshot recompute («تحديث اللقطة الآن») — longer phrase",
);
assert(
  !fileHasManualRefresh(`<Button onClick={run}><RefreshCw /> تحديث التحليل</Button>`),
  "analysis recompute («تحديث التحليل») — longer phrase",
);
assert(
  !fileHasManualRefresh(`<Button onClick={save}><Save className="h-4 w-4" /> تحديث</Button>`),
  "«تحديث» label with a non-refresh icon (update/save action)",
);
assert(
  !fileHasManualRefresh(`<Button onClick={refetch} aria-label="تحديث"><RefreshCw className="h-4 w-4" /></Button>`),
  "icon-only refresh, «تحديث» only in aria-label (not a visible body label)",
);

// ── print: hand-rolled print button (Printer + bare «طباعة») ──────────────
console.log("print — must FLAG / NOT flag");
assert(
  hasPrint(`<Button variant="outline" size="sm" onClick={() => { logClientPrint("x"); window.print(); }}><Printer className="h-4 w-4 ml-2" /> طباعة</Button>`),
  "bespoke browser-print button (Printer + «طباعة»)",
);
assert(
  hasPrint(`<Button onClick={handlePrint}><Printer className="h-4 w-4 me-1" />طباعة</Button>`),
  "print button, label adjacent to icon",
);
assert(
  !hasPrint(`<PrintButton documentType="invoice" documentId={id} />`),
  "unified PrintButton (no bare «طباعة» inside a <Button>)",
);
assert(
  !hasPrint(`<Button onClick={a4}><Printer /> طباعة A4</Button>`),
  "«طباعة A4» — longer phrase, not the bare label",
);
assert(
  !hasPrint(`<Button onClick={save}><Save className="h-4 w-4" /> طباعة</Button>`),
  "«طباعة» label with a non-Printer icon",
);

// ── export: hand-rolled export button (Download + bare «تصدير») ───────────
console.log("export — must FLAG / NOT flag");
assert(
  hasExport(`<Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> تصدير</Button>`),
  "bespoke export button (Download + «تصدير»)",
);
assert(
  !hasExport(`<ExportAction onExport={exportCsv} />`),
  "unified ExportAction (the desired form)",
);
assert(
  !hasExport(`<Button onClick={x}><Download /> تصدير Excel</Button>`),
  "«تصدير Excel» — longer phrase, not the bare label",
);
assert(
  !hasExport(`<a href={url} download><Download className="h-4 w-4" /> تصدير</a>`),
  "download <a> link, not a <Button>",
);

// ── occurrence counts: a file's count rises with each bespoke button, so a NEW
//    one inside an already-allowlisted file still trips the gate (the baseline
//    count is recorded in the allowlist) ───────────────────────────────────
console.log("counts — occurrences per file/action");
assert(
  fileManualActionCounts(
    `<Button onClick={p1}><Printer /> طباعة</Button>\n<div/>\n<Button onClick={p2}><Printer className="h-4 w-4 me-1" />طباعة</Button>`,
  ).get("print") === 2,
  "two bespoke print buttons in one file count as 2",
);
const mixed = fileManualActionCounts(
  `<Button onClick={r}><RefreshCw /> تحديث</Button>\n<Button onClick={p}><Printer /> طباعة</Button>`,
);
assert(
  mixed.get("refresh") === 1 && mixed.get("print") === 1,
  "different actions in one file are counted independently",
);

if (failed) {
  console.error(`\n[check:page-actions:tests] FAIL — ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:page-actions:tests] OK — all fixtures pass.");
