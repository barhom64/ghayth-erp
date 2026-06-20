// Unit fixtures for check-scoped-branch-qualified.mjs.
//
// These run unconditionally (no DB, no network) and lock down the option-object
// parser plus the qualify-branch-when-company-is-qualified rule, including the
// exact warehouse-advanced (42702 ambiguous) and warehouse-cycle-counts
// (wrong-table scoping) shapes that motivated the guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readObjectKey,
  hasObjectKey,
  isQualified,
  branchScopeDisabled,
  analyzeSource,
} from "./check-scoped-branch-qualified.mjs";

test("readObjectKey reads a top-level value and stops at the next comma", () => {
  const body = ` companyColumn: 'e."companyId"', disableBranchScope: true `;
  assert.equal(readObjectKey(body, "companyColumn"), `'e."companyId"'`);
  assert.equal(readObjectKey(body, "disableBranchScope"), "true");
  assert.equal(readObjectKey(body, "branchColumn"), null);
});

test("readObjectKey preserves nested commas (object/array/call values)", () => {
  const body = ` filters: { a: 1, b: 2 }, companyColumn: 'e."companyId"' `;
  assert.equal(readObjectKey(body, "filters"), "{ a: 1, b: 2 }");
  assert.equal(readObjectKey(body, "companyColumn"), `'e."companyId"'`);
});

test("hasObjectKey detects presence regardless of value", () => {
  const body = ` branchColumn: b, includeNullBranch: true `;
  assert.equal(hasObjectKey(body, "branchColumn"), true);
  assert.equal(hasObjectKey(body, "disableBranchScope"), false);
});

test("isQualified: dotted alias is qualified, bare default is not", () => {
  assert.equal(isQualified(`'e."companyId"'`, "companyId"), true);
  assert.equal(isQualified(`'b.companyId'`, "companyId"), true);
  assert.equal(isQualified('`${a}."companyId"`', "companyId"), true);
  assert.equal(isQualified(`'"companyId"'`, "companyId"), false);
  assert.equal(isQualified(null, "companyId"), false);
});

test("branchScopeDisabled only true for an explicit true literal", () => {
  assert.equal(branchScopeDisabled(`disableBranchScope: true`), true);
  assert.equal(branchScopeDisabled(`disableBranchScope: false`), false);
  assert.equal(branchScopeDisabled(`enforceBranchScope: false`), false);
  assert.equal(branchScopeDisabled(`companyColumn: x`), false);
});

test("flags the warehouse-advanced shape: company qualified, branch on default", () => {
  const src = `
    const { where } = buildScopedWhere(scope, filters, {
      companyColumn: 'wm."companyId"',
    });`;
  const v = analyzeSource("routes/warehouse-advanced.ts", src);
  assert.equal(v.length, 1);
  assert.match(v[0].msg, /unqualified default/);
});

test("passes once branchColumn is also qualified (the warehouse-advanced fix)", () => {
  const src = `
    const { where } = buildScopedWhere(scope, filters, {
      companyColumn: 'wm."companyId"',
      branchColumn: 'wm."branchId"',
    });`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("passes with disableBranchScope:true (the warehouse-cycle-counts fix)", () => {
  const src = `
    const { where } = buildScopedWhere(scope, filters, {
      companyColumn: 'cc."companyId"',
      disableBranchScope: true,
    });`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("enforceBranchScope:false does NOT satisfy the guard", () => {
  const src = `
    const { where } = buildScopedWhere(scope, filters, {
      companyColumn: 'e."companyId"',
      enforceBranchScope: false,
    });`;
  assert.equal(analyzeSource("f.ts", src).length, 1);
});

test("skips an unqualified (default) companyColumn — not the bug class", () => {
  const src = `
    const { where } = buildScopedWhere(scope, filters, {
      companyColumn: '"companyId"',
    });`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("skips a call with no companyColumn at all (pure default scope)", () => {
  const src = `const { where } = buildScopedWhere(scope, filters);`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("skips a call whose options is a variable (can't inspect statically)", () => {
  const src = `const { where } = buildScopedWhere(scope, filters, opts);`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});
