#!/usr/bin/env node
//
// scripts/src/check-audit-coverage.test.mjs
//
// Pure-logic fixtures for the audit-coverage detector. Exercises
// `unauditedWriteKeys` against endpoint records with and without audit, without
// touching any file or DB — so it runs in every environment and guards the
// guard itself.
//
// Run:  node scripts/src/check-audit-coverage.test.mjs
// Exits 0 on pass, 1 on any assertion failure.
//

import { unauditedWriteKeys, buildMountMap, auditWrapperCallMatcher, KNOWN_AUDIT_WRAPPERS } from "./check-audit-coverage.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 ${label}`);
    failed++;
  }
}

// ── positives: write endpoints WITHOUT audit must be flagged ─────────────
console.log("positives — must FLAG unaudited writes");
{
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/finance/journal/:id/reverse", hasAudit: false },
  ]);
  assert(
    keys.includes("POST /finance/journal/:id/reverse"),
    "unaudited POST flagged with METHOD path key",
  );
}
{
  const keys = unauditedWriteKeys([
    { method: "PUT", path: "/a", hasAudit: false },
    { method: "PATCH", path: "/b", hasAudit: false },
    { method: "DELETE", path: "/c", hasAudit: false },
  ]);
  assert(keys.length === 3, "PUT/PATCH/DELETE all counted as writes");
  assert(
    JSON.stringify(keys) === JSON.stringify(["DELETE /c", "PATCH /b", "PUT /a"]),
    "keys returned sorted for stable allowlist diffs",
  );
}
{
  // identical METHOD+path from two mount prefixes collapse to one key
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/hr/x", hasAudit: false },
    { method: "POST", path: "/hr/x", hasAudit: false },
  ]);
  assert(keys.length === 1, "duplicate METHOD+path de-duplicated");
}

// ── negatives: GET and audited writes must NOT be flagged ────────────────
console.log("negatives — must NOT flag");
{
  const keys = unauditedWriteKeys([
    { method: "GET", path: "/finance/invoices", hasAudit: false },
  ]);
  assert(keys.length === 0, "GET (read) never flagged even without audit");
}
{
  const keys = unauditedWriteKeys([
    { method: "POST", path: "/finance/invoices", hasAudit: true },
    { method: "DELETE", path: "/finance/invoices/:id", hasAudit: true },
  ]);
  assert(keys.length === 0, "audited writes (createAuditLog/emitEvent/mw) not flagged");
}
{
  const keys = unauditedWriteKeys([
    { method: "GET", path: "/r", hasAudit: false },
    { method: "POST", path: "/w-ok", hasAudit: true },
    { method: "POST", path: "/w-gap", hasAudit: false },
  ]);
  assert(
    JSON.stringify(keys) === JSON.stringify(["POST /w-gap"]),
    "mixed set isolates only the unaudited write",
  );
}

// ── mount-map parsing: every router symbol must map to its file, including
// multi-symbol named-import lists and `as` aliases (the bug that produced
// non-canonical keys like `POST /:id/ocr/rerun`) ────────────────────────────
console.log("mount map — every imported router resolves to its mount prefix");
{
  const src = [
    'import { aRouter, bRouter, cRouter } from "./wiring-stubs.js";',
    'import documentsRouter from "./documents.js";',
    'import { x as financeRouter } from "./finance.js";',
    "const router = Router();",
    'router.use("/wh", aRouter);',
    'router.use("/docs", bRouter);',
    'router.use("/admin", cRouter);',
    'router.use("/documents", documentsRouter);',
    'router.use("/finance", financeRouter);',
  ].join("\n");
  const mm = buildMountMap(src);
  assert(
    (mm["wiring-stubs.ts"] || []).includes("/wh"),
    "first router of a named-import list maps",
  );
  assert(
    (mm["wiring-stubs.ts"] || []).includes("/docs") &&
      (mm["wiring-stubs.ts"] || []).includes("/admin"),
    "2nd+ routers of a named-import list ALSO map (the fixed bug)",
  );
  assert(
    (mm["documents.ts"] || []).includes("/documents"),
    "default import maps to its file",
  );
  assert(
    (mm["finance.ts"] || []).includes("/finance"),
    "aliased named import (x as financeRouter) maps via the alias",
  );
}

