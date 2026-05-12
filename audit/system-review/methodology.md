# منهجية المراجعة الشاملة للنظام
# System-Wide Audit Methodology

> **المرجع الكامل:** `/root/.claude/plans/resilient-twirling-crab.md`
> **الفرع:** `claude/system-review-integration-ADPD8`
> **النطاق:** 415 ملف صفحة، 83 ملف routes، 20 وحدة (بما فيها بوابتين خارجيتين)

---

## المحاور الخمسة لكل صفحة

| المحور | السؤال | الإثبات |
|--------|--------|---------|
| **A. الميتاداتا** | أين الصفحة، أي وحدة، أي صلاحية، أي كيان؟ | `routes/*Routes.tsx` + ملف الصفحة + `lib/db/src/schema/index.ts` |
| **B. الأزرار** | كل CTA → API endpoint؟ صلاحية؟ audit؟ lifecycle؟ notification؟ | `useApiMutation` + handlers في الصفحة + routes في api-server |
| **C. الحركات ذات الصلة** | هل الإجراء يولّد القيد/الخصم/الإشعار/التحديث المتوقّع في وحدات أخرى؟ | `docs/blueprints/<module>.md` + `entity-action-matrix.md` |
| **D. النمذجة** | جدول DB موجود؟ tenant/audit/FK/lifecycle/soft-delete؟ | schema + `audit:schema`, `check:ghost-rows` |
| **E. البيانات الثابتة** | لا قوائم mock؟ لا نصوص خارج i18n؟ لا أرقام افتراضية؟ | `hardcoded-data-scan.mjs` + مراجعة بصرية |

كل صفحة تحصل على **Verdict**: ✅ مغلق / ⚠ يحتاج إصلاح / 🔴 حرج / ⏸ غير قابل للوصول.

---

## أداة جمع البيانات

| الأداة | المسار | الإخراج |
|--------|--------|---------|
| فهرس الصفحات | `tooling/page-inventory.mjs` | `tooling/_page-inventory.json` |
| مسح الأزرار | `tooling/button-handler-scan.mjs` | `tooling/_buttons-by-page.json` |
| ربط Audit | `tooling/api-to-audit-map.mjs` | `tooling/_api-audit.json` |
| ربط Schema | `tooling/schema-link.mjs` | `tooling/_schema-by-entity.json` |
| البيانات الثابتة | `tooling/hardcoded-data-scan.mjs` | `tooling/_hardcoded-hits.json` |
| الدمج | `tooling/merge-runtime-results.mjs` | تحديث verdicts من runtime audit |

تشغيل السلسلة: `node audit/system-review/tooling/run-all.mjs`

---

## قالب ورقة المراجعة

كل ملف `modules/<module>/<page>.md` يتبع البنية المذكورة في الخطة الرئيسية (الأقسام 1-6).
أي حقل `TBD` يعني الصفحة غير مكتملة المراجعة.

---

## ترتيب الموجات

1. **🔴 Wave 1**: finance + hr + governance
2. **🟠 Wave 2**: properties + fleet + store + warehouse + legal + umrah
3. **🟡 Wave 3**: crm + projects + support + communications
4. **🟢 Wave 4**: bi + documents + requests + my-space + misc
5. **🟣 Wave 5**: admin + settings + careers-portal + client-portal

كل موجة تنتهي بـ:
- تشغيل `pnpm run audit:runtime`.
- تحديث `INDEX.md` بـ KPIs.
- PR على `claude/system-review-integration-ADPD8`.
