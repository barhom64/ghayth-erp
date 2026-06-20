#!/usr/bin/env node
//
// Pure-logic fixtures for the JSX component-generic detector.
// Runs unconditionally (no DB/build/server) — guard.sh runs this BEFORE
// the gate so a detector regression is caught as a test failure.
//
import { fileHasJsxGenericComponent } from "./check-jsx-generic-component.mjs";

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

// --- POSITIVES: component RENDERED in JSX with an `<any>` generic -------
check(
  "DataTable with props",
  fileHasJsxGenericComponent(`<DataTable<any> columns={cols} data={rows} />`),
  true,
);
check(
  "DataTable multi-line opening tag",
  fileHasJsxGenericComponent(`<DataTable<any>\n  columns={cols}\n  data={rows}\n/>`),
  true,
);
check(
  "Component with spread prop",
  fileHasJsxGenericComponent(`<Grid<any> {...gridProps} />`),
  true,
);
check(
  "Self-closing no props (space)",
  fileHasJsxGenericComponent(`<Widget<any> />`),
  true,
);
check(
  "Self-closing no props (no space)",
  fileHasJsxGenericComponent(`<Widget<any>/>`),
  true,
);

// --- POSITIVES: NAMED JSX generics also break the preview, MUST flag ----
// (cartographer mangles EVERY component type arg, named or `any`.)
check(
  "named JSX generic with props",
  fileHasJsxGenericComponent(`<DataTable<MyRow> columns={cols} data={rows} />`),
  true,
);
check(
  "named JSX generic self-closing",
  fileHasJsxGenericComponent(`<EntityEditDialog<PolicyEditForm> open={o} />`),
  true,
);
check(
  "named JSX generic indexed-access type arg",
  fileHasJsxGenericComponent(`<DataTable<SummaryResp["recent"][number]> columns={cols} data={rows} />`),
  true,
);
check(
  "named JSX generic multi-line opening tag",
  fileHasJsxGenericComponent(`<EntityEditDialog<PolicyEditForm>\n  open={o}\n  schema={s}\n/>`),
  true,
);

// --- NEGATIVES: TYPE positions, never a JSX call -----------------------
check(
  "useMemo type annotation",
  fileHasJsxGenericComponent(`const cols = useMemo<DataTableColumn<any>[]>(() => [], []);`),
  false,
);
check(
  "useMemo named type annotation",
  fileHasJsxGenericComponent(`const cols = useMemo<DataTableColumn<MyRow>[]>(() => [], []);`),
  false,
);
check(
  ".map generic type arg",
  fileHasJsxGenericComponent(`...fields.map<DataTableColumn<any>>((f) => ({ key: f.name }))`),
  false,
);
check(
  ".map named generic type arg",
  fileHasJsxGenericComponent(`...fields.map<DataTableColumn<MyRow>>((f) => ({ key: f.name }))`),
  false,
);
check(
  "useState generic type arg",
  fileHasJsxGenericComponent(`const [s, set] = useState<Foo<any>>();`),
  false,
);
check(
  "Record type with trailing space",
  fileHasJsxGenericComponent(`type T = Record<string, Foo<any> >;`),
  false,
);
check(
  "as-cast",
  fileHasJsxGenericComponent(`const x = y as Foo<any>;`),
  false,
);
check(
  "as-cast named",
  fileHasJsxGenericComponent(`const x = y as Foo<MyRow>;`),
  false,
);
check(
  "Array generic type",
  fileHasJsxGenericComponent(`let arr: Array<Foo<any>> = [];`),
  false,
);

// --- NEGATIVES: plain JSX, no generic ----------------------------------
check(
  "plain component",
  fileHasJsxGenericComponent(`<DataTable columns={cols} data={rows} />`),
  false,
);

if (fail) {
  console.error(`\n[check:jsx-generic-component:tests] FAIL — ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`[check:jsx-generic-component:tests] OK — ${pass} passed`);
