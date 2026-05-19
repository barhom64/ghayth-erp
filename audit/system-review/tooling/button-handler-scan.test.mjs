#!/usr/bin/env node
//
// audit/system-review/tooling/button-handler-scan.test.mjs
//
// Issue #640 — the button-handler scanner must distinguish:
//   safe   `<Button asChild><Link href=…>…</Link></Button>`
//   risky  `<Link href=…><Button>…</Button></Link>`
//
// Both produce `wrappedByLink: true` (the button isn't orphan in either
// case), but only the risky form should set `linkButtonNestingRisk`. The
// fixtures below exercise the predicate that the scanner relies on, so a
// regression that flattens the distinction trips this test.
//
// Run:  node audit/system-review/tooling/button-handler-scan.test.mjs
//
// Exits 0 on pass, 1 on assertion failure.
//

import { classifyLinkButton } from "./button-handler-scan.mjs";

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log("classifyLinkButton");

// 1. Risky: <Link href> opens above, <Button> without asChild on the line.
{
  const before = `<Link href="/dashboard">`;
  const blob = `<Button variant="ghost" size="icon" className="h-8 w-8" title="home"> <Home /> </Button>`;
  const out = classifyLinkButton(before, blob);
  assert(out.wrappedByLink === true, "risky form is wrappedByLink");
  assert(out.linkButtonNestingRisk === true, "risky form raises nesting risk");
  assert(out.buttonIsAsChild === false, "risky form is not asChild");
}

// 2. Safe slot form: <Button asChild> with <Link> on a following line.
{
  const before = ``; // nothing relevant above
  const blob = `<Button asChild variant="outline" size="sm"> <Link href="/dashboard"> <Home /> </Link> </Button>`;
  const out = classifyLinkButton(before, blob);
  assert(out.wrappedByLink === true, "safe slot form still satisfies wrappedByLink");
  assert(out.linkButtonNestingRisk === false, "safe slot form does NOT raise nesting risk");
  assert(out.buttonIsAsChild === true, "safe slot form is asChild");
}

// 3. Orphan Button (no Link anywhere). Neither flag should fire.
{
  const before = `<div className="row">`;
  const blob = `<Button onClick={handleClick}>Do thing</Button>`;
  const out = classifyLinkButton(before, blob);
  assert(out.wrappedByLink === false, "orphan button is NOT wrappedByLink");
  assert(out.linkButtonNestingRisk === false, "orphan button has no nesting risk");
}

// 4. Link opens INLINE on the blob (e.g. sibling, not wrapper). Ambiguous
//    by design — wrappedByLink is satisfied (so the button isn't flagged
//    orphan downstream) but we deliberately do NOT raise the nesting
//    risk: the regex can't tell wrapping from sibling on a single line.
{
  const before = ``;
  const blob = `<div> <Link href="/x">x</Link> <Button>y</Button> </div>`;
  const out = classifyLinkButton(before, blob);
  assert(out.wrappedByLink === true, "inline Link satisfies wrappedByLink");
  assert(out.linkButtonNestingRisk === false, "inline Link does NOT raise nesting risk (ambiguous)");
}

// 5. Combo edge: Link opens above AND Button is asChild (unusual but
//    valid). Safe — asChild wins.
{
  const before = `<Link href="/x">`;
  const blob = `<Button asChild>…</Button>`;
  const out = classifyLinkButton(before, blob);
  assert(out.linkButtonNestingRisk === false, "asChild defuses the nesting risk even with Link above");
}

if (failed > 0) {
  console.log(`\nclassifyLinkButton FAIL — ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll classifyLinkButton fixtures passed.");
