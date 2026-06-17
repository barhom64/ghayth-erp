#!/usr/bin/env node
//
// scripts/src/check-link-nested-anchor.test.mjs
//
// Pure-logic fixtures for the nested-anchor detector. No DB / FS scan —
// asserts fileHasLinkNestedAnchor() flags `<Link>`-without-asChild wrapping
// `<a>` and does NOT flag the safe forms. Run BEFORE the gate in guard.sh.
//
import assert from "node:assert/strict";
import { fileHasLinkNestedAnchor, findLinkNestedAnchorLines } from "./check-link-nested-anchor.mjs";

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err.message);
    process.exit(1);
  }
}

// ---- SHOULD FLAG: <Link> without asChild wrapping <a> ----

t("single-line <Link href><a> is flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x"><a className="t">X</a></Link>`), true);
});

t("multi-line <Link>\\n<a> is flagged", () => {
  const src = `
    <Link key={tab.href} href={tab.href}>
      <a className="tab">
        {tab.label}
      </a>
    </Link>`;
  assert.equal(fileHasLinkNestedAnchor(src), true);
});

t("<Link to={...}><a> is flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link to={path}><a>go</a></Link>`), true);
});

t("<Link> with className then <a> is flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x" className="block"><a>Y</a></Link>`), true);
});

t("<Link> with a {cond} guard before <a> is flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x">{ok && <a>Z</a>}</Link>`), true);
});

t("inline-in-paragraph <Link href><a> is flagged", () => {
  const src = `<p>see <Link href="/docs"><a className="link">docs</a></Link> here</p>`;
  assert.equal(fileHasLinkNestedAnchor(src), true);
});

// ---- SHOULD NOT FLAG: safe forms ----

t("<Link asChild><a> is NOT flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x" asChild><a className="t">X</a></Link>`), false);
});

t("multi-line <Link asChild>\\n<a> is NOT flagged", () => {
  const src = `
    <Link key={tab.href} href={tab.href} asChild>
      <a className="tab">{tab.label}</a>
    </Link>`;
  assert.equal(fileHasLinkNestedAnchor(src), false);
});

t("<Link href>text-only</Link> (no inner <a>) is NOT flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x">Home</Link>`), false);
});

t("<Link href><Button> (button-nesting, other guard) is NOT flagged here", () => {
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x"><Button>Go</Button></Link>`), false);
});

t("<Link href><span><a> indirect (not direct child) is NOT flagged", () => {
  // The <a> is wrapped in a <span>, so wouter renders its own <a> around a
  // <span>; the inner <a> is then nested but that is a different (rarer)
  // shape the heuristic intentionally does not chase.
  assert.equal(fileHasLinkNestedAnchor(`<Link href="/x"><span><a>n</a></span></Link>`), false);
});

t("a bare <a> with no <Link> is NOT flagged", () => {
  assert.equal(fileHasLinkNestedAnchor(`<a href="https://x.com">ext</a>`), false);
});

t("asChild on a later sibling <Link> does not mask an earlier offender", () => {
  const src = `
    <Link href="/a"><a>bad</a></Link>
    <Link href="/b" asChild><a>good</a></Link>`;
  assert.equal(fileHasLinkNestedAnchor(src), true);
});

// ---- line reporting ----

t("findLinkNestedAnchorLines reports the <Link> line", () => {
  const src = `import x;\n<Link href="/x"><a>X</a></Link>\n`;
  const hits = findLinkNestedAnchorLines(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
});

console.log(`[check:link-nested-anchor:tests] OK — ${passed} assertions passed.`);
