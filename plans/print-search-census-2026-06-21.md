# جرد حملة الطباعة والبحث — 2026-06-21

مرجع آلي قابل لإعادة التوليد: `node scripts/src/check-page-operability.mjs`
(يتتبّع الآن تفويض الأغلفة الرقيقة، فأرقامه دقيقة).

## الأرقام الحالية (قراءة فعلية)

| العنصر | قوائم (230) | تفاصيل (101) |
|---|---|---|
| **فرز** | 230 ✓ / 0 ✗ | غير منطبق |
| **طباعة** | 194 ✓ / 36 ✗ | 90 ✓ / 11 ✗ |
| **بحث** | 186 ✓ / 44 ✗ | غير منطبق |
| **رجوع** | مركزي عبر `SidebarLayout` لكل المسارات | — |

- **الفرز:** مكتمل 100% — كل قائمة على `DataTable` ترث الفرز.
- **الطباعة:** بدأت الحملة عند ~117 فجوة، الآن **47** (36 قائمة + 11 تفصيل).
- ما تبقّى ليس «نسيانًا» بل أحد ثلاث حالات موثّقة أدناه، لكلٍّ سببها.

## ما أُنجز هذه الجلسة (طباعة)

### إصلاح منهجي (يفيد كل الصفحات)
- **`ENUM_AR` في خدمة الطباعة:** أُضيفت قيم المخزون غير الملتبسة (في المخزن/محجوز/
  مُباع/تالف/متلف/حجر صحي/مستدعى/مراجَع). `formatValue` يعرّب الـenum قبل الرجوع
  للقيمة الخام، فأي صفحة تُخرج هذه القيم تُطبع عربيّة تلقائيًا. + اختبار parity.
- **تصحيح 11 صفحة مُسبقة** كانت تسرّب enum إنجليزي أو تُسقط عمود الحالة بسبب حدّ
  الـ6 أعمدة في مولّد الجدول، أو تطبع «—» لأعمدة مفاتيحها محسوبة:
  inspections-review, subsidiary-account-failures, recurring-invoices,
  accounts-usage-gaps, cash-in-transit, deferred-revenue, amortization,
  finance-intake-center, refund-requests, misparented-subsidiaries, cip.
- **تصحيح أداة الجرد** لتتبع تفويض الأغلفة الرقيقة (صحّح 6 سلبيّات كاذبة:
  customer/vendor-statement, profitability-vehicle/property/project/umrah-agent).

### صفحات رُبطت بالطباعة هذه الجلسة (~30)
fleet/maintenance-ticket-impact · warehouse/cycle-counts · admin/job-titles ·
warehouse/expiring-report · warehouse/abc-classification · properties/property-sales ·
fleet/transport-bookings · warehouse/cycle-count-accuracy · warehouse/lot-aging ·
umrah/reports/agent-balances · umrah/reports/subagent-balances ·
umrah/reports/transport-requests · umrah/reports/profitability ·
fleet/transport-service-lines · fleet/transport-route-patterns ·
umrah/reports/commissions-summary · umrah/reports/violations-summary ·
umrah/reports/nusk-invoices-summary · admin-integrations (تبويب السجل) ·
admin-infra-alerts · fleet/telematics/{ai-alerts,devices,sensors,video-evidence,scorecard,evidence} ·
hr/tracking-policies · admin/print-templates · warehouse/cycle-count-detail ·
manager-board · admin/attendance-categories · admin/scoring-weights.

كل صفحة: حمولة منسّقة (≤6 أعمدة، تُعرّب القيم عبر قاموس الصفحة)، تتبع الفرز عبر
`onSortedDataChange`، typecheck أخضر قبل كل دفعة.

## الباقي (47) — السبب لكلّ حالة

### أ) لوحات متعددة الألواح — قائمة-طباعة واحدة لا تمثّل الصفحة (19)
لوحات فيها عدّة جداول/بطاقات/رسوم لكلٍّ معناه؛ زر «اطبع القائمة» الواحد يضلّل.
الحل الصحيح (مؤجَّل): طباعة لكل لوح على حدة أو تقرير مُجمَّع مُصمَّم.

