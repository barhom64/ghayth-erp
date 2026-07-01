// اختبارات حارس المكوّن القانوني مقابل بديله الخام (السجلّ المُعمَّم).
// التشغيل: node scripts/src/check-canonical-component-pairs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { usesIdentifier, violationsFor, PAIRS, assertScannedNonEmpty } from "./check-canonical-component-pairs.mjs";

const P = [{ id: "demo", canonical: "Canon", raw: "Raw", reason: "r" }];

test("usesIdentifier كلمة كاملة لا تطابق جزئيًا", () => {
  assert.ok(usesIdentifier("<Canon/>", "Canon"));
  assert.ok(!usesIdentifier("<CanonExtra/>", "Canon"));
});

test("violationsFor يرصد التعايش فقط", () => {
  const v = violationsFor([
    { name: "both.tsx", content: "<Canon/> ... <Raw/>" },
    { name: "canon-only.tsx", content: "<Canon/>" },
    { name: "raw-only.tsx", content: "<Raw/>" },
  ], P);
  assert.deepEqual(v.map((x) => x.file), ["both.tsx"]);
});

test("الأساس يستثني المفتاح id:file", () => {
  const v = violationsFor(
    [{ name: "both.tsx", content: "<Canon/><Raw/>" }],
    P,
    new Set(["demo:both.tsx"]),
  );
  assert.deepEqual(v, []);
});

test("assertScannedNonEmpty يفشل مغلقًا على صفر ملف (ملاحظة Codex)", () => {
  assert.throws(() => assertScannedNonEmpty(0));
  assert.doesNotThrow(() => assertScannedNonEmpty(5));
});

test("السجلّ الفعلي يحوي زوج المرفقات المالية", () => {
  const att = PAIRS.find((p) => p.id === "financial-attachment");
  assert.ok(att);
  assert.equal(att.canonical, "FinancialAttachmentViewer");
  assert.equal(att.raw, "FileDropZone");
});

test("زوج المرفقات: تعايش يُرصد، واستيراد النوع وحده لا يُرصد", () => {
  const real = PAIRS.filter((p) => p.id === "financial-attachment");
  assert.equal(violationsFor([{ name: "x.tsx", content: "<FinancialAttachmentViewer/>\n<FileDropZone/>" }], real).length, 1);
  assert.equal(violationsFor([{ name: "y.tsx", content: '<FinancialAttachmentViewer/>\nimport { type Attachment } from "@/components/shared/file-drop-zone";' }], real).length, 0);
});
