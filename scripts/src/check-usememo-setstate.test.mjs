#!/usr/bin/env node
//
// scripts/src/check-usememo-setstate.test.mjs
//
// Pure-logic fixtures for the "setState inside useMemo" detector. Exercises
// the matcher against positive (render-phase side effect) and negative
// (computed value / Date mutator / JSX event handler / out-of-useMemo)
// source snippets without touching any file or DB — so it runs in every
// environment and guards the guard itself.
//
// Exits 0 on pass, 1 on any assertion failure.
//
import {
  extractUseMemoRegions,
  fileHasUseMemoSetState,
} from "./check-usememo-setstate.mjs";

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

// ── Positives: the real bug class ──────────────────────────────────────────
assert(
  fileHasUseMemoSetState(`
    useMemo(() => {
      setBuckets((prev) => prev.map((b) => ({ ...b })));
    }, [deps]);
  `),
  "flags a bare setState inside a block-bodied useMemo",
);

assert(
  fileHasUseMemoSetState(`useMemo(() => setPrices(p), [p]);`),
  "flags a single-expression setState inside useMemo",
);

assert(
  fileHasUseMemoSetState(`React.useMemo(() => { setX(1); }, []);`),
  "flags React.useMemo too",
);

assert(
  fileHasUseMemoSetState(`useMemo(function () { setX(1); }, []);`),
  "flags a function-expression useMemo callback (no arrow)",
);

assert(
  !fileHasUseMemoSetState(
    `useMemo(function () { return <button onClick={() => setX(1)} />; }, []);`,
  ),
  "does not flag a setter inside a JSX handler of a function-expression callback",
);

assert(
  fileHasUseMemoSetState(`
    useMemo(() => {
      setBuckets((prev) => prev.map((b) => ({ ...b })));
    }, []);
  `),
  "flags a top-level setter even when an inner arrow is also present",
);

// ── Negatives: must NOT flag ────────────────────────────────────────────────
assert(
  !fileHasUseMemoSetState(`
    const rows = useMemo(() => {
      return list.filter((r) => r.amount > 0).sort();
    }, [list]);
  `),
  "does not flag a useMemo that only RETURNS a computed value",
);

assert(
  !fileHasUseMemoSetState(`
    const maxDateObj = useMemo(() => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return today;
    }, [noFuture]);
    const schedule = useMemo(() => {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + 1);
      dueDate.setDate(28);
      return dueDate;
    }, [start]);
  `),
  "does not flag Date mutators (today.setHours / dueDate.setMonth)",
);

assert(
  !fileHasUseMemoSetState(`
    const picker = useMemo(() => {
      return (
        <div>
          <input onChange={(e) => setEntityId(e.target.value)} />
          <Select onValueChange={(v) => { setEntityType(v); setEntityId(""); }} />
          <button onClick={() => setFilterCC("")}>x</button>
        </div>
      );
    }, [entityType, entityId]);
  `),
  "does not flag setters inside JSX event handlers returned by useMemo",
);

assert(
  !fileHasUseMemoSetState(`
    const total = useMemo(() => roundMoney(rows.reduce((s, r) => s + r.a, 0)), [rows]);
    const addRow = () => setRows((prev) => [...prev, empty()]);
    const onChange = (e) => setHeader({ ...header, ref: e.target.value });
  `),
  "does not flag setX calls that live OUTSIDE useMemo (event handlers)",
);

assert(
  !fileHasUseMemoSetState(
    "const x = useMemo(() => `count is ((${n}) ` + \")\" + 'a)(b', [n]);",
  ),
  "does not desync on parens/braces inside strings or template literals",
);

assert(
  !fileHasUseMemoSetState(`useMemo(() => { const v = offset(2) + resetting(); return v; }, []);`),
  "does not match identifiers that merely contain 'set' (offset/reset)",
);

// ── Structural ──────────────────────────────────────────────────────────────
assert(
  extractUseMemoRegions(`useMemo(() => a, [a]); useMemo(() => b, [b]);`).length === 2,
  "extracts multiple useMemo regions in one file",
);

if (failures) {
  console.error(`\n[check:usememo-setstate:tests] FAIL: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:usememo-setstate:tests] OK — all fixtures pass.");
