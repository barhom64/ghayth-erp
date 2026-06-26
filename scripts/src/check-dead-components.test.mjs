// اختبارات حارس المكوّنات الميتة/غير المستخدمة.
// التشغيل: node scripts/src/check-dead-components.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSpecifiers, resolveSpecifier, relativeJoin, isCandidate, isRouteFile, deadFrom, stripComments, assertScannedNonEmpty, externalSrcTargets } from "./check-dead-components.mjs";

test("assertScannedNonEmpty يفشل مغلقًا على صفر ملف (ملاحظة Codex)", () => {
  assert.throws(() => assertScannedNonEmpty(0));
  assert.doesNotThrow(() => assertScannedNonEmpty(7));
});

test("externalSrcTargets يستخرج مسار SRC من إعادة تصدير kit (lib/*)", () => {
  assert.deepEqual(
    externalSrcTargets('export { PageHeader } from "../../../artifacts/ghayth-erp/src/components/page-header";'),
    ["components/page-header"],
  );
  assert.deepEqual(externalSrcTargets('import x from "react";'), []);
});

test("deadFrom: المكوّن المُعاد تصديره من kit ليس يتيمًا (تصحيح #3007)", () => {
  const files = {
    "components/page-header.tsx": "export function PageHeader(){ return null; }",
    "components/orphan.tsx": "export function O(){ return null; }",
  };
  assert.deepEqual(deadFrom(files), ["components/orphan.tsx", "components/page-header.tsx"]);
  assert.deepEqual(deadFrom(files, ["components/page-header"]), ["components/orphan.tsx"]);
});

test("extractSpecifiers يلتقط import/export/dynamic", () => {
  const specs = extractSpecifiers([
    'import { A } from "@/components/a";',
    'export { B } from "./b";',
    'const C = lazy(() => import("@/pages/c"));',
    'import "@/styles/x.css";',
  ].join("\n"));
  assert.ok(specs.includes("@/components/a"));
  assert.ok(specs.includes("./b"));
  assert.ok(specs.includes("@/pages/c"));
  assert.ok(specs.includes("@/styles/x.css"));
});

test("extractSpecifiers يتجاهل المراجع المعلَّقة (ثغرة Codex)", () => {
  const specs = extractSpecifiers([
    'import { Real } from "@/components/real";',
    '// import { X } from "@/components/commented-line";',
    '/* const Y = lazy(() => import("@/pages/commented-block")); */',
    '{/* <Foo/> from import("@/components/jsx-commented") */}',
  ].join("\n"));
  assert.ok(specs.includes("@/components/real"));
  assert.ok(!specs.includes("@/components/commented-line"));
  assert.ok(!specs.includes("@/pages/commented-block"));
  assert.ok(!specs.includes("@/components/jsx-commented"));
});

test("stripComments لا يمسّ ://", () => {
  assert.ok(stripComments('const u = "https://x.test/p";').includes("https://x.test/p"));
});

test("relativeJoin يحلّ ../ و ./", () => {
  assert.equal(relativeJoin("pages/create", "../detail/x"), "pages/detail/x");
  assert.equal(relativeJoin("components", "./shared/y"), "components/shared/y");
});

test("resolveSpecifier يحلّ @/ والنسبي إلى مسار معروف", () => {
  const known = new Set(["components/a.tsx", "pages/detail/x.ts", "components/shared/y/index.tsx"]);
  assert.equal(resolveSpecifier("@/components/a", "pages/p.tsx", known), "components/a.tsx");
  assert.equal(resolveSpecifier("../detail/x", "pages/create/c.tsx", known), "pages/detail/x.ts");
  assert.equal(resolveSpecifier("@/components/shared/y", "pages/p.tsx", known), "components/shared/y/index.tsx");
  assert.equal(resolveSpecifier("react", "pages/p.tsx", known), null); // خارجي
});

test("isCandidate/isRouteFile", () => {
  assert.ok(isCandidate("components/shared/x.tsx"));
  assert.ok(isCandidate("pages/finance/y.tsx"));
  assert.ok(!isCandidate("components/shared/x.test.tsx")); // اختبار
  assert.ok(!isCandidate("lib/util.ts"));                  // ليس مكوّنًا
  assert.ok(!isCandidate("App.tsx"));                       // نقطة دخول
  assert.ok(!isCandidate("routes/miscRoutes.tsx"));         // ملف مسارات
  assert.ok(isRouteFile("routes/fleetRoutes.tsx"));
});

test("deadFrom يرصد اليتيم ويستثني المستورَد (ولو من اختبار/مسار)", () => {
  const files = {
    "routes/r.tsx": 'const P = lazy(() => import("@/pages/used-page"));',
    "pages/used-page.tsx": "export default function P(){ return null; }",
    "pages/orphan-page.tsx": "export default function O(){ return null; }",
    "components/used-by-test.tsx": "export const U = 1;",
    "components/used-by-test.test.tsx": 'import { U } from "@/components/used-by-test";',
  };
  // orphan-page غير مستورد؛ used-page مستورد من المسار؛ used-by-test مستورد من اختباره
  assert.deepEqual(deadFrom(files), ["pages/orphan-page.tsx"]);
});
