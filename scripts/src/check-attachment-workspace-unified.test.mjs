// اختبارات حارس «لوحة المرفق المالي الموحّدة».
// التشغيل: node scripts/src/check-attachment-workspace-unified.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { usesViewer, usesDropZone, isViolation, violationsFrom } from "./check-attachment-workspace-unified.mjs";

test("usesViewer يرصد المكوّن", () => {
  assert.ok(usesViewer('<FinancialAttachmentViewer mode="create" />'));
  assert.ok(!usesViewer('<FileDropZone files={x} />'));
});

test("usesDropZone يرصد المكوّن لا استيراد النوع", () => {
  assert.ok(usesDropZone('<FileDropZone files={x} maxSizeMB={2} />'));
  // استيراد النوع فقط ليس استخدامًا للمكوّن
  assert.ok(!usesDropZone('import { type Attachment } from "@/components/shared/file-drop-zone";'));
});

test("isViolation فقط عند الجمع بين الاثنين", () => {
  assert.ok(isViolation('<FinancialAttachmentViewer/>\n<FileDropZone/>'));
  assert.ok(!isViolation('<FinancialAttachmentViewer/> only'));
  assert.ok(!isViolation('<FileDropZone/> only'));
  // اللوحة + استيراد النوع فقط = ليست مخالفة (الحالة بعد إصلاح #2975)
  assert.ok(!isViolation('<FinancialAttachmentViewer/>\nimport { type Attachment } from "x/file-drop-zone";'));
});

test("violationsFrom يرجع المخالفين خارج الأساس مرتّبين", () => {
  assert.deepEqual(
    violationsFrom([
      { name: "b.tsx", content: '<FinancialAttachmentViewer/><FileDropZone/>' },
      { name: "a.tsx", content: '<FinancialAttachmentViewer/><FileDropZone/>' },
      { name: "c.tsx", content: '<FinancialAttachmentViewer/>' },
    ]),
    ["a.tsx", "b.tsx"],
  );
});

test("الأساس المجمّد يُستثنى", () => {
  assert.deepEqual(
    violationsFrom(
      [{ name: "legacy.tsx", content: '<FinancialAttachmentViewer/><FileDropZone/>' }],
      new Set(["legacy.tsx"]),
    ),
    [],
  );
});
