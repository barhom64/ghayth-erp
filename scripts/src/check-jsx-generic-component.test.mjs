#!/usr/bin/env node
//
// Pure-logic fixtures for the JSX component-generic `<any>` detector.
// Runs unconditionally (no DB/build/server) — guard.sh runs this BEFORE
// the gate so a detector regression is caught as a test failure.
//
import assert from "node:assert/strict";
import { fileHasJsxGenericAny } from "./check-jsx-generic-component.mjs";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(`  ✗ ${name}: expected ${expected}, got ${actual}`);
  }
}

// --- POSITIVES: component RENDERED in JSX with an <any> generic ---------
check(
  "DataTable with props",
  fileHasJsxGenericAny(`<DataTable<any> columns={cols} data={rows} />`),
  true,
);
check(
  "DataTable multi-line opening tag",
  fileHasJsxGenericAny(`<DataTable<any>\n  columns={cols}\n  data={rows}\n/>`),
  true,
);
check(
  "Component with spread prop",
  fileHasJsxGenericAny(`<Grid<any> {...gridProps} />`),
  true,
);
check(
  "Self-closing no props (space)",
  fileHasJsxGenericAny(`<Widget<any> />`),
  true,
);
check(
  "Self-closing no props (no space)",
  fileHasJsxGenericAny(`<Widget<any>/>`),
  true,
);

// --- NEGATIVES: TYPE positions, never a JSX call -----------------------
check(
  "useMemo type annotation",
  fileHasJsxGenericAny(`const cols = useMemo<DataTableColumn<any>[]>(() => [], []);`),
  false,
);
check(
  ".map generic type arg",
  fileHasJsxGenericAny(`...fields.map<DataTableColumn<any>>((f) => ({ key: f.name }))`),
  false,
);
check(
  "useState generic type arg",
  fileHasJsxGenericAny(`const [s, set] = useState<Foo<any>>();`),
  false,
);
check(
  "Record type with trailing space",
  fileHasJsxGenericAny(`type T = Record<string, Foo<any> >;`),
  false,
);
check(
  "as-cast",
  fileHasJsxGenericAny(`const x = y as Foo<any>;`),
  false,
);
check(
  "Array generic type",
  fileHasJsxGenericAny(`let arr: Array<Foo<any>> = [];`),
  false,
);

// --- NEGATIVES: named JSX generics render fine, must NOT flag -----------
check(
  "named JSX generic with props",
  fileHasJsxGenericAny(`<DataTable<MyRow> columns={cols} data={rows} />`),
  false,
);
check(
  "named JSX generic self-closing",
  fileHasJsxGenericAny(`<EntityEditDialog<PolicyEditForm> open={o} />`),
  false,
);

// --- NEGATIVES: plain JSX, no generic ----------------------------------
check(
  "plain component",
  fileHasJsxGenericAny(`<DataTable columns={cols} data={rows} />`),
  false,
);

if (fail) {
  console.error(`\n[check:jsx-generic-component:tests] FAIL — ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`[check:jsx-generic-component:tests] OK — ${pass} passed`);