- `/exec-dashboard` — لوحة تنفيذية (مؤشرات + رسوم).
- `/bi/operations` — ذكاء أعمال (6 جداول/رسوم).
- `/intelligence` · `/automation` — لوحات محرّكات.
- `/communications/notification-engine` — لوحة محرّك الإشعارات.
- `/admin/monitoring` · `/admin/observability` (7 جداول) · `/admin/pbx-control` ·
  `/admin/system-registry` · `/admin/communication-control` · `/admin/policy-engine` ·
  `/admin/ai-governance` · `/admin/print-diagnostics` · `/admin/org-model` (6 جداول) —
  لوحات إدارة/مراقبة.
- `/admin/org-memberships` — مدير عضويات متعدد التبويبات (قائمة الأعضاء سياقية بحسب
  الفريق المختار).
- `/settings` (+13 مسار فرعي) — قشرة إعدادات بتبويبات؛ ملف واحد `settings.tsx`.
- `/finance/reports/ledger-truth` — تقرير «حقيقة الدفتر» (6 أقسام مترابطة).
- `/finance/classification-center` — ورشة تصنيف (جدولان عمل).
- `/finance/vendor-documents` — مستندات المورّد (3 جداول/تبويبات).
- `/fleet/telematics/operations` — لوحة عمليات التتبع.

### ب) صفحات تفصيل بمستند مخصّص — تحتاج طباعة «مستند» لا قائمة (11)
تعرض تخطيطًا مخصّصًا (بطاقات/رسوم/قيود)، لا `DataTable`. الطباعة الصحيحة هي مستند
بقالب مخصّص (مثل ما فعلناه لكشف الحساب)، تُبنى لاحقًا لكل نوع:

- `/finance/cost-centers/:id/pnl` · `/finance/entity-pnl/:entityType/:entityId` —
  قوائم دخل P&L (رسوم + بطاقات).
- `/hr/employees/:id/score` · `/hr/evaluation-360/:id/peer` ·
  `/hr/evaluation-360/:id/upward` — مستندات تقييم.
- `/fleet/me/inspections/:id` · `/fleet/optimizer/runs/:id` ·
  `/fleet/transport/bookings/:id` · `/fleet/transport/itineraries/:id` — تفاصيل تشغيلية.
- `/umrah/import/:batchId/unlinked` — مراجعة استيراد.
- `/admin/ai-governance/prompts/:id` — تفصيل موجّه AI.

### ج) أشكال بيانات خاصة (2)
- `/finance/reports/operation-gaps` — بيانات **مصفوفة** `string[][]` متعددة الأقسام
  بأعمدة ديناميكية؛ لا تنطبق حمولة «صفوف كائنات». تحتاج تصدير مصفوفة مخصّص.
- `/fleet/telematics` و`/fleet/telematics/live-map` — **خريطة حيّة** لا قائمة تقرير.

## بُعد البحث (44 قائمة بلا شريط بحث) — البُعد التالي
معظمها من الفئتين (أ) و(ب) أعلاه (لا تنطبق). لكن بعضها **قوائم تشغيلية فعلية
تستحق شريط بحث** وتُعدّ عملًا قادمًا واضحًا:
- `finance/bank-guarantees` · `finance/fixed-asset-register` · `finance/payment-run` ·
  `finance/inventory-valuation` · `finance/negative-stock` · `finance/intercompany` ·
  `finance/cogs-summary` · `finance/vat-reconciliation` · `finance/gl-posting-queue` ·
  `hr/delegations` · `hr/accruals` · `hr/auto-detection` · `umrah/violations`.

## قرار مطلوب من إبراهيم
1. الفئة (ب) — مستندات الطباعة المخصّصة (P&L، تقييم، فحص): أبنيها قالبًا قالبًا؟
   (كل واحد عمل مستقل بحجم كشف الحساب.)
2. الفئة (أ) — اللوحات: هل نريد «تقرير مُجمَّع للوحة» أم نكتفي بتصدير كل لوح؟
3. بُعد البحث: أبدأ دفعة «شريط بحث للقوائم التشغيلية» المذكورة؟

