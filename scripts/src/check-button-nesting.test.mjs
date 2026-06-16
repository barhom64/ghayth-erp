#!/usr/bin/env node
//
// scripts/src/check-button-nesting.test.mjs
//
// Pure-logic fixtures for the interactive-element nesting detector. Exercises
// the `fileHasNesting` matcher against positive (invalid) and negative (valid
// or unrelated) source snippets without touching any file or DB — so it runs
// in every environment and guards the guard itself.
//
// Run:  node scripts/src/check-button-nesting.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { fileHasNesting } from "./check-button-nesting.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

// ── positives: invalid <Link><Button> nesting (renders <a><button>) ──────
console.log("positives — must FLAG");
assert(
  fileHasNesting(`<Link to="/x"><Button>Go</Button></Link>`),
  "single-line <Link><Button>",
);
assert(
  fileHasNesting(`<Link\n  to="/x"\n  className="block"\n>\n  <Button variant="ghost">Go</Button>\n</Link>`),
  "multi-line <Link> tag wrapping <Button>",
);
assert(
  fileHasNesting(`<Link to="/x">{" "}<Button>Go</Button></Link>`),
  "single {…} expression (whitespace) between Link and Button",
);
assert(
  fileHasNesting(`<Link to={\`/x/\${id}\`} state={{from}}><Button size="sm">عرض</Button></Link>`),
  "template-literal href + Arabic label",
);

// ── negatives: valid asChild idiom or unrelated markup ───────────────────
console.log("negatives — must NOT flag");
assert(
  !fileHasNesting(`<Button asChild><Link to="/x">Go</Link></Button>`),
  "valid shadcn asChild idiom (inverse nesting)",
);
assert(
  !fileHasNesting(`<Link to="/x">عرض التفاصيل</Link>`),
  "plain <Link> with text, no Button",
);
assert(
  !fileHasNesting(`<Button onClick={go}>Go</Button>`),
  "standalone <Button>, no Link",
);
assert(
  !fileHasNesting(`<Link to="/x"><span>Go</span></Link>`),
  "<Link> wrapping a non-Button element",
);
assert(
  !fileHasNesting(`<LinkButton to="/x">Go</LinkButton>`),
  "<LinkButton> composite is not <Link><Button>",
);

if (failed) {
  console.error(`\n[check:button-nesting:tests] FAIL — ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:button-nesting:tests] OK — all fixtures pass.");
