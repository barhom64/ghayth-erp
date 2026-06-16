// Unit fixtures for check-rawquery-param-arity.mjs.
//
// These run unconditionally (no DB, no network) and lock down the parser plus
// both arity rules, including the exact `overstay` shape that 500'd
// GET /api/umrah/calendar/events.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readBalancedArgs,
  splitTopLevelArgs,
  maxPlaceholder,
  hasInterpolation,
  literalArrayLength,
  extractSqlLiteral,
  splitHandlers,
  findQueryCalls,
  findArrayLiteralDecls,
  analyzeSource,
} from "./check-rawquery-param-arity.mjs";

test("maxPlaceholder finds the highest $N", () => {
  assert.equal(maxPlaceholder("WHERE a=$1 AND b=$3 AND c=$2"), 3);
  assert.equal(maxPlaceholder("no placeholders"), 0);
  assert.equal(maxPlaceholder("$10 vs $9"), 10);
});

test("hasInterpolation detects template substitution", () => {
  assert.equal(hasInterpolation("WHERE a=$1 ${clause}"), true);
  assert.equal(hasInterpolation("WHERE a=$1"), false);
});

test("literalArrayLength counts top-level elements; null on spread/non-array", () => {
  assert.equal(literalArrayLength("[a, b, c]"), 3);
  assert.equal(literalArrayLength("[]"), 0);
  assert.equal(literalArrayLength("[fn(a, b), c]"), 2);
  assert.equal(literalArrayLength("[a, ...rest]"), null);
  assert.equal(literalArrayLength("baseParams"), null);
});

test("extractSqlLiteral unwraps backtick and quoted strings", () => {
  assert.equal(extractSqlLiteral("`SELECT 1`"), "SELECT 1");
  assert.equal(extractSqlLiteral("'SELECT 1'"), "SELECT 1");
  assert.equal(extractSqlLiteral("sqlVar"), null);
});

test("readBalancedArgs respects nested brackets and template interpolation", () => {
  const src = "rawQuery(`SELECT $1 ${f(a,b)} $2`, [x, y])";
  const open = src.indexOf("(");
  const inner = readBalancedArgs(src, open);
  const args = splitTopLevelArgs(inner);
  assert.equal(args.length, 2);
  assert.equal(args[1], "[x, y]");
});

test("findQueryCalls handles a generic and a plain call", () => {
  const text = "const r = rawQuery<Row>(`SELECT $1`, params); pool.query(`SELECT $1,$2`, [a,b]);";
  const calls = findQueryCalls(text);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].paramsArg, "params");
  assert.equal(calls[1].paramsArg, "[a,b]");
});

test("RULE A flags a literal array whose length != max($N)", () => {
  const src = "router.get('/x', async (req,res) => { rawQuery(`SELECT $1,$2`, [a,b,c]); });";
  const v = analyzeSource("f.ts", src);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "A");
  assert.equal(v[0].arrLen, 3);
  assert.equal(v[0].maxN, 2);
});

test("RULE A passes a correctly-sized literal array", () => {
  const src = "router.get('/x', async (req,res) => { rawQuery(`SELECT $1,$2`, [a,b]); });";
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("RULE A skips interpolated SQL (higher $N may be appended at runtime)", () => {
  const src = "router.get('/x', async (req,res) => { rawQuery(`SELECT $1,$2 ${clause}`, [a,b,c]); });";
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("findArrayLiteralDecls reports literal length; min across re-decls; skips spread", () => {
  const d = findArrayLiteralDecls(`
    const baseParams = [a, b, c];
    let nuskParams = [a, b];
    const built = makeParams();
    const spread = [a, ...rest];
  `);
  assert.equal(d.get("baseParams"), 3);
  assert.equal(d.get("nuskParams"), 2);
  assert.equal(d.has("built"), false);
  assert.equal(d.has("spread"), false);
});

test("RULE B flags the overstay shape: query refs $2 but baseParams has >=3 values", () => {
  // Mirrors the real bug: baseParams = [companyId, fromStr, toStr] (min 3),
  // overstay query references only $1,$2.
  const src = `
router.get('/calendar/events', async (req, res) => {
  const baseParams = [companyId, fromStr, toStr];
  const a = rawQuery(\`SELECT x WHERE c=$1 AND d BETWEEN $2 AND $3\`, baseParams);
  const o = rawQuery(\`SELECT $2 AS date WHERE c=$1 HAVING COUNT(*)>0\`, baseParams);
});`;
  const v = analyzeSource("umrah-entities.ts", src);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "B");
  assert.equal(v[0].identifier, "baseParams");
  assert.equal(v[0].maxN, 2);
  assert.equal(v[0].minLen, 3);
});

test("RULE B passes once overstay uses its own dedicated params array (the fix)", () => {
  const src = `
router.get('/calendar/events', async (req, res) => {
  const baseParams = [companyId, fromStr, toStr];
  const a = rawQuery(\`SELECT x WHERE c=$1 AND d BETWEEN $2 AND $3\`, baseParams);
  const overstayParams = [companyId, fromStr];
  const o = rawQuery(\`SELECT $2 AS date WHERE c=$1 HAVING COUNT(*)>0\`, overstayParams);
});`;
  assert.equal(analyzeSource("umrah-entities.ts", src).length, 0);
});

test("RULE B does NOT flag an incrementally-built empty array (the FP class)", () => {
  // `let params = []` (min length 0): a no-placeholder count query and a
  // filtered $1/$2 query both share it after .push() growth — never a bug.
  const src = `
router.get('/list', async (req,res) => {
  const params = [];
  if (req.query.q) { params.push(req.query.q); }
  const total = rawQuery(\`SELECT COUNT(*) FROM t WHERE 1=1\`, params);
  const rows = rawQuery(\`SELECT * FROM t WHERE a=$1\`, params);
});`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("RULE B does not flag max$N greater than the literal min (pushes may grow it)", () => {
  const src = `
router.get('/x', async (req,res) => {
  const baseParams = [c, f];
  baseParams.push(extra);
  rawQuery(\`SELECT a WHERE c=$1 AND f=$2 AND e=$3\`, baseParams);
});`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("RULE B ignores identifiers with no literal initializer", () => {
  const src = `
router.get('/x', async (req,res) => {
  const params = buildParams(req);
  rawQuery(\`SELECT $1\`, params);
});`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("RULE B does not group identifiers across different handlers", () => {
  const src = `
router.get('/a', async (req,res) => { const params = [a,b,c]; rawQuery(\`SELECT $1,$2,$3\`, params); });
router.get('/b', async (req,res) => { const params = [a,b]; rawQuery(\`SELECT $1,$2\`, params); });`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});

test("RULE B tolerates interpolated season clauses sharing the same offset", () => {
  const src = `
router.get('/x', async (req,res) => {
  const baseParams = [c, f, t];
  rawQuery(\`SELECT a WHERE c=$1 AND d BETWEEN $2 AND $3 \${clause}\`, baseParams);
  rawQuery(\`SELECT b WHERE c=$1 AND e BETWEEN $2 AND $3 \${clause}\`, baseParams);
});`;
  assert.equal(analyzeSource("f.ts", src).length, 0);
});
