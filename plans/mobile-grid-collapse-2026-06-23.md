# تعميم: شبكات الإحصاء المزدحمة على الجوال — collapse responsive

التاريخ: 2026-06-23 · المالك: حارس الجودة · النطاق: نظام-واسع (مراجعة الواجهات)

## الفكرة
Tailwind «الجوال أولًا»: أي `grid-cols-N` **بلا بادئة استجابة** هو تخطيط الجوال نفسه.
`grid-cols-4 md:grid-cols-6` يبقى 4 أعمدة على الجوال. لذا أي `grid-cols-N` (N≥4) عارية
على بطاقات إحصاء/حقول إدخال = ازدحام فعلي على الجوال (≈70px للعمود على 360px).

## علامة الانطباق
`grid grid-cols-{4,5}` عارية (بلا `sm:`/`md:`/`lg:`) تحتوي بطاقات إحصاء أو حقول إدخال.

## علامة المخالفة / الاستثناءات (false positives — لا تُلمس)
- تقاويم `grid-cols-7` (أيام الأسبوع) — نمط معياري مقصود.
- صفوف مفتاح/قيمة (`col-span-2`) — عمودان بصريًّا فقط.
- حاويات `min-w-[..]` ذات تمرير أفقي.
- صفحات `guide`/`mock`/`preview`.
- تصوّر بياني مقصود (insights الأنماط الموسمية `grid-cols-12` = شريط 12 شهرًا).
- جداول مُحاكاة بـ grid (ar-aging totals · project-costing) → إصلاح أكبر (DataTable/footer) خارج هذه الدفعة.
- `TabsList grid-cols-{4,5,6}` → قرار بصري منفصل خارج هذه الدفعة.

## الشكل المُصحَّح (idiom البيت — 169+37 استخدامًا قائمًا)
- 4 أعمدة → `grid-cols-2 md:grid-cols-4`
- 5 أعمدة → `grid-cols-2 md:grid-cols-5`

## الدفعة 1 (تشغيلية · صفر منطق أعمال · صفر دفتر · className فقط) — 11 موضعًا
خمسة أعمدة → `grid-cols-2 md:grid-cols-5`:
1. finance/bad-debt.tsx:172 (نسب المخصص لكل شريحة عمر)
2. finance/customer-360-sheet.tsx:377 (أعمار الفواتير)
3. finance/vendor-360-sheet.tsx:379 (أعمار أوامر الشراء)
4. hr/evaluation-360-peer.tsx:144 (بطاقات النتيجة الآلية)
5. finance/reports.tsx:246 (أرصدة حسب النوع)
6. admin/attendance-categories.tsx:298 (سلّم الخصومات 1→5)

أربعة أعمدة → `grid-cols-2 md:grid-cols-4`:
7. finance/ledger.tsx:104 (إحصاء القيود)
8. create/hr/overtime-create.tsx:203 (ملخص تكلفة الإضافي)
9. manager-board.tsx:302 (عدّاد الحضور)
10. projects/gantt.tsx:102 (إحصاء المشروع)
11. admin-ai-governance.tsx:1092 (مقاييس المحاكاة داخل حوار)

## العيوب كقيود اختبار
- لا يتغيّر أي منطق/استعلام/صلاحية/قيد — diff كله className.
- guard كامل أخضر (typecheck + lint + tests + الحُرّاس).
- لا كسر لـ check-responsive-tables / check-display-tables.

## المتبقّي (تقرير لا تنفيذ في هذه الدفعة)
- ar-aging totals strip → ترحيل إلى DataTable `footer`.
- project-costing جدول grid مُحاكى → DataTable (بطاقات جوال).
- TabsList المزدحمة → قرار بصري (تمرير/التفاف).
