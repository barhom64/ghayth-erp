#!/usr/bin/env node
//
// Pure-logic fixtures for check-hooks-rules.mjs — guards the guard itself.
// Confirms the detector catches each real Rules-of-Hooks violation class AND
// stays silent on the legitimate patterns (forwardRef/memo components, custom
// hooks, top-level hooks before an early return). No DB, no filesystem scan.
//
import assert from "node:assert";
import { scanSource } from "./check-hooks-rules.mjs";

const rules = (src) => scanSource("fixture.tsx", src).map((v) => v.rule).sort();

// ─── BAD — must be flagged ──────────────────────────────────────────────────

// Rule B — hook AFTER an early return (the expenses-create / exempt-pilgrims bug)
assert.deepStrictEqual(
  rules(`
    function Page() {
      const { toast } = useToast();
      if (loading) return <Spinner/>;
      const [x, setX] = useState(0);
      return <div>{x}</div>;
    }
  `),
  ["B"],
  "Rule B: useState after early return must be flagged",
);

// Rule B — a hook-returning helper call after the guard (usePrintRows case)
assert.ok(
  scanSource("f.tsx", `
    function List() {
      const { data } = useApiQuery(["k"], "/k");
      if (!data) return <Empty/>;
      const rows = data ?? [];
      const { sortedRows } = usePrintRows(rows);
      return <Table rows={sortedRows}/>;
    }
  `).some((v) => v.rule === "B"),
  "Rule B: usePrintRows after early return must be flagged",
);

// Rule A — hook in a function that is neither a component nor a hook (org-model api)
assert.deepStrictEqual(
  rules(`
    function api(path) {
      return useApiQuery([path], path);
    }
  `),
  ["A"],
  "Rule A: useApiQuery inside non-component/non-hook helper must be flagged",
);

// Rule C — hook inside a conditional block
assert.ok(
  scanSource("f.tsx", `
    function Comp() {
      if (cond) { useEffect(() => {}, []); }
      return <div/>;
    }
  `).some((v) => v.rule === "C"),
  "Rule C: useEffect inside if-block must be flagged",
);

// Rule C — hook inside a ternary / short-circuit
assert.ok(
  scanSource("f.tsx", `function Comp() { const v = cond && useMemo(() => 1, []); return <div/>; }`)
    .some((v) => v.rule === "C"),
  "Rule C: useMemo behind && must be flagged",
);

// ─── GOOD — must NOT be flagged ─────────────────────────────────────────────

// normal component: all hooks before the early return
assert.deepStrictEqual(
  rules(`
    function Page() {
      const [x, setX] = useState(0);
      useEffect(() => {}, []);
      if (loading) return <Spinner/>;
      return <div>{x}</div>;
    }
  `),
  [],
  "clean component (hooks before return) must pass",
);

// forwardRef component — anonymous arrow whose name is on the const
assert.deepStrictEqual(
  rules(`
    const Item = React.forwardRef((props, ref) => {
      const ctx = React.useContext(Ctx);
      const id = useId();
      return <div ref={ref}>{ctx}</div>;
    });
  `),
  [],
  "forwardRef component must pass (HOC unwrap)",
);

// memo component
assert.deepStrictEqual(
  rules(`const C = memo(() => { const [x] = useState(0); return <div>{x}</div>; });`),
  [],
  "memo component must pass",
);

// custom hook calling hooks (name starts with use)
assert.deepStrictEqual(
  rules(`function useThing() { const [x] = useState(0); useEffect(() => {}, []); return x; }`),
  [],
  "custom hook must pass",
);

// a hook's OWN callback argument is not a conditional hook call
assert.deepStrictEqual(
  rules(`function Comp() { useEffect(() => { doSomething(); }, []); return <div/>; }`),
  [],
  "callback inside useEffect must not be flagged",
);

console.log("[32m✓[0m check-hooks-rules.test.mjs — all fixtures passed");
