#!/usr/bin/env node
//
// scripts/src/check-page-actions.test.mjs
//
// Pure-logic fixtures for the page action-bar refresh detector. Exercises
// `fileHasManualRefresh` against positive (hand-rolled refresh) and negative
// (unified component, decorative icon, or a longer-phrase toggle) snippets
// without touching any file or DB — so it runs in every environment and
// guards the guard itself.
//
// Run:  node scripts/src/check-page-actions.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { fileHasManualRefresh } from "./check-page-actions.mjs";

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

if (failed) {
  console.error(`\n[check:page-actions:tests] FAIL — ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:page-actions:tests] OK — all fixtures pass.");
