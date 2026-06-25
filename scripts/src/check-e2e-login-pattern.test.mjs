#!/usr/bin/env node
//
// scripts/src/check-e2e-login-pattern.test.mjs
//
// Pure-logic fixtures for check-e2e-login-pattern's detector. No DB, no
// filesystem walk — runs unconditionally in guard.sh before the live scan
// so a broken regex fails with a precise diff rather than a silent green.

import assert from "node:assert/strict";
import { findViolations } from "./check-e2e-login-pattern.mjs";

let passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- SHOULD FLAG: bare-root goto in all quote styles ---------------------
t('flags page.goto("/") (double quotes)', () => {
  const hits = findViolations('  await page.goto("/");');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
});

t("flags page.goto('/') (single quotes)", () => {
  const hits = findViolations("await page.goto('/');");
  assert.equal(hits.length, 1);
});

t("flags page.goto(`/`) (template literal)", () => {
  const hits = findViolations("await page.goto(`/`);");
  assert.equal(hits.length, 1);
});

t("flags bare-root goto with extra whitespace", () => {
  const hits = findViolations('await page.goto(  "/"  );');
  assert.equal(hits.length, 1);
});

t("reports correct line numbers across a multi-line source", () => {
  const src = ['import x from "y";', 'await page.goto("/login");', 'await page.goto("/");'].join("\n");
  const hits = findViolations(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
});

// --- SHOULD NOT FLAG: any deeper path ------------------------------------
t('does not flag goto("/login")', () => {
  assert.equal(findViolations('await page.goto("/login");').length, 0);
});

t('does not flag goto("/employees")', () => {
  assert.equal(findViolations('await page.goto("/employees");').length, 0);
});

t("does not flag goto with a template path expression", () => {
  assert.equal(findViolations("await page.goto(`/groups/${id}`);").length, 0);
});

t('does not flag goto("/dashboard") after login', () => {
  assert.equal(findViolations('await page.goto("/dashboard");').length, 0);
});

t("does not flag an absolute URL goto", () => {
  assert.equal(findViolations('await page.goto("http://localhost/");').length, 0);
});

t("clean source yields no hits", () => {
  const src = ['import { login } from "./_helpers/login";', "await login(page);"].join("\n");
  assert.equal(findViolations(src).length, 0);
});

console.log(`\ncheck-e2e-login-pattern.test.mjs: ${passed} passed`);
