#!/usr/bin/env node
//
// scripts/src/check-mobile-grids.test.mjs
//
// Pure-logic fixtures for the mobile grid-cramping detector. Exercises
// `lineIsCrampedGrid` against snippets that MUST flag (a bare grid-cols>=4
// that reflows badly on a phone) and ones that MUST NOT (responsive collapse,
// key-value rows, scroll wrappers, excluded files, comments) — no file/DB
// access, so it guards the guard itself.
//
// Run:  node scripts/src/check-mobile-grids.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//
import { lineIsCrampedGrid } from "./check-mobile-grids.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// helper: single-line snippet, not in an excluded file
const flags = (line, extra = []) => lineIsCrampedGrid([line, ...extra], 0, false);

console.log("positives — must FLAG (bare grid-cols>=4 = cramped mobile layout)");
assert(flags(`        <div className="grid grid-cols-5 gap-2">`), "bare grid-cols-5");
assert(flags(`        <div className="grid grid-cols-4 gap-2 text-xs">`), "bare grid-cols-4");
assert(flags(`        <div className="grid gap-2 grid-cols-7 text-sm font-bold">`), "bare grid-cols-7 (gap before cols)");
assert(flags(`        <TabsList className="grid w-full grid-cols-6">`), "bare grid-cols-6 TabsList");
assert(
  lineIsCrampedGrid([`<div className="overflow-x-auto">`, ...Array(9).fill("  <span/>"), `  <div className="grid grid-cols-7">`], 10, false),
  "grid-cols-7 with overflow wrapper >8 lines up (lookback miss = still flags)",
);

console.log("negatives — must NOT flag");
assert(!flags(`        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">`), "responsive collapse (bare grid-cols-2)");
assert(!flags(`        <div className="grid grid-cols-3 gap-2">`), "grid-cols-3 (3 cols fit a phone)");
assert(!flags(`        <div className="grid md:grid-cols-6">`), "responsive-only prefix (no bare grid-cols)");
assert(!flags(`        <div className="grid grid-cols-7 gap-4 min-w-[760px]">`), "min-w on the element (scrolls sideways)");
assert(
  !lineIsCrampedGrid([`<div className="grid grid-cols-4">`, `  <span>label</span>`, `  <span className="col-span-2">value</span>`], 0, false),
  "key-value row (col-span value in window)",
);
assert(
  !lineIsCrampedGrid([`<div className="overflow-x-auto">`, `  <div className="grid grid-cols-7 gap-2">`], 1, false),
  "grid inside overflow-x-auto wrapper (1 line up)",
);
assert(lineIsCrampedGrid([`<div className="grid grid-cols-7">`], 0, true) === false, "excluded file (calendar/guide/mock)");
assert(!flags(`        // <div className="grid grid-cols-5"> legacy`), "commented-out line");
assert(!flags(`         * a grid grid-cols-6 mentioned in JSDoc prose`), "JSDoc prose line");
// variant prefixes that the old [a-z0-9]+ char-class couldn't parse — every
// variant ends in `:`, so the lookbehind treats them all as prefixed (not bare)
assert(!flags(`        <div className="grid min-[480px]:grid-cols-6">`), "arbitrary breakpoint min-[480px]: is a variant, not bare");
assert(!flags(`        <div className="grid data-[open]:grid-cols-6">`), "data-attribute data-[open]: variant, not bare");
assert(!flags(`        <div className="grid 2xl:grid-cols-6">`), "2xl: variant, not bare");
// `grid-cols-` embedded in a larger token is not a bare grid-cols class
assert(!flags(`        <div className="auto-grid-cols-6">`), "sub-token auto-grid-cols-6, not a bare class");
// key-value where the col-span value sits ONE line ABOVE the grid (value-first)
assert(
  !lineIsCrampedGrid([`  <span className="col-span-2">value</span>`, `  <div className="grid grid-cols-4">`], 1, false),
  "value-first key-value (col-span one line above the grid)",
);

if (failed) {
  console.error(`\n[check:mobile-grids:tests] ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:mobile-grids:tests] all assertions passed.");