// ── file-local audit-wrapper detection ──────────────────────────────────
// A router that funnels every write through a thin wrapper (which itself calls
// an audit primitive) must be recognised as audited, without the wrapper's name
// being a primitive. The detector must also NOT misread method calls (.push())
// or `{}` in a multi-line signature as a wrapper/body.
console.log("audit-wrapper detection");
{
  // real multi-line wrapper whose signature carries an inline object type AND a
  // `= {}` default — the body brace must still be found past the param list.
  const src = [
    "function recordAction(",
    "  req,",
    "  params: { id: number },",
    "  after = {},",
    "): void {",
    "  void emitEvent({ entity: 'x', entityId: params.id });",
    "  void auditFromRequest(req, 'update', 'x', params.id, { after });",
    "}",
    "router.post('/:id/close', auth, async (req, res) => {",
    "  recordAction(req, { id: 1 });",
    "  res.json({ ok: true });",
    "});",
    "router.post('/:id/raw', auth, async (req, res) => {",
    "  const arr = []; arr.push(1);", // .push must NOT count as audit
    "  res.json({ ok: true });",
    "});",
  ].join("\n");
  const re = auditWrapperCallMatcher(src);
  assert(re !== null && re.test("  recordAction(req, { id: 1 });"), "multi-line wrapper (inline type + {} default) detected & matched");
  assert(re !== null && !re.test("  const arr = []; arr.push(1);"), "array .push() not read as a wrapper call");
}
{
  // a file with NO audit primitives anywhere yields no matcher.
  const src = "const helper = (x) => x + 1;\nrouter.post('/a', (req,res)=>{ helper(1); res.end(); });";
  assert(auditWrapperCallMatcher(src) === null, "no matcher when file has no audit primitive");
}
{
  // a local `push` arrow (collection helper) must never become a wrapper even
  // if an unrelated emitEvent appears later in the file.
  const src = [
    "const push = (c, v) => { params.push(v); sets.push(c); };",
    "router.patch('/x', (req,res)=>{ push('a', 1); res.json({}); });",
    "router.post('/y', (req,res)=>{ emitEvent({}); res.json({}); });",
  ].join("\n");
  const re = auditWrapperCallMatcher(src);
  assert(re === null || !re.test("push('a', 1)"), "collection `push` helper not treated as audit wrapper");
}

// ── cross-file wrapper recognition: applyTransition, incl. generic-typed calls
// `applyTransition<Record<string, unknown>>({…})`. Before the regex allowed an
// optional `<…>` type-argument list, 22 audited finance/legal/support lifecycle
// handlers (journal-manual submit/review/approve/post, budgets/commitments/
// financial-requests/receivables approve, bank-guarantees cancel/release, …)
// were mis-reported as audit gaps. ──────────────────────────────────────────
console.log("known audit-wrapper — applyTransition with/without generics");
{
  const r = () => new RegExp(KNOWN_AUDIT_WRAPPERS.source); // fresh, no /g state
  assert(r().test("await applyTransition({"), "plain applyTransition( recognised");
  assert(r().test("await applyTransition<Foo>({"), "single-generic applyTransition<Foo>( recognised");
  assert(
    r().test("const updated = await applyTransition<Record<string, unknown>>({"),
    "nested-generic applyTransition<Record<string, unknown>>( recognised (the fixed gap)",
  );
  assert(!r().test("foo.applyTransition<Foo>("), "method call foo.applyTransition(…) NOT recognised");
  assert(!r().test("myApplyTransitionX("), "different identifier NOT recognised");
}

if (failed) {
  console.error(`\n[check:audit-coverage.test] ${failed} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\n[check:audit-coverage.test] all assertions passed");