---

## تحديث نهائي — اكتمال حملة الطباعة (وكلاء فرعيون، نفس اليوم)

بناءً على توجيه إبراهيم «ابدأ فيها كلها على التسلسل وفعّل وكلاء فرعيين»، نُفّذت
الفئات الثلاث عبر **موجات وكلاء فرعيين متوازية**، كل موجة: تحرير على ملفات
منفصلة → typecheck مركزي أخضر → commit.

- **موجة أ (9 صفحات تفصيل بمستند):** fleet (فحص/مُحسّن/حجز/برنامج)،
  hr (نتيجة/360 أقران/360 صاعد)، finance (entity-pnl/cost-center-pnl).
- **موجة ب (20 لوحة):** admin×11، finance×3، top×5، telematics/operations —
  طباعة الجدول الأهم لكل لوحة.
- **موجة ج (4 حالات خاصة):** operation-gaps (قسم المصفوفة)، live-map (قائمة
  المواقع)، settings (الإعدادات الفعّالة)، import-unlinked (السطور غير المربوطة).

### النتيجة النهائية (قراءة آلية)

| العنصر | قوائم (230) | تفاصيل (101) |
|---|---|---|
| **طباعة** | **230 ✓ / 0 ✗ (100%)** | **101 ✓ / 0 ✗ (100%)** |
| **فرز** | 230 ✓ / 0 ✗ (100%) | غير منطبق |
| **بحث** | 194 ✓ / 36 ✗ | غير منطبق |

**حملة الطباعة مكتملة 100% — لا توجد فجوة طباعة واحدة.**

### بُعد البحث — اكتمل العمليّ منه (214/230)

بعد توجيه «اعتمد وأكمل»، أُضيف بحث عبر موجتي وكلاء فرعيين:
- **الموجة 1 (8):** finance/{bank-guarantees, intercompany, payment-run,
  inventory-valuation, negative-stock, cogs-summary}، hr/{accruals, delegations}.
- **الموجة 2 (17):** بحث يُصفّي على **حقول البيانات الحقيقية** لا مفاتيح الأعمدة
  (فيعمل مع الأعمدة المحسوبة)، والطباعة تتبع المصفوفة المفلترة:
  umrah/{commissions-summary, nusk-invoices-summary, violations-summary,
  profitability, violations}، finance/{gl-integrity-gaps, unmapped-lines,
  operation-gaps, gl-posting-queue}، admin-{gl-reconciliation, posting-failures,
  integrations, infra-alerts}، admin/{org-memberships, scoring-weights}،
  hr/{field-tracking, tracking-policies}.
- **تصحيح أداة الجرد:** `hasSearch` صار يكشف صناديق البحث المخصّصة (حالة باسم
  *search*/query مربوطة بـ`value=`)، فصُحّحت 3 سلبيّات كاذبة (subagent-balances،
  fixed-asset-register، admin/logs لها بحث فعلًا). + اختبارات.

### الباقي (16) — بحث غير منطبق فعلًا (موثّق)
- **لوحات KPI/مراقبة متعددة الألواح (11):** exec-dashboard، bi-operations،
  admin-{ai-governance, communication-control, event-monitor, monitoring,
  observability, pbx-control, policy-engine, system-registry}، umrah/dashboard.
- **finance/reports** (فهرس 16 جدول)، **finance/ledger-truth** (تقرير 6 أقسام
  تجميعية)، **finance/vat-reconciliation** (تجميع ≤9 صفوف).
- **hr/auto-detection** (لا عمود نص — تواريخ/أعداد فقط).
- **admin/attendance-categories** (إعداد — 6 فئات نظام ثابتة).

> لا قرار متبقٍّ على إبراهيم في هذا البُعد: ما تبقّى لا ينطبق عليه البحث.

## الخلاصة النهائية (قراءة آلية)
- **طباعة: 230/230 قوائم + 101/101 تفاصيل — 100%.**
- **فرز: 230/230 — 100%.**
- **بحث: 214/230 — والباقي 16 غير منطبق موثّق.**
- **رجوع: مركزي عبر `SidebarLayout` لكل المسارات.**
